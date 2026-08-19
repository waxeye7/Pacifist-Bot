/**
 * Compose ladder rooms, copy shellEscalation.rungs (with cutTiles) onto the
 * shipped artifact. Refuses to write if any board moved.
 *
 * Usage:
 *   fnm exec --using 22 node tools/plan-suite/v2/_r28-mech/fill-88.mjs E11S2
 *   fnm exec --using 22 node tools/plan-suite/v2/_r28-mech/fill-88.mjs --write
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { planRoom } from "../pipeline.mjs";
import { planStructureHash } from "../shared.mjs";
import { enclosureMobility } from "../layer-shell.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.join(DIR, "../../out-v2/plans-hub.json");
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, "rooms.json"), "utf8"));
const byRoom = new Map(rooms.map((r) => [r.room, r]));
const plans = JSON.parse(fs.readFileSync(HUB, "utf8"));
const args = process.argv.slice(2);
const write = args.includes("--write");
const only = args.filter((a) => !a.startsWith("--"));

const targets = plans.filter((p) => {
  if (!p || !p.room || p.error) return false;
  if (only.length && !only.includes(p.room)) return false;
  if (!p.meta?.shellEscalation) return false;
  return (p.meta.shortfalls || []).some((s) => s && s.ladder && Array.isArray(s.ladder.rungs) && s.ladder.rungs.length);
});

console.log("ladder rooms with shellEscalation", targets.length, only.length ? `(only ${only.join(",")})` : "");

const report = [];
for (const p of targets) {
  const d = byRoom.get(p.room);
  if (!d) {
    report.push({ room: p.room, err: "no terrain" });
    continue;
  }
  const t0 = Date.now();
  const fresh = planRoom(d);
  const ms = Date.now() - t0;
  if (fresh.error) {
    report.push({ room: p.room, err: fresh.error, ms });
    continue;
  }
  const h0 = planStructureHash(p);
  const h1 = planStructureHash(fresh);
  const rungs = fresh.meta?.shellEscalation?.rungs;
  const mob = [];
  if (Array.isArray(rungs)) {
    for (const row of rungs) {
      const want = enclosureMobility(d.terrain, fresh, row.cutTiles);
      mob.push({
        bonus: row.needDeepBonus,
        published: row.mobility,
        derived: want,
        cut: (row.cutTiles || []).length,
        ok: typeof want === "number" && Math.abs(want - row.mobility) < 1e-6,
      });
    }
  }
  report.push({
    room: p.room,
    ms,
    hashOk: h0 === h1,
    rungs: rungs ? rungs.length : 0,
    mobOk: mob.every((m) => m.ok),
    mob,
  });
  if (h0 === h1 && Array.isArray(rungs) && write) {
    p.meta.shellEscalation.rungs = rungs;
  }
}

console.log(JSON.stringify(report, null, 2));
if (write) {
  const bad = report.filter((r) => !r.hashOk || r.err || !r.mobOk);
  if (bad.length) {
    console.error("REFUSING TO WRITE — board moved or compose failed", bad.map((r) => r.room));
    process.exit(1);
  }
  fs.writeFileSync(HUB, JSON.stringify(plans, null, 2));
  console.log("wrote", HUB, "rungs onto", report.length, "rooms");
}
