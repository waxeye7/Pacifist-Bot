/**
 * Round-28 first-pass exploits. Read-only on the artifact; mutates clones in memory.
 * ROOMS_FILE or first arg = rooms dump. Prints BITES / ESCAPE per case.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "./validate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const plans = JSON.parse(fs.readFileSync(path.join(DIR, "../out-v2/plans-hub.json"), "utf8")).filter(
  (p) => p && p.room && !p.error,
);
const roomsFile =
  process.env.ROOMS_FILE ||
  "C:/Users/stemm/AppData/Local/Temp/claude/C--Users-stemm-Documents-GitHub-screeps-Pacifist-Bot/925cd69a-24ce-4beb-9c86-6af0641f273a/scratchpad/rooms.json";
const rooms = JSON.parse(fs.readFileSync(roomsFile, "utf8"));
const by = new Map(rooms.map((r) => [r.room, r]));

function clone(room) {
  return JSON.parse(JSON.stringify(plans.find((p) => p.room === room)));
}
function T(room) {
  return by.get(room);
}

function tryCase(name, room, mutate) {
  const d = T(room);
  if (!d) {
    console.log("ESCAPE", name, room, "no terrain");
    return;
  }
  const p = clone(room);
  mutate(p);
  let res;
  try {
    res = checkRoom(p, d.terrain, d.objects, null);
  } catch (e) {
    console.log("THREW", name, room, e.message);
    return;
  }
  const real = (res.fails || []).filter((f) => !/fleetMediansMeasured|eco\.ctrlMedian|eco\.srcMedian|eco\.ctrlGate|eco\.srcGate/.test(f));
  console.log(real.length ? "BITES" : "ESCAPE", name, room, real.length ? real[0].slice(0, 140) : "");
}

const R = plans[0].room;
const drift = plans.find((p) => (p.meta?.shell?.cutDrift || []).some((e) => e.op === "add"))?.room || R;
const enclosedFalse = plans.find((p) => p.meta?.shell?.enclosedController === false)?.room || R;
const hasNuker = plans.find((p) => typeof p.meta?.misc?.nukerHubDist === "number")?.room || R;
const hasMobShip = plans.find((p) => p.meta?.shell?.mobilityShipped)?.room || R;
const e5s1 = plans.find((p) => p.room === "E5S1")?.room;
const hasDmg = plans.find((p) => p.meta?.shell?.shippedShellDmg && typeof p.meta?.towers?.shippedWeakest === "number")?.room || R;
const hasUseless = plans.find((p) => (p.meta?.shell?.uselessCut || []).length || p.meta?.shell?.uselessCut)?.room || R;
const hasAdopt = plans.find((p) => Array.isArray(p.meta?.shell?.cutAdopted))?.room || R;

tryCase("enclosedController false->true", enclosedFalse, (p) => {
  p.meta.shell.enclosedController = true;
});
tryCase("nukerHubDist := 1", hasNuker, (p) => {
  p.meta.misc.nukerHubDist = 1;
  p.meta.misc.observerHubDist = 1;
});
tryCase("mobilityShipped.maxGated := 0", hasMobShip, (p) => {
  if (p.meta.shell.mobilityShipped) p.meta.shell.mobilityShipped.maxGated = 0;
  if (p.meta.shell.mobilityShippedFree) p.meta.shell.mobilityShippedFree.maxGated = 0;
});
tryCase("shippedShellDmg.min inflated + twins moved with it", hasDmg, (p) => {
  const d = p.meta.shell.shippedShellDmg;
  d.min = 9999;
  d.worst = 9999;
  d.avg = 9999;
  p.meta.towers.shippedWeakest = 9999;
  p.meta.towers.shippedAvgShellDmg = 9999;
});
tryCase("enclosureBasis + enclosedSources both flattered", enclosedFalse, (p) => {
  p.meta.shell.enclosureBasis = "ON THIS ROOM: this room is perfect. " + (p.meta.shell.enclosureBasis || "");
  p.meta.shell.enclosedSources = (p.sources || []).length;
  p.meta.shell.enclosedSourceWorks = (p.sources || []).length;
});
tryCase("deepTilesBasis + shippedFreeDeep co-forged", R, (p) => {
  p.meta.shell.shippedFreeDeep = 999;
  p.meta.shell.deepTilesBasis = p.meta.shell.deepTilesBasis.replace(
    /shippedFreeDeep \d+/,
    "shippedFreeDeep 999",
  );
});
tryCase("cutAdopted invent a tile that has a rampart", hasAdopt, (p) => {
  const r = (p.structures.rampart || [])[0];
  p.meta.shell.cutAdopted = [{ x: r.x, y: r.y, why: "reviewer" }];
});
tryCase("absorb one add into freeze + rewrite why/passes to match", drift, (p) => {
  const add = p.meta.shell.cutDrift.find((e) => e.op === "add");
  if (!add) return;
  p.meta.shell.cutAtFreeze = [...p.meta.shell.cutAtFreeze, { x: add.x, y: add.y }];
  p.meta.shell.cutDrift = p.meta.shell.cutDrift.filter((e) => !(e.op === "add" && e.x === add.x && e.y === add.y));
  if (Array.isArray(p.meta.shell.cutPasses)) {
    for (const mk of p.meta.shell.cutPasses) {
      if (mk.pass && String(mk.pass).includes("reconcileSeal") && mk.adds > 0) mk.adds -= 1;
    }
  }
});
if (e5s1) {
  tryCase("E5S1 mineralWhy: keep seat+suffix, rewrite ring", e5s1, (p) => {
    const s = p.meta.misc.mineralOffNetworkWhy;
    const seat = /mineral seat at (\d+),(\d+)/.exec(s);
    const suffix = s.includes("no road by design")
      ? s.slice(s.indexOf("no road by design"))
      : s.slice(s.lastIndexOf("Measured over"));
    p.meta.misc.mineralOffNetworkWhy =
      `ON THIS ROOM: the mineral seat at ${seat[1]},${seat[2]} has these eight neighbours — all empty — so 0 of them put it on the network, and this room ships no road at all. ` +
      (s.includes("no road by design") ? "no road by design — mineral hauling is one trickle deposit on a long cooldown, and permanent road decay to reach it costs more than the walk it saves." : suffix);
  });
}
tryCase("protectRadius := 0", R, (p) => {
  p.meta.shell.protectRadius = 0;
});
tryCase("priceyWall := 0", R, (p) => {
  p.meta.shell.priceyWall = 0;
});
tryCase("uselessCut cleared", hasUseless, (p) => {
  if (Array.isArray(p.meta.shell.uselessCut)) p.meta.shell.uselessCut = [];
  else p.meta.shell.uselessCut = 0;
});
tryCase("refillDistsUnblocked all 1", R, (p) => {
  if (Array.isArray(p.meta.towers?.refillDistsUnblocked)) p.meta.towers.refillDistsUnblocked = p.meta.towers.refillDistsUnblocked.map(() => 1);
});
tryCase("newRoads/spurred/swampPaved zeroed", R, (p) => {
  if (p.meta.towers) p.meta.towers.newRoads = 0;
  if (p.meta.walls) {
    p.meta.walls.spurred = 0;
    p.meta.walls.swampPaved = 0;
    p.meta.walls.stitched = 0;
  }
});
