/**
 * WAR / AGGRESSORS — the retaliation ledger (AGGRESSION-DOCTRINE §4.6).
 *
 * "Retaliation is automatic and disproportionate." Until now nothing in the
 * bot remembered WHO hit an owned room: rooms.defence only distinguished
 * Invader from not-Invader, and score.ts had no attacker term. Now every
 * player whose creep sets `danger` in an owned room is written here, and
 * score.ts multiplies every room they own inside reach by AGGRESSOR_MUL for
 * REMEMBER_TICKS. There is no de-escalation state.
 *
 * Lives in Memory.war.aggressors (tiny, capped) — not the intel segment,
 * because it must survive a segment eviction and be one console read away.
 */

export const AGGRESSOR_MUL = 3;
export const REMEMBER_TICKS = 50000;
const CAP = 20;

interface AggressorRec {
  /** last tick a creep of theirs threatened an owned room */
  t: number;
  /** the room they were in */
  r: string;
  /** how many ticks we have logged them, lifetime */
  n: number;
}

function store(): { [name: string]: AggressorRec } {
  const M: any = Memory as any;
  if (!M.war) M.war = {};
  if (!M.war.aggressors) M.war.aggressors = {};
  return M.war.aggressors;
}

export function noteAggressor(username: string | undefined, roomName: string): void {
  if (!username || username === "Invader" || username === "Source Keeper") return;
  const s = store();
  const rec = s[username];
  if (rec) {
    rec.t = Game.time;
    rec.r = roomName;
    rec.n = (rec.n || 0) + 1;
    return;
  }
  s[username] = { t: Game.time, r: roomName, n: 1 };
  const names = Object.keys(s);
  if (names.length > CAP) {
    names.sort((a, b) => s[a].t - s[b].t);
    for (let i = 0; i < names.length - CAP; i++) delete s[names[i]];
  }
}

export function isAggressor(username: string | undefined): boolean {
  if (!username) return false;
  const M: any = Memory as any;
  const rec = M.war && M.war.aggressors && M.war.aggressors[username];
  if (!rec) return false;
  if (Game.time - rec.t > REMEMBER_TICKS) {
    delete M.war.aggressors[username];
    return false;
  }
  return true;
}

export function aggressorTable(): string {
  const s = store();
  const names = Object.keys(s).sort((a, b) => s[b].t - s[a].t);
  if (!names.length) return "aggressors: none on record";
  const rows = [`aggressors (x${AGGRESSOR_MUL} score for ${REMEMBER_TICKS} ticks):`];
  for (const n of names) {
    const r = s[n];
    rows.push(`  ${n.padEnd(20)} last=${r.t} (${Game.time - r.t} ago) in ${r.r} x${r.n}`);
  }
  return rows.join("\n");
}
