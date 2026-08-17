/**
 * WAR — the orchestration phase.
 *
 * docs/AGGRESSION-DOCTRINE.md is the spec. This is step 1 of §6's build order:
 * intel + reach + scoring, running live but INERT — it observes, records and
 * ranks, and gives no orders. Nothing in this file spawns a creep, moves a
 * creep, or changes any existing behaviour. That is deliberate: the target list
 * has to be provably sane on the live shard before anything acts on it.
 *
 * CPU contract (shard 3, ~20/tick):
 *   - ingest:  <= 2 foreign rooms per tick, each a couple of find() calls
 *   - scoring: cached, recomputed at most every 50 ticks
 *   - save:    a JSON.stringify spike at most every 100 ticks, bucket-gated
 * Everything else is heap lookups. Budget: well under 0.5 CPU/tick average.
 */

import { ensureIntel, runIntelIngest, saveIntel, intelSummary, intelLine, getIntel, allIntel } from "./intel";
import { reachSummary, groundTargets, nukeCandidates, ownedRooms, nukerRooms } from "./reach";
import { targets, targetTable, scoreRoom, scoutQueue, tuning, allies, isAlly, DEFAULT_TUNING, invalidateTuning } from "./score";
import { refreshModes, modeTable } from "./mode";
import { reinforceStatus } from "./reinforce";
import { runDispatch, explainKit, dispatchLog, diaryTable } from "./dispatch";

/** Lazy Memory bootstrap — the codebase convention (there is no central one). */
function warMemory(): any {
  const M = Memory as any;
  if (!M.war) M.war = {};
  return M.war;
}

/**
 * The war phase. Cheap, defensive, and currently observation-only.
 */
export function runWar(): void {
  const mem = warMemory();
  if (mem.off) return;

  // Segment may not be readable this tick — ensureIntel handles that by
  // running on an empty table rather than failing.
  ensureIntel();

  // FREE ingest: record rooms we already have vision of, rate-limited.
  runIntelIngest();

  // Persist on an interval; the call self-gates on dirty/bucket/interval.
  saveIntel();

  refreshModes();
  runDispatch();
}

/* ------------------------------------------------------------------ */
/* Console surface                                                     */
/*                                                                     */
/* The whole point of step 1 is being able to LOOK at what the bot      */
/* thinks before letting it act. These are the eyes.                   */
/* ------------------------------------------------------------------ */

export function installWarCommands(): void {
  const g = global as any;
  if (g.__warCommandsInstalled) return;
  g.__warCommandsInstalled = true;

  /** Overall state of the war machine. */
  g.war = function (): string {
    const mem = warMemory();
    const list = targets();
    const nukes = nukeCandidates();
    let nukeCount = 0;
    for (const _k in nukes) nukeCount++;
    return [
      `=== WAR ===`,
      `status:  ${mem.off ? "OFF" : mem.dispatch === false ? "ON (intel only, dispatch off)" : "ON (dispatch live)"}`,
      `         ${dispatchLog()}`,
      `reach:   ${reachSummary()}`,
      `intel:   ${intelSummary()}`,
      `targets: ${list.length} scored | best=${list.length ? list[0].room + " " + list[0].score.toFixed(1) : "-"}`,
      `nukes:   ${nukeCount} rooms in range of ${nukerRooms().length} silo(s)`,
      `allies:  ${allies().join(", ") || "(none — doctrine literal)"}`,
      `footing: ${mem.footing ? "ON" : "off"}  throttle=${mem.throttle ? "ON" : "off"}`,
      `         ${reinforceStatus()}`,
      ``,
      `commands: warTargets(n) warIntel(room) warWhy(room) warScouts(n)`,
      `          warNukes() warAllies([...]) warTune(k,v) warSave() warOff()/warOn()`,
      `          warModes() warFooting(on?) warThrottle(on?) warKit(room) warDiary() segs()`,
    ].join("\n");
  };

  /** Ranked target list. */
  g.warTargets = function (n?: number): string {
    return targetTable(typeof n === "number" ? n : 20);
  };

  /** Raw intel record for one room. */
  g.warIntel = function (roomName: string): string {
    if (!roomName) return "usage: warIntel('E12S3')";
    const rec = getIntel(roomName);
    if (!rec) return `${roomName}: (never seen)`;
    return intelLine(roomName) + "\n" + JSON.stringify(rec);
  };

  /** Full score breakdown for one room — why is it ranked where it is. */
  g.warWhy = function (roomName: string): string {
    if (!roomName) return "usage: warWhy('E12S3')";
    const s = scoreRoom(roomName);
    if (!s) return `${roomName}: not in reach (or not a normal room)`;
    return [
      `${s.room}  distance=${s.d}  age=${s.age === Infinity ? "never seen" : s.age}`,
      `  value       = ${s.value.toFixed(1)}`,
      `  vulnerable  = ${s.vuln.toFixed(3)}`,
      `  distanceMul = ${s.df.toFixed(3)}`,
      `  SCORE       = ${s.score.toFixed(1)}`,
      `  tier        = ${s.tier}`,
      `  why         = ${s.why}`,
    ].join("\n");
  };

  /** What the observer SHOULD be looking at (vs its current fixed round-robin). */
  g.warScouts = function (n?: number): string {
    const q = scoutQueue(1000);
    const limit = typeof n === "number" ? n : 20;
    return [
      `${q.length} rooms in reach are stale/unseen (closest first):`,
      "  " + q.slice(0, limit).join(" "),
    ].join("\n");
  };

  /** Nuke candidacy map — doctrine §1, range 10 from any silo. */
  g.warNukes = function (): string {
    const map = nukeCandidates();
    const rows: string[] = [];
    for (const target in map) {
      const rec = getIntel(target);
      if (!rec || !rec.o) continue; // only owned rooms are worth a nuke
      if (isAlly(rec.o)) continue;
      rows.push(`  ${target} <- ${map[target]}  ${intelLine(target)}`);
    }
    if (!rows.length) return `no owned enemy rooms currently in nuke range (silos: ${nukerRooms().join(", ") || "none"})`;
    return `nuke candidates (${rows.length}):\n` + rows.join("\n");
  };

  /**
   * Read or set the do-not-attack list.
   *   warAllies()        -> show
   *   warAllies([])      -> doctrine literal: everyone is an enemy
   *   warAllies(['bob']) -> spare bob
   */
  g.warAllies = function (list?: string[]): string {
    const mem = warMemory();
    if (list === undefined) return `allies: ${allies().join(", ") || "(none)"}`;
    if (!(list instanceof Array)) return "usage: warAllies(['name', ...]) or warAllies([])";
    mem.allies = list;
    targets(true);
    return `allies set: ${list.join(", ") || "(none — everyone is an enemy)"}`;
  };

  /** Live-tune the scoring constants without a deploy. */
  g.warTune = function (key?: string, value?: number): string {
    const mem = warMemory();
    if (!mem.tune) mem.tune = {};
    if (key === undefined) {
      const t = tuning();
      const rows: string[] = ["war tuning (default -> current):"];
      for (const k in DEFAULT_TUNING) {
        rows.push(`  ${k.padEnd(16)} ${String((DEFAULT_TUNING as any)[k]).padEnd(12)} -> ${(t as any)[k]}`);
      }
      return rows.join("\n");
    }
    // hasOwnProperty, not `in`: `'toString' in DEFAULT_TUNING` is true via the
    // prototype chain, so `in` would accept warTune('toString', 5) and write a
    // key that tuning()'s own-property loop then silently ignores.
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_TUNING, key)) {
      return `unknown key '${key}'. keys: ${Object.keys(DEFAULT_TUNING).join(" ")}`;
    }
    if (typeof value !== "number") {
      delete mem.tune[key];
      invalidateTuning();
      targets(true);
      return `${key} reset to default ${(DEFAULT_TUNING as any)[key]}`;
    }
    mem.tune[key] = value;
    invalidateTuning(); // the per-tick cache still holds the OLD value
    targets(true); // rescore now so the effect is immediately visible
    return `${key} = ${value}`;
  };

  /** Force a segment flush (normally interval + bucket gated). */
  g.warSave = function (): string {
    const ok = saveIntel(true);
    return ok ? `intel saved (${intelSummary()})` : "save skipped (nothing loaded yet)";
  };

  g.warOff = function (): string {
    warMemory().off = true;
    return "war machine OFF — no intel ingest, no scoring";
  };
  g.warOn = function (): string {
    delete warMemory().off;
    return "war machine ON";
  };

  /** Dump every record we hold, oldest first. Debug only — verbose. */
  g.warDump = function (): string {
    const table = allIntel();
    const names: string[] = [];
    for (const n in table) names.push(n);
    names.sort((a, b) => table[a].t - table[b].t);
    const rows = [`${names.length} records:`];
    for (let i = 0; i < names.length; i++) rows.push("  " + intelLine(names[i]));
    return rows.join("\n");
  };

  /** Sanity view of the ground-target set (reach minus SK/highway/closed). */
  g.warGround = function (): string {
    const g2 = groundTargets();
    return `${g2.length} ground-reachable rooms (closest first):\n  ${g2.join(" ")}`;
  };

  /** Which rooms we own, as the war machine sees them. */
  g.warHome = function (): string {
    return `owned: ${ownedRooms().join(", ")}\nsilos: ${nukerRooms().join(", ") || "(none)"}`;
  };

  g.warModes = function (): string {
    return modeTable();
  };

  g.warFooting = function (on?: boolean): string {
    const mem = warMemory();
    if (on === undefined) return `footing=${mem.footing ? "ON" : "off"} (warFooting(true) to put distant rooms in SKELETON)`;
    mem.footing = !!on;
    refreshModes();
    return modeTable();
  };

  g.warThrottle = function (on?: boolean): string {
    const mem = warMemory();
    if (on === undefined) return `throttle=${mem.throttle ? "ON (skeleton rooms skip market/observe/build/remotes)" : "off (display only)"}`;
    mem.throttle = !!on;
    return `throttle=${mem.throttle ? "ON" : "off"}`;
  };

  g.warKit = function (roomName?: string): string {
    if (!roomName) return dispatchLog() + "\nusage: warKit('E12S3')";
    return explainKit(roomName);
  };

  g.warDiary = function (): string {
    return diaryTable();
  };

  g.warDispatch = function (on?: boolean): string {
    const mem = warMemory();
    if (on === undefined) return `dispatch=${mem.dispatch === false ? "OFF" : "ON"}`;
    if (on) delete mem.dispatch;
    else mem.dispatch = false;
    return `dispatch=${mem.dispatch === false ? "OFF" : "ON"}`;
  };
}
