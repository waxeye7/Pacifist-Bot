/**
 * r29p2 — measure whether the three leftover cutPasses leaves re-derive
 * from the shipped board + inertPruned + cutAtFreeze. Read-only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { D8, key, walkable } from "../shared.mjs";
import { exteriorFlood } from "../shared.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLANS = path.resolve(DIR, "../../out-v2/plans-hub.json");
const ROOMS = process.env.ROOMS_FILE || path.resolve(DIR, "../_r28-mech/rooms.json");

const idx = (x, y) => x + y * 50;

function insideFlood(terrain, rampartSet, sitter) {
  const inside = new Uint8Array(2500);
  if (!sitter || !walkable(terrain, sitter.x, sitter.y) || rampartSet.has(key(sitter.x, sitter.y))) return inside;
  const s = idx(sitter.x, sitter.y);
  inside[s] = 1;
  const q = [s];
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi],
      x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny) || rampartSet.has(key(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (inside[ni]) continue;
      inside[ni] = 1;
      q.push(ni);
    }
  }
  return inside;
}

function sealCriticalCount(terrain, rampartSet, sitter) {
  if (!rampartSet.size) return null;
  const ext = exteriorFlood(terrain, rampartSet);
  const si = idx(sitter.x, sitter.y);
  if (ext[si]) return null;
  const inside = insideFlood(terrain, rampartSet, sitter);
  let n = 0;
  for (const k of rampartSet) {
    const [x, y] = k.split(",").map(Number);
    if (!walkable(terrain, x, y)) continue;
    let touchIn = false,
      touchOut = false;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      const ni = nx + ny * 50;
      if (inside[ni]) touchIn = true;
      else if (ext[ni]) touchOut = true;
      if (touchIn && touchOut) break;
    }
    if (touchIn && touchOut) n++;
  }
  return n;
}

const plans = JSON.parse(fs.readFileSync(PLANS, "utf8"));
const rooms = JSON.parse(fs.readFileSync(ROOMS, "utf8"));
const terrainOf = new Map(rooms.map((r) => [r.room, r.terrain]));

let bothDel = 0,
  firstOnly = 0,
  secondOnly = 0,
  noneDel = 0;
let l7bMatchShip = 0,
  l7bMismatch = 0,
  l7MatchShip = 0,
  l7MatchStart = 0,
  l7MatchNeither = 0;
let l7RampMatchStart = 0,
  l7bRampMatchShipPlus = 0;
const mismatchSamples = [];
const bothDelRooms = [];
const l7Neither = [];

for (const p of plans) {
  const terrain = terrainOf.get(p.room);
  if (!terrain) throw new Error(`no terrain ${p.room}`);
  const sh = p.meta.shell;
  const cp = sh.cutPasses || [];
  const ship = new Set((p.structures.rampart || []).map((t) => key(t.x, t.y)));
  const inert = (sh.inertPruned || []).filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y));
  const start = new Set([...ship, ...inert]);
  const prune = cp.filter((m) => m && m.kind === "inertPrune");
  const rec = cp.filter((m) => m && m.kind === "reconcileSeal");
  const l7p = prune.find((m) => m.pass === "layer7-inertPrune");
  const l7bp = prune.find((m) => m.pass === "layer7b-inertPrune");
  const l7r = rec.find((m) => m.pass === "layer7-reconcileSeal");
  const l7br = rec.find((m) => m.pass === "layer7b-reconcileSeal");
  const d1 = l7p?.rampartsDeleted || 0;
  const d2 = l7bp?.rampartsDeleted || 0;
  if (d1 && d2) {
    bothDel++;
    bothDelRooms.push(`${p.room}:${d1}+${d2}`);
  } else if (d1) firstOnly++;
  else if (d2) secondOnly++;
  else noneDel++;

  const scShip = sealCriticalCount(terrain, ship, p.sitter);
  const scStart = sealCriticalCount(terrain, start, p.sitter);
  if (l7br && l7br.sealCritical === scShip) l7bMatchShip++;
  else {
    l7bMismatch++;
    if (mismatchSamples.length < 8) {
      mismatchSamples.push({
        room: p.room,
        which: "l7b",
        pub: l7br?.sealCritical,
        ship: scShip,
        start: scStart,
        top: sh.sealCritical,
        d1,
        d2,
        shipN: ship.size,
      });
    }
  }
  if (l7r) {
    if (l7r.sealCritical === scShip) l7MatchShip++;
    else if (l7r.sealCritical === scStart) l7MatchStart++;
    else {
      l7MatchNeither++;
      if (l7Neither.length < 8) {
        l7Neither.push({
          room: p.room,
          pub: l7r.sealCritical,
          ship: scShip,
          start: scStart,
          d1,
          d2,
          adds: l7r.adds,
        });
      }
    }
  }
  if (l7p && l7p.ramparts === start.size) l7RampMatchStart++;
  if (l7bp && l7bp.ramparts === ship.size + d2) l7bRampMatchShipPlus++;
}

console.log(JSON.stringify({
  rooms: plans.length,
  prune: { bothDel, firstOnly, secondOnly, noneDel, bothDelRooms },
  seal: { l7bMatchShip, l7bMismatch, l7MatchShip, l7MatchStart, l7MatchNeither, mismatchSamples, l7Neither },
  ramp: { l7RampMatchStart, l7bRampMatchShipPlus, pruneMarkers: plans.length * 2 },
}, null, 2));
