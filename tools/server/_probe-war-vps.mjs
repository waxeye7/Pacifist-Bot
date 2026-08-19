#!/usr/bin/env node
import fs from "fs";
import { gunzipSync } from "zlib";

const cfg = JSON.parse(fs.readFileSync("screeps.json", "utf8")).vps;
const BASE = `${cfg.protocol || "http"}://${cfg.hostname}`;
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
  const o={t:Game.time, hasWar:typeof war==='function'};
  try { if (typeof war==='function') o.snap=war(); } catch(e){ o.err=String(e&&e.stack||e); }
  try { if (typeof warTargets==='function') o.targets=warTargets(10); } catch(e){ o.tgtErr=String(e&&e.stack||e); }
  try { if (typeof warHome==='function') o.home=warHome(); } catch(e){ o.homeErr=String(e&&e.stack||e); }
  if (!Memory.war) Memory.war={};
  Memory.war.probe=o;
  return 'ok '+Game.time;
})()`;

const res = await fetch(`${BASE}/api/user/console`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ expression: expr }),
});
console.log("console", res.status, (await res.text()).slice(0, 250));
await new Promise((r) => setTimeout(r, 3000));
const memJ = await (await fetch(`${BASE}/api/user/memory`, { headers: { "X-Token": cfg.token, "X-Username": cfg.token } })).json();
const mem = decodeMem(memJ.data);
const p = mem && mem.war && mem.war.probe;
if (!p) {
  console.log("no probe", mem && mem.war && Object.keys(mem.war));
  process.exit(0);
}
console.log("=== t=" + p.t + " hasWar=" + p.hasWar);
if (p.err) console.log("ERR", p.err);
if (p.home) console.log("--- home ---\n" + p.home);
if (p.snap) console.log("--- war() ---\n" + p.snap);
if (p.targets) console.log("--- targets ---\n" + p.targets);
