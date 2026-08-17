#!/usr/bin/env node
/**
 * Run an expression on a server and read the result back out of Memory.
 *
 *   fnm exec --using 22 node tools/server/exec.mjs --dest main --shard shard3 --file probe.js
 *   fnm exec --using 22 node tools/server/exec.mjs --dest main --expr "Game.time"
 *
 * The expression's value is stringified into `Memory.__probe`, then polled back
 * via /api/user/memory?path=__probe. This dodges the console-output websocket
 * entirely, so it works for results far larger than a console line.
 *
 * --write is required for any expression that mutates game state; without it the
 * script refuses expressions containing obvious mutation verbs, as a guard
 * against fat-fingering a destructive probe at the live server.
 */
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function arg(n, d) {
  const i = process.argv.indexOf("--" + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
}
const has = (n) => process.argv.includes("--" + n);

const DEST = arg("dest", "main");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8"))[DEST];
if (!cfg) {
  console.error("no dest " + DEST);
  process.exit(2);
}
const SHARD = arg("shard", cfg.hostname === "screeps.com" ? "shard3" : "");
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}${cfg.port && cfg.port !== 80 && cfg.port !== 443 ? ":" + cfg.port : ""}`;
const H = { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token };

let body = arg("expr", null);
const file = arg("file", null);
if (file) body = fs.readFileSync(path.isAbsolute(file) ? file : path.join(REPO, file), "utf8");
if (!body) {
  console.error("need --expr or --file");
  process.exit(2);
}

const MUTATORS = /\b(?:suicide|destroy|unclaim|removeConstructionSite|createConstructionSite|launchNuke|spawnCreep|activateSafeMode|deal\(|Memory\s*=|delete\s+Memory)\b/;
if (!has("write") && MUTATORS.test(body)) {
  console.error("expression looks mutating; pass --write to allow");
  process.exit(2);
}

// The console endpoint caps expression size well below the size of a useful
// probe, so the source is staged through Memory (which takes ~2MB) and the
// console only ever carries a short eval shim.
const memPost = (path, value) =>
  fetch(`${BASE}/api/user/memory`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(SHARD ? { shard: SHARD, path, value } : { path, value }),
  });

/*
 * A memory POST and a console POST are two independent requests against a
 * server that is ticking underneath both, and nothing orders them: the console
 * expression can run before the staged source has landed, and a separate
 * "clear the old result" POST can land AFTER the expression has written the new
 * one and wipe it. Both were observed against the VPS (300ms ticks).
 *
 * So: no pre-clear (the nonce identifies our own result), the wrapper does NOT
 * consume Memory.__src, and the console expression is simply re-sent until the
 * nonce shows up. Re-running it is harmless because it is the same expression
 * against the same staged source.
 */
const NONCE = "n" + process.pid + "_" + Math.random().toString(36).slice(2, 8);

// The staged source carries the nonce too. Without it the expression happily
// runs whatever a PREVIOUS invocation left in __src (its result is then tagged
// with this run's nonce and looks perfectly valid), which is how a probe for
// room sources came back with an earlier run's "ping <tick>".
const staged = await memPost("__src", { n: NONCE, c: body });
if (!staged.ok) {
  console.error("staging Memory.__src failed", staged.status);
  process.exit(1);
}

const wrapped = `(function(){try{var s=Memory.__src;if(!s||s.n!=="${NONCE}")return "stale-src";var __v=new Function(s.c)();Memory.__probe="${NONCE}"+((typeof __v==="string")?__v:JSON.stringify(__v));return "ok "+Game.time;}catch(e){Memory.__probe="${NONCE}THREW: "+(e&&(e.stack||e.message)||e);return "threw";}})()`;

async function fireConsole() {
  const post = await fetch(`${BASE}/api/user/console`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(SHARD ? { shard: SHARD, expression: wrapped } : { expression: wrapped }),
  });
  const pj = await post.json().catch(() => ({}));
  if (!post.ok || pj.ok !== 1) {
    console.error("console POST failed", post.status, JSON.stringify(pj).slice(0, 300));
    process.exit(1);
  }
}
await fireConsole();

function decode(data) {
  if (data == null || typeof data === "object") return data;
  if (typeof data !== "string") return data;
  if (data.startsWith("gz:")) {
    try {
      return JSON.parse(gunzipSync(Buffer.from(data.slice(3), "base64")).toString());
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

const q = SHARD ? `&shard=${SHARD}` : "";
let out = null;
for (let i = 0; i < 50 && out == null; i++) {
  await new Promise((r) => setTimeout(r, 1200));
  const res = await fetch(`${BASE}/api/user/memory?path=__probe${q}`, { headers: H });
  const j = await res.json().catch(() => ({}));
  const v = decode(j.data);
  if (typeof v === "string" && v.startsWith(NONCE)) {
    out = v.slice(NONCE.length);
    break;
  }
  // Re-fire every ~6s: the first attempt may have run before the staged
  // source landed, and there is no way to observe that from out here.
  if (i % 5 === 4) await fireConsole();
}
if (out == null) {
  console.error("no result after ~60s (is the bot running? is the code deployed and ticking?)");
  await memPost("__src", "");
  process.exit(1);
}
if (typeof out === "string" && (out.startsWith("{") || out.startsWith("["))) {
  try {
    console.log(JSON.stringify(JSON.parse(out), null, 1));
  } catch {
    console.log(out);
  }
} else {
  console.log(out);
}

// Tidy up the staging slots. Safe to do now: the nonce has already been
// matched, so a late-landing clear cannot eat this run's answer.
await memPost("__src", "");
await memPost("__probe", "");
