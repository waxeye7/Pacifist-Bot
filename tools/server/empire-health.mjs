#!/usr/bin/env node
/** Local race snapshot + disk. No tokens. No push. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(REPO, "docs/speedrun-ledger/_status-empire.md");
const NODE = process.execPath;

let mean = "";
try {
  mean = execFileSync(NODE, [path.join(REPO, "tools/server/race-mean.mjs")], {
    encoding: "utf8",
    cwd: REPO,
  }).trim();
} catch (e) {
  mean = "race-mean failed: " + (e.message || e);
}

let tick = "?";
try {
  const j = await fetch("http://127.0.0.1:23456/api/game/time", {
    signal: AbortSignal.timeout(8000),
  }).then((r) => r.json());
  tick = String(j.time);
} catch {
  tick = "api down";
}

const lines = [
  `# Empire health`,
  ``,
  `${new Date().toISOString()} · local tick ${tick}`,
  ``,
  "```",
  mean,
  "```",
  ``,
  `Fixes waiting for next push (not mid-race): E39N58 spawn-tile clear,`,
  `RCL6+ site budget 0 when storage below 30k/80k/150k.`,
  ``,
];
fs.writeFileSync(OUT, lines.join("\n"));
process.stdout.write(lines.join("\n") + "\n");
