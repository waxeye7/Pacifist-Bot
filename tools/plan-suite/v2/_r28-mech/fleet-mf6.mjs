/**
 * Fleet-wide MF6 presence-name flips. Writes a temp PLANS_FILE and runs
 * validate.mjs. Compares the summary line to a clean baseline if present.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../../out-v2");
const plans = JSON.parse(fs.readFileSync(path.join(ROOT, "plans-hub.json"), "utf8"));
const mutated = JSON.parse(JSON.stringify(plans));

function flip(p) {
  const sh = p.meta?.shell;
  const tw = p.meta?.towers;
  const w = p.meta?.walls;
  const misc = p.meta?.misc;
  if (!sh) return;
  if (typeof sh.protectRadius === "number") sh.protectRadius = 0;
  if (typeof sh.priceyWall === "number") sh.priceyWall = 0;
  if (typeof sh.baseCut === "number") sh.baseCut = 0;
  if (Array.isArray(sh.uselessCut)) sh.uselessCut = [];
  else if (typeof sh.uselessCut === "number") sh.uselessCut = 0;
  if (Array.isArray(sh.cutAdopted) && (p.structures?.rampart || []).length) {
    const r = p.structures.rampart[0];
    sh.cutAdopted = [{ x: r.x, y: r.y }];
  }
  // shippedShellDmg IS derived — leave it. Flip only the names that escaped
  // the single-room checkRoom probes.
  if (typeof sh.mineralBubble === "boolean") sh.mineralBubble = false;
  if (typeof sh.mineralBubble === "number") sh.mineralBubble = 0;
  // mobilityShipped is twinned to builtGated — leave it. The 55/172 of the
  // first fleet flip were exactly the 55 rooms whose lap is not already 0.
  if (tw) {
    if (Array.isArray(tw.refillDistsUnblocked)) tw.refillDistsUnblocked = tw.refillDistsUnblocked.map(() => 1);
    if (typeof tw.newRoads === "number") tw.newRoads = 0;
  }
  if (w) {
    if (typeof w.spurred === "number") w.spurred = 0;
    if (typeof w.swampPaved === "number") w.swampPaved = 0;
    if (typeof w.newRoads === "number") w.newRoads = 0;
  }
  if (misc) {
    if (typeof misc.nukerHubDist === "number") misc.nukerHubDist = 1;
    if (typeof misc.observerHubDist === "number") misc.observerHubDist = 1;
    if (typeof misc.mineralBubble === "boolean") misc.mineralBubble = false;
  }
}

let n = 0;
for (const p of mutated) {
  if (!p || !p.room || p.error) continue;
  flip(p);
  n++;
}

const plansFile = path.join(DIR, "plans-mf6.json");
fs.writeFileSync(plansFile, JSON.stringify(mutated));
console.log("wrote", plansFile, "flipped", n, "rooms");

const cmd = `fnm exec --using 22 node tools/plan-suite/v2/validate.mjs`;
const env = { ...process.env, PLANS_FILE: plansFile };
let out = "";
let code = 0;
try {
  out = execSync(cmd, { cwd: path.resolve(DIR, "../../../.."), env, encoding: "utf8", maxBuffer: 20e6 });
} catch (e) {
  code = e.status || 1;
  out = (e.stdout || "") + (e.stderr || "");
}

const summary = (out.match(/^pass .*/m) || [""])[0];
const derived = out.split("\n").filter((l) =>
  /layer-7 roads|along-cut|negotiated noWalls|roads per room/.test(l),
);
const payload = { code, summary, derived, tail: out.split("\n").slice(-20) };
fs.writeFileSync(path.join(DIR, "fleet-mf6.json"), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
