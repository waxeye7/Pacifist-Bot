#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}`;
const H = { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token };

function decodeMem(data) {
  if (data == null || typeof data === "object") return data;
  if (typeof data !== "string") return data;
  if (data.startsWith("gz:")) return JSON.parse(gunzipSync(Buffer.from(data.slice(3), "base64")).toString());
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

const expr = `(function(){
  const o={t:Game.time, hasWar:typeof war==='function', hasDiary:typeof warDiary==='function', hasKit:typeof warKit==='function'};
  try { if (typeof war==='function') o.snap=war(); } catch(e){ o.snapErr=String(e&&e.stack||e); }
  try { if (typeof warTargets==='function') o.targets=warTargets(15); } catch(e){ o.tgtErr=String(e&&e.stack||e); }
  try { if (typeof warHome==='function') o.home=warHome(); } catch(e){ o.homeErr=String(e&&e.stack||e); }
  try { if (typeof warScouts==='function') o.scouts=warScouts(10); } catch(e){ o.scoutErr=String(e&&e.stack||e); }
  if (!Memory.war) Memory.war={};
  Memory.war.probe=o;
  return 'probe '+Game.time+' war='+o.hasWar;
})()`;

const res = await fetch(`${BASE}/api/user/console`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ shard: "shard3", expression: expr }),
});
const j = await res.json();
console.log("console", res.status, JSON.stringify(j).slice(0, 400));

await new Promise((r) => setTimeout(r, 4000));

const memRes = await fetch(`${BASE}/api/user/memory?shard=shard3`, { headers: { "X-Token": cfg.token, "X-Username": cfg.token } });
const memJ = await memRes.json();
const mem = decodeMem(memJ.data);
const probe = mem && mem.war && mem.war.probe;
if (!probe) {
  console.log("no probe yet. war keys:", mem && mem.war ? Object.keys(mem.war) : null);
  process.exit(0);
}
console.log("=== probe t=" + probe.t + " hasWar=" + probe.hasWar + " diary=" + probe.hasDiary + " kit=" + probe.hasKit);
if (probe.snapErr) console.log("SNAP ERR", probe.snapErr);
if (probe.tgtErr) console.log("TGT ERR", probe.tgtErr);
if (probe.homeErr) console.log("HOME ERR", probe.homeErr);
if (probe.scoutErr) console.log("SCOUT ERR", probe.scoutErr);
if (probe.home) console.log("--- home ---\n" + probe.home);
if (probe.snap) console.log("--- war() ---\n" + probe.snap);
if (probe.targets) console.log("--- targets ---\n" + probe.targets);
if (probe.scouts) console.log("--- scouts ---\n" + probe.scouts);
