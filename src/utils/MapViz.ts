/**
 * MapViz — a `Game.map.visual` overlay for the whole empire. OFF BY DEFAULT.
 *
 * Purpose: answer "what is my empire actually doing right now" from the world
 * map, without opening five rooms and three console commands. Five independent
 * layers, each toggleable:
 *
 *   rooms    every owned room: RCL-coloured tint, RCL + controller progress,
 *            storage energy, spawn count, a `!` when the room is in danger
 *   expand   the live AutoExpand state machine, Memory.target_colonise, and the
 *            ranked expansion candidates from RawMemory segment 86
 *   danger   Memory.rooms[].danger, Memory.AvoidRooms, hot remotes, inbound nukes
 *   remotes  home -> remote links with delivered energy / trip counts from
 *            Memory.rstats (see src/utils/RemoteStats.ts for its shape)
 *   ops      non-economy creeps travelling to another room, grouped by
 *            (from, to, role) and drawn along Game.map.findRoute
 *
 * COST
 * ----
 * Exactly zero when off: the first statement returns unless Memory.mapViz.on.
 * When on, the whole draw is wrapped in Game.cpu.getUsed() deltas and an EMA is
 * kept in Memory.mapViz.cpu (cpu = cpu*0.9 + d*0.1) so the price is always
 * visible in the status line. Total shapes are capped at SHAPE_CAP per tick;
 * hitting the cap draws a small "truncated" note on the first owned room.
 * Map visuals live for exactly one tick, so everything is redrawn every tick.
 *
 * MEMORY SHAPE
 * ------------
 *   Memory.mapViz = {
 *     on: boolean,
 *     layers: { rooms, expand, danger, remotes, ops },   // all booleans
 *     exp?: { t: <tick cached>, targets: [{room, score, seg}, ...] },
 *     cpu?: <EMA of the per-tick draw cost, ms>
 *   }
 *
 * SEGMENT 86 PROTOCOL
 * -------------------
 * The expansion candidates are written offline by
 * `tools/server/push-expansion-pack.mjs` into segment 86. AutoExpand reads that
 * same segment, and both go through utils/Segments.requestSegments — one
 * per-tick accumulator unioned with the already-active set — so the readers
 * coexist whatever order main.ts runs them in. This module must never starve
 * it, so it also stays cheap:
 *   · if segment 86 is already a string this tick, parse and cache it (free);
 *   · otherwise, only when the cache is stale AND Game.time % 10 === 0, ask
 *     requestSegments for it.
 *
 * CONSOLE API (every call returns a printable status string)
 * ----------------------------------------------------------
 *   mapViz()                 toggle the overlay on/off (layers default to all on)
 *   mapViz(true | false)     set it explicitly
 *   mapViz("rooms")          toggle one layer; turns the overlay on if it was off
 *      also: "expand" · "danger" · "remotes" · "ops"
 *   mapViz("all")            every layer on
 */
import { requestSegments } from "utils/Segments";

const SEG_INDEX = 86;
/** how long a cached copy of segment 86 is considered fresh */
const SEG_TTL = 1000;
/** hard ceiling on map shapes drawn in one tick */
const SHAPE_CAP = 300;
/** how many ranked expansion candidates are worth drawing */
const MAX_TARGETS = 12;
/** how long a Game.map.findRoute result is reused */
const ROUTE_TTL = 50;
/** distinct (from -> to) routes drawn per tick */
const MAX_ROUTES = 20;
/** never log the same failure more often than this */
const ERR_EVERY = 100;

type LayerName = "rooms" | "expand" | "danger" | "remotes" | "ops";
const LAYERS: LayerName[] = ["rooms", "expand", "danger", "remotes", "ops"];

interface ExpTarget {
  room: string;
  score?: number;
  seg?: number;
}

interface MapVizState {
  on: boolean;
  layers: { [layer: string]: boolean };
  exp?: { t: number; targets: ExpTarget[] };
  cpu?: number;
}

/** RCL 1 (hot) -> RCL 8 (settled) */
const RCL_COLOR = [
  "#ff3b30",
  "#ff7a2f",
  "#ffb02e",
  "#ffe62e",
  "#c8e034",
  "#8ed13f",
  "#4cc85a",
  "#22b573",
];

const M = () => Memory as any;

/* ------------------------------------------------------------------ *
 * shape budget — every draw goes through these, nothing else touches
 * Game.map.visual directly (except the truncation note itself).
 * ------------------------------------------------------------------ */
let shapes = 0;
let hitCap = false;

function budget(): boolean {
  if (shapes >= SHAPE_CAP) {
    hitCap = true;
    return false;
  }
  shapes++;
  return true;
}

function ctr(roomName: string): RoomPosition {
  return new RoomPosition(25, 25, roomName);
}

function at(roomName: string, x: number, y: number): RoomPosition {
  return new RoomPosition(x, y, roomName);
}

function vText(text: string, pos: RoomPosition, style: MapTextStyle): void {
  if (!budget()) return;
  Game.map.visual.text(text, pos, style);
}

function vCircle(pos: RoomPosition, style: MapCircleStyle): void {
  if (!budget()) return;
  Game.map.visual.circle(pos, style);
}

function vLine(a: RoomPosition, b: RoomPosition, style: MapLineStyle): void {
  if (!budget()) return;
  Game.map.visual.line(a, b, style);
}

function vPoly(points: RoomPosition[], style: MapPolyStyle): void {
  if (!budget()) return;
  Game.map.visual.poly(points, style);
}

function vRoomRect(roomName: string, style: MapPolyStyle): void {
  if (!budget()) return;
  Game.map.visual.rect(at(roomName, 0, 0), 50, 50, style);
}

/* ------------------------------------------------------------------ *
 * shared world facts, computed once per tick
 * ------------------------------------------------------------------ */
function ownedRooms(): Room[] {
  const out: Room[] = [];
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (room && room.controller && room.controller.my) out.push(room);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * layer 1 — owned rooms
 * ------------------------------------------------------------------ */
function drawRooms(owned: Room[]): void {
  for (const room of owned) {
    const lvl = room.controller ? room.controller.level : 0;
    const color = RCL_COLOR[Math.min(8, Math.max(1, lvl)) - 1];
    vRoomRect(room.name, { fill: color, opacity: 0.15, stroke: color, strokeWidth: 0.4 });

    let head = `RCL${lvl}`;
    if (lvl < 8 && room.controller && room.controller.progressTotal) {
      const pct = Math.floor((room.controller.progress / room.controller.progressTotal) * 100);
      head += ` ${pct}%`;
    }
    if ((room.memory as any).danger) head += " !";
    vText(head, at(room.name, 25, 9), {
      color: (room.memory as any).danger ? "#ff5555" : "#ffffff",
      fontSize: 7,
      opacity: 0.85,
      stroke: "#000000",
      strokeWidth: 0.2,
    });

    const parts: string[] = [];
    if (room.storage) parts.push(`${Math.floor(room.storage.store[RESOURCE_ENERGY] / 1000)}k`);
    parts.push(`S${room.find(FIND_MY_SPAWNS).length}`);
    vText(parts.join(" "), at(room.name, 25, 18), {
      color: "#dddddd",
      fontSize: 6,
      opacity: 0.8,
      stroke: "#000000",
      strokeWidth: 0.2,
    });
  }
}

/* ------------------------------------------------------------------ *
 * layer 2 — expansion
 * ------------------------------------------------------------------ */

/**
 * Refresh Memory.mapViz.exp from segment 86 without stomping AutoExpand.
 * See the SEGMENT 86 PROTOCOL block at the top of this file.
 */
function refreshExpansionCache(st: MapVizState): void {
  const raw = RawMemory.segments[SEG_INDEX];
  if (typeof raw === "string") {
    const targets: ExpTarget[] = [];
    try {
      const data = raw.length ? JSON.parse(raw) : null;
      if (data && data.targets && data.targets.length) {
        for (const t of data.targets) {
          if (!t || !t.room) continue;
          // spawnPos / hash are only useful to the claimer — do not cache them
          targets.push({ room: t.room, score: t.score, seg: t.seg });
          if (targets.length >= MAX_TARGETS * 2) break;
        }
      }
    } catch (e) {
      // a malformed segment caches as "empty" so the operator sees the hint
      // instead of a silent blank layer, and we retry in SEG_TTL ticks
    }
    st.exp = { t: Game.time, targets };
    return;
  }
  const fresh = st.exp && typeof st.exp.t === "number" && Game.time - st.exp.t < SEG_TTL;
  if (fresh) return;
  if (Game.time % 10 !== 0) return;
  // Shared per-tick accumulator (utils/Segments) — a private union idiom here
  // used to lose the race against whichever module called setActiveSegments
  // last in the tick, which is why this comment used to say AutoExpand always
  // won. All segment users now go through requestSegments so order is
  // irrelevant.
  requestSegments([SEG_INDEX]);
}

type TargetStatus = "mine" | "taken" | "free" | "unknown";

/**
 * Mirrors takenByAnyone() / hasVisibleForeignSpawn() in AutoExpand.ts without
 * importing them: no vision means we trust the pack, so "unknown" is drawn as
 * available, only dimmer.
 */
function targetStatus(roomName: string): TargetStatus {
  const room = Game.rooms[roomName];
  if (!room) return "unknown";
  if (room.controller && room.controller.my) return "mine";
  if (room.controller && room.controller.owner) return "taken";
  if (room.find(FIND_HOSTILE_SPAWNS).length) return "taken";
  return "free";
}

function drawExpand(owned: Room[], st: MapVizState): void {
  const m = M();

  // (a) the live state machine
  const ax = m.autoExpand;
  if (ax && ax.room) {
    vCircle(ctr(ax.room), {
      radius: 14,
      fill: "#ffcc00",
      opacity: 0.25,
      stroke: "#ffcc00",
      strokeWidth: 1,
    });
    const age = typeof ax.since === "number" ? Game.time - ax.since : "?";
    vText(`EXPAND ${ax.phase} +${age}`, at(ax.room, 25, 46), {
      color: "#ffcc00",
      fontSize: 7,
      opacity: 0.9,
      stroke: "#000000",
      strokeWidth: 0.25,
    });
  }

  // (b) the legacy colonise target that actually drives the claimer
  const tc = m.target_colonise;
  if (tc && tc.room && (!ax || ax.room !== tc.room)) {
    vText("colonise", at(tc.room, 25, 46), {
      color: "#ffcc00",
      fontSize: 6,
      opacity: 0.8,
      stroke: "#000000",
      strokeWidth: 0.25,
    });
  }

  // (c) the ranked candidates
  refreshExpansionCache(st);
  const targets = (st.exp && st.exp.targets) || [];
  if (!targets.length) {
    if (owned.length) {
      vText(`expand: segment ${SEG_INDEX} empty — run push-expansion-pack.mjs`, at(owned[0].name, 25, 38), {
        color: "#ff9944",
        fontSize: 5,
        opacity: 0.9,
        stroke: "#000000",
        strokeWidth: 0.2,
      });
    }
    return;
  }
  for (let i = 0; i < targets.length && i < MAX_TARGETS; i++) {
    const t = targets[i];
    if (ax && ax.room === t.room) continue; // already flagged in gold above
    const status = targetStatus(t.room);
    let color = "#55dd66";
    let opacity = 0.85;
    let mark = "";
    if (status === "mine") {
      color = "#55dd66";
      mark = " ✓";
    } else if (status === "taken") {
      color = "#999999";
      opacity = 0.6;
    } else if (status === "unknown") {
      opacity = 0.5;
    }
    const score = typeof t.score === "number" ? Math.round(t.score) : "?";
    vText(`#${i + 1} ${score}${mark}`, at(t.room, 25, 46), {
      color,
      fontSize: 6,
      opacity,
      stroke: "#000000",
      strokeWidth: 0.2,
    });
  }
}

/* ------------------------------------------------------------------ *
 * layer 3 — danger
 * ------------------------------------------------------------------ */
function drawDanger(owned: Room[]): void {
  const m = M();

  const roomMem = m.rooms;
  if (roomMem) {
    for (const name in roomMem) {
      const mem = roomMem[name];
      if (!mem || !mem.danger) continue;
      vRoomRect(name, { stroke: "#ff2222", strokeWidth: 1.5, opacity: 0.6 });
      const timer = typeof mem.danger_timer === "number" ? ` ${mem.danger_timer}` : "";
      vText(`DANGER${timer}`, at(name, 25, 27), {
        color: "#ff4444",
        fontSize: 7,
        opacity: 0.9,
        stroke: "#000000",
        strokeWidth: 0.25,
      });
    }
  }

  const avoid = m.AvoidRooms;
  if (avoid && avoid.length) {
    for (const name of avoid) {
      if (typeof name !== "string") continue;
      vRoomRect(name, { stroke: "#ff9900", strokeWidth: 1, opacity: 0.5 });
      vText("AVOID", at(name, 25, 27), {
        color: "#ff9900",
        fontSize: 6,
        opacity: 0.8,
        stroke: "#000000",
        strokeWidth: 0.25,
      });
    }
  }

  // hot remotes — res[remote].hot is the tick the abandonment expires
  for (const home of owned) {
    const res = (home.memory as any).resources;
    if (!res) continue;
    for (const remote in res) {
      if (remote === home.name) continue;
      const e = res[remote];
      if (!e || !e.hot || e.hot <= Game.time) continue;
      vText(`hot -${e.hot - Game.time}`, at(remote, 25, 33), {
        color: "#aa2222",
        fontSize: 6,
        opacity: 0.85,
        stroke: "#000000",
        strokeWidth: 0.25,
      });
    }
  }

  // nukes — owned rooms only, so FIND_NUKES stays cheap
  for (const room of owned) {
    const nukes = room.find(FIND_NUKES);
    if (!nukes.length) continue;
    let soonest = nukes[0].timeToLand;
    for (const n of nukes) if (n.timeToLand < soonest) soonest = n.timeToLand;
    vText(`NUKE x${nukes.length} T-${soonest}`, at(room.name, 25, 40), {
      color: "#ff33ff",
      fontSize: 7,
      opacity: 0.95,
      stroke: "#000000",
      strokeWidth: 0.25,
    });
  }
}

/* ------------------------------------------------------------------ *
 * layer 4 — remotes
 * ------------------------------------------------------------------ */
function drawRemotes(owned: Room[]): void {
  const rstats = M().rstats;
  const r = rstats && rstats.r;
  for (const home of owned) {
    const res = (home.memory as any).resources;
    if (!res) continue;
    const from = ctr(home.name);
    for (const remote in res) {
      if (remote === home.name) continue;
      const e = res[remote];
      if (!e || e.active !== true || !e.energy) continue;
      const hot = !!(e.hot && e.hot > Game.time);
      vLine(from, ctr(remote), {
        color: hot ? "#cc3333" : "#33cc55",
        width: 1.2,
        opacity: hot ? 0.5 : 0.35,
      });
      const s = r && r[`${home.name}|${remote}`];
      if (!s) continue; // no rstats entry yet — the link line alone has to do
      const del = typeof s.del === "number" ? Math.floor(s.del / 1000) : 0;
      const trips = typeof s.trips === "number" ? s.trips : 0;
      vText(`${del}k ${trips}t`, at(remote, 25, 40), {
        color: hot ? "#cc6666" : "#88ee99",
        fontSize: 5,
        opacity: 0.8,
        stroke: "#000000",
        strokeWidth: 0.2,
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * layer 5 — ops
 *
 * Everything that keeps a room running is economy and is deliberately NOT
 * drawn: with ~130 creeps the map would be a ball of string. What is left is
 * the interesting traffic — claimers, attackers, dismantlers, squads, scouts
 * of war — plus anything carrying a `squad` tag, whatever its role.
 * ------------------------------------------------------------------ */
const ECON_ROLES: { [role: string]: boolean } = {
  EnergyMiner: true,
  MineralMiner: true,
  carry: true,
  reserve: true,
  RemoteRepair: true,
  builder: true,
  upgrader: true,
  repair: true,
  filler: true,
  FakeFiller: true,
  EnergyManager: true,
  maintainer: true,
  buildcontainer: true,
  RampartUpgrader: true,
  sweeper: true,
  clearer: true,
  signifer: true,
  Sign: true,
  Priest: true,
  defender: true,
  Guard: true,
  RampartDefender: true,
  RRD: true,
  RampartErector: true,
  ControllerLinkFiller: true,
  scout: true,
  Convoy: true,
  SpecialRepair: true,
  SpecialCarry: true,
  Solomon: true,
  efficient: true,
};

/** heap-only cache of Game.map.findRoute results, keyed "<from>|<to>" */
const routeCache = new Map<string, { t: number; pts: RoomPosition[] }>();

function routePoints(from: string, to: string): RoomPosition[] {
  const key = `${from}|${to}`;
  const hit = routeCache.get(key);
  if (hit && Game.time - hit.t < ROUTE_TTL) return hit.pts;
  const pts: RoomPosition[] = [ctr(from)];
  let route: any;
  try {
    route = Game.map.findRoute(from, to);
  } catch (e) {
    route = ERR_NO_PATH;
  }
  if (route && typeof route !== "number" && route.length) {
    for (const step of route) pts.push(ctr(step.room));
  } else {
    pts.push(ctr(to)); // ERR_NO_PATH (or same room) — a straight line still says who wants what
  }
  routeCache.set(key, { t: Game.time, pts });
  return pts;
}

function drawOps(): void {
  const groups: { [key: string]: { from: string; to: string; role: string; n: number } } = {};
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (!creep || !creep.room) continue;
    const mem = creep.memory as any;
    if (!mem) continue;
    const to = mem.targetRoom;
    if (!to || typeof to !== "string") continue;
    const from = creep.room.name;
    if (from === to) continue;
    const role = typeof mem.role === "string" ? mem.role : "?";
    if (ECON_ROLES[role] && !mem.squad) continue;
    const key = `${from}|${to}|${role}`;
    if (groups[key]) groups[key].n++;
    else groups[key] = { from, to, role, n: 1 };
  }

  const drawnRoutes: { [pair: string]: boolean } = {};
  let routes = 0;
  for (const key in groups) {
    const g = groups[key];
    const pair = `${g.from}|${g.to}`;
    if (!drawnRoutes[pair] && routes < MAX_ROUTES) {
      drawnRoutes[pair] = true;
      routes++;
      vPoly(routePoints(g.from, g.to), {
        stroke: "#66ccff",
        strokeWidth: 0.8,
        opacity: 0.6,
        lineStyle: "dashed",
        fill: undefined,
      });
    }
    vText(`${g.n} ${g.role}`, at(g.to, 25, 31), {
      color: "#66ccff",
      fontSize: 6,
      opacity: 0.85,
      stroke: "#000000",
      strokeWidth: 0.25,
    });
  }
}

/* ------------------------------------------------------------------ *
 * entry point
 * ------------------------------------------------------------------ */
let lastErr = -ERR_EVERY;

/** Called once per tick from main, BEFORE runAutoExpand(). */
export function runMapViz(): void {
  const st = M().mapViz as MapVizState | undefined;
  if (!st || !st.on) return;

  const start = Game.cpu.getUsed();
  shapes = 0;
  hitCap = false;

  try {
    if (!st.layers) st.layers = { rooms: true, expand: true, danger: true, remotes: true, ops: true };
    const owned = ownedRooms();
    if (st.layers.rooms) drawRooms(owned);
    if (st.layers.expand) drawExpand(owned, st);
    if (st.layers.danger) drawDanger(owned);
    if (st.layers.remotes) drawRemotes(owned);
    if (st.layers.ops) drawOps();
    if (hitCap && owned.length) {
      // deliberately outside the budget: the note about the cap must survive it
      Game.map.visual.text(`mapViz truncated at ${SHAPE_CAP} shapes`, at(owned[0].name, 25, 4), {
        color: "#ff9944",
        fontSize: 5,
        opacity: 0.9,
        stroke: "#000000",
        strokeWidth: 0.2,
      });
    }
  } catch (e: any) {
    if (Game.time - lastErr >= ERR_EVERY) {
      lastErr = Game.time;
      console.log(`[mapViz] draw failed: ${e && e.message ? e.message : e}`);
    }
  }

  const used = Game.cpu.getUsed() - start;
  st.cpu = typeof st.cpu === "number" ? st.cpu * 0.9 + used * 0.1 : used;
}

/* ------------------------------------------------------------------ *
 * console
 * ------------------------------------------------------------------ */
function ensureState(): MapVizState {
  const m = M();
  if (!m.mapViz) m.mapViz = { on: false, layers: {} };
  const st = m.mapViz as MapVizState;
  if (!st.layers || !LAYERS.some((l) => l in st.layers)) {
    st.layers = { rooms: true, expand: true, danger: true, remotes: true, ops: true };
  }
  return st;
}

function status(st: MapVizState, note?: string): string {
  const flags = LAYERS.map((l) => `${l}:${st.layers[l] ? "on" : "off"}`).join(" ");
  const cpu = typeof st.cpu === "number" ? st.cpu.toFixed(2) : "-";
  const line = `mapViz ${st.on ? "ON" : "off"} · ${flags} · cpu ${cpu}ms · shapes ${shapes}/${SHAPE_CAP}`;
  return note ? `${line} · ${note}` : line;
}

(global as any).mapViz = function (arg?: any): string {
  const st = ensureState();

  if (arg === undefined) {
    st.on = !st.on;
    return status(st);
  }
  if (arg === true || arg === false) {
    st.on = arg;
    return status(st);
  }
  if (typeof arg === "string") {
    const key = arg.toLowerCase();
    if (key === "all") {
      for (const l of LAYERS) st.layers[l] = true;
      st.on = true;
      return status(st, "all layers on");
    }
    const layer = LAYERS.filter((l) => l === key)[0];
    if (layer) {
      st.layers[layer] = !st.layers[layer];
      if (!st.on) st.on = true;
      return status(st, `${layer} -> ${st.layers[layer] ? "on" : "off"}`);
    }
  }
  return status(st, `unknown argument — use mapViz(), mapViz(true|false), mapViz("all") or one of ${LAYERS.join("|")}`);
};
