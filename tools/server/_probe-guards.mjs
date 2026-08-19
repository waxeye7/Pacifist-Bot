#!/usr/bin/env node
import fs from "fs";
import { gunzipSync } from "zlib";

const cfg = JSON.parse(fs.readFileSync("screeps.json", "utf8")).main;
const BASE = `${cfg.protocol}://${cfg.hostname}`;
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
  const out={t:Game.time, guards:[], queues:{}};
  for (const n in Game.creeps) {
    const c=Game.creeps[n];
    if (!c.memory||c.memory.role!=='Guard') continue;
    out.guards.push({n:c.name,t:c.memory.targetRoom,h:c.memory.homeRoom,room:c.room.name,ttl:c.ticksToLive,hits:c.hits});
  }
  for (const n in Game.rooms) {
    const r=Game.rooms[n];
    if (!r.controller||!r.controller.my||!r.memory.spawn_list) continue;
    const q=r.memory.spawn_list;
    const roles=[];
    for (let i=0;i+2<q.length;i+=3) {
      const m=q[i+2]&&q[i+2].memory;
      if (m) roles.push((m.role||'?')+':'+(m.targetRoom||''));
    }
    if (roles.length) out.queues[n]={len:q.length/3,roles:roles.slice(0,20)};
  }
  const rec=Memory.war&&undefined;
  out.cmds=(Memory.commandsToExecute||[]).slice(0,8);
  if (!Memory.war) Memory.war={};
  Memory.war.gprobe=out;
  return 'ok';
})()`;

const res = await fetch(`${BASE}/api/user/console`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ shard: "shard3", expression: expr }),
});
console.log("console", res.status);
await new Promise((r) => setTimeout(r, 5000));
const memJ = await (await fetch(`${BASE}/api/user/memory?shard=shard3`, { headers: { "X-Token": cfg.token, "X-Username": cfg.token } })).json();
const mem = decodeMem(memJ.data);
const p = mem && mem.war && mem.war.gprobe;
console.log(JSON.stringify(p, null, 2));
console.log("stats", mem && mem.war && mem.war.stats);
console.log("diary-tail", mem && mem.war && mem.war.diary && mem.war.diary.slice(-8));
