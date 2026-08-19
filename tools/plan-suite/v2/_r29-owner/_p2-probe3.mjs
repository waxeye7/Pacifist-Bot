import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { D8, key, walkable, exteriorFlood } from "../shared.mjs";

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
    const i = q[qi], x = i % 50, y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy;
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
  if (ext[idx(sitter.x, sitter.y)]) return null;
  const inside = insideFlood(terrain, rampartSet, sitter);
  let n = 0;
  for (const k of rampartSet) {
    const [x, y] = k.split(",").map(Number);
    if (!walkable(terrain, x, y)) continue;
    let touchIn = false, touchOut = false;
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy;
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

function reflowOf(p) {
  return p.meta?.walls?.reflow || p.meta?.extensions?.reflow || null;
}

const plans = JSON.parse(fs.readFileSync(PLANS, "utf8"));
const rooms = JSON.parse(fs.readFileSync(ROOMS, "utf8"));
const terrainOf = new Map(rooms.map((r) => [r.room, r.terrain]));

let rampHit = 0, rampMiss = 0, seal7Hit = 0, seal7Miss = 0, seal7bHit = 0;
const rampMisses = [];
const sealMisses = [];
let retiredEmpty = 0, retiredN = 0, addedN = 0, shallowRampN = 0;
let retiredEqMovedFrom = 0, retiredNeq = 0;

for (const p of plans) {
  const terrain = terrainOf.get(p.room);
  const sh = p.meta.shell;
  const rf = reflowOf(p);
  const retired = (rf?.rampartsRetired || []).filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y));
  const added = (rf?.added || []).filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y));
  const shR = (rf?.shallowRamparts || []).filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y));
  if (!retired.length) retiredEmpty++;
  retiredN += retired.length;
  addedN += added.length;
  shallowRampN += shR.length;
  const movedFrom = new Set((rf?.moved || []).map((m) => key(m.from.x, m.from.y)));
  const retSet = new Set(retired);
  if ([...retSet].every((k) => movedFrom.has(k)) && retired.length === movedFrom.size) retiredEqMovedFrom++;
  else if (retired.length || movedFrom.size) {
    retiredNeq++;
    if (sealMisses.length < 3) {
      /* keep later */
    }
  }

  const ship = new Set((p.structures.rampart || []).map((t) => key(t.x, t.y)));
  const inert = (sh.inertPruned || []).filter((t) => t && Number.isInteger(t.x)).map((t) => key(t.x, t.y));
  const start = new Set([...ship, ...inert, ...retired]);
  for (const k of added) start.delete(k);
  for (const k of shR) start.delete(k);

  const l7p = (sh.cutPasses || []).find((m) => m.pass === "layer7-inertPrune");
  const l7r = (sh.cutPasses || []).find((m) => m.pass === "layer7-reconcileSeal");
  const l7br = (sh.cutPasses || []).find((m) => m.pass === "layer7b-reconcileSeal");
  if (l7p.ramparts === start.size) rampHit++;
  else {
    rampMiss++;
    if (rampMisses.length < 10) {
      rampMisses.push({
        room: p.room,
        pub: l7p.ramparts,
        start: start.size,
        ship: ship.size,
        inert: inert.length,
        retired: retired.length,
        added: added.length,
        shR: shR.length,
        d1: l7p.rampartsDeleted,
      });
    }
  }

  // after first prune (d2=0 always): start - inert
  const after = new Set(start);
  for (const k of inert) after.delete(k);
  const sc7 = sealCriticalCount(terrain, after, p.sitter);
  const sc7b = sealCriticalCount(terrain, ship, p.sitter);
  if (l7r.sealCritical === sc7) seal7Hit++;
  else {
    seal7Miss++;
    if (sealMisses.length < 10) {
      sealMisses.push({
        room: p.room,
        pub: l7r.sealCritical,
        after: sc7,
        ship: sc7b,
        afterN: after.size,
        retired: retired.length,
        inert: inert.length,
        adds: l7r.adds,
      });
    }
  }
  if (l7br.sealCritical === sc7b) seal7bHit++;
}

console.log(JSON.stringify({
  rampHit, rampMiss, rampMisses,
  seal7Hit, seal7Miss, sealMisses,
  seal7bHit,
  retiredEmpty, retiredN, addedN, shallowRampN,
  retiredEqMovedFrom, retiredNeq,
}, null, 2));
