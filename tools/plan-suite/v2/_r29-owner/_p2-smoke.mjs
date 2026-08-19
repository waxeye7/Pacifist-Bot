import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkRoom } from "../validate.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLANS = path.resolve(DIR, "../../out-v2/plans-hub.json");
const ROOMS = process.env.ROOMS_FILE || path.resolve(DIR, "../_r28-mech/rooms.json");
const plans = JSON.parse(fs.readFileSync(PLANS, "utf8"));
const rooms = JSON.parse(fs.readFileSync(ROOMS, "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));
const byName = new Map(plans.map((p) => [p.room, p]));

function clone(room) {
  return JSON.parse(JSON.stringify(byName.get(room)));
}

function run(label, plan) {
  const d = byRoom.get(plan.room);
  const res = checkRoom(plan, d.terrain, d.objects);
  const fails = (res.fails || []).filter((f) => !/fleet median/i.test(f));
  console.log(`${fails.length ? "FAIL" : "PASS"} ${label} (${fails.length})`);
  for (const f of fails.slice(0, 3)) console.log("   ", f.slice(0, 220));
}

for (const r of ["E2S7", "E11S1", "E2S5", "E12S2", "E11S7", "E9S7", "E12S6"]) {
  run(`honest ${r}`, clone(r));
}

{
  const p = clone("E11S1");
  for (const m of p.meta.shell.cutPasses) if (Number.isInteger(m.sealCritical)) m.sealCritical += 1;
  run("E11S1 seal+1", p);
}
{
  const p = clone("E11S1");
  for (const m of p.meta.shell.cutPasses) if (Number.isInteger(m.sealCritical)) m.sealCritical = m.adds || 0;
  run("E11S1 seal:=adds", p);
}
{
  const p = clone("E11S1");
  const n = p.structures.rampart.length;
  for (const m of p.meta.shell.cutPasses) if (Number.isInteger(m.sealCritical)) m.sealCritical = n;
  run("E11S1 seal:=rampN", p);
}
{
  const p = clone("E11S1");
  for (const m of p.meta.shell.cutPasses) if (m.kind === "inertPrune") m.ramparts += 8;
  run("E11S1 ramp+8", p);
}
{
  const p = clone("E11S6");
  const a = p.meta.shell.cutPasses.find((m) => m.pass === "layer7-inertPrune");
  const b = p.meta.shell.cutPasses.find((m) => m.pass === "layer7b-inertPrune");
  const t = a.rampartsDeleted;
  a.rampartsDeleted = b.rampartsDeleted;
  b.rampartsDeleted = t;
  run("E11S6 swap deleted", p);
}
