#!/usr/bin/env node
/** Keep 4 upgraders in E36N57; suicide the rest. Never touch E36N57 claim. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}`;
const H = { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token };

const expr = `
(function(){
  const room="E36N57";
  const keep=4;
  const ups=_.filter(Game.creeps, c => c.memory.role==="upgrader" && (c.room.name===room || c.memory.homeRoom===room));
  ups.sort((a,b)=>(a.ticksToLive||0)-(b.ticksToLive||0));
  let n=0;
  for (let i=0;i<ups.length-keep;i++){ ups[i].suicide(); n++; }
  return "cull "+n+" keep "+Math.min(keep,ups.length)+" of "+ups.length;
})()
`;

const res = await fetch(`${BASE}/api/user/console`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ shard: "shard3", expression: expr }),
});
const j = await res.json();
console.log("status", res.status, JSON.stringify(j).slice(0, 400));
if (!res.ok || j.ok !== 1) process.exit(1);
