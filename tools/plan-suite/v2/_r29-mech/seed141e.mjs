import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPlans, loadRooms, makeChecker, ROOT } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);

const rows = [];
let parseFail = 0;
let seedNeHub = 0;
let seedEqHub = 0;
let seedOnStorage = 0;
let seedOnSitter = 0;
for (const p of plans) {
  const html = path.join(ROOT, `${p.room}.html`);
  if (!fs.existsSync(html)) continue;
  const src = fs.readFileSync(html, "utf8");
  const m = /seed \((\d+),(\d+)\) → hub \((\d+),(\d+)\)/.exec(src);
  if (!m) {
    parseFail++;
    continue;
  }
  const seed = { x: +m[1], y: +m[2] };
  const hub = { x: +m[3], y: +m[4] };
  const eq = seed.x === hub.x && seed.y === hub.y;
  if (eq) seedEqHub++;
  else seedNeHub++;
  const storage = (p.structures?.storage || [])[0];
  const sitter = p.sitter || p.hub;
  if (storage && storage.x === seed.x && storage.y === seed.y) seedOnStorage++;
  if (sitter && sitter.x === seed.x && sitter.y === seed.y) seedOnSitter++;
  if (!eq) rows.push({ room: p.room, seed, hub, storage, sitter, skip: p.meta?.seedSkip, score: p.meta?.seedScore });
}

const a = run("141e-E12S5-seedSkip-1-to-0", "E12S5", (p) => { p.meta.seedSkip = 0; });
const b = run("141e-E12S5-seedScore-to-0", "E12S5", (p) => { p.meta.seedScore = 0; });

console.log(JSON.stringify({
  parseFail, seedEqHub, seedNeHub, seedOnStorage, seedOnSitter,
  neHubN: rows.length,
  neHub: rows,
  seedSkip: a,
  seedScore: b,
}, null, 2));
