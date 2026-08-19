#!/usr/bin/env node
/** Shard3 live recovery via small console POSTs. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}`;
const H = { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cons(expr, label) {
  if (expr.length > 980) {
    console.error(label, "TOO LONG", expr.length);
    process.exit(2);
  }
  const res = await fetch(`${BASE}/api/user/console`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ shard: "shard3", expression: expr }),
  });
  const j = await res.json().catch(() => ({}));
  console.log(label, res.status, expr.length, JSON.stringify(j).slice(0, 220));
  return res.ok && (j.ok === 1 || j.ok === true) && !j.error;
}

function trimRoom(room) {
  return `(function(){var k=0,s=0,v=0,n,c;for(n in Game.creeps){c=Game.creeps[n];if(!c||c.room.name!=="${room}")continue;if(c.memory.role!=="builder"&&c.memory.role!=="buildcontainer")continue;if(k<4){c.memory.role="builder";c.memory.homeRoom="${room}";c.memory.targetRoom="${room}";delete c.memory.suicide;k++;}else if(v<4&&c.getActiveBodyparts(CARRY)>0){c.memory.role="carry";c.memory.homeRoom="${room}";delete c.memory.targetRoom;v++;}else{c.suicide();s++;}}return "${room} k"+k+" v"+v+" s"+s;})()`;
}

function queueMiners(room, miners) {
  const extra =
    miners === 2
      ? `q.push([WORK,WORK,MOVE],"EM-fixb-"+t+"-${room}",{memory:{role:"EnergyMiner",homeRoom:"${room}"}});`
      : "";
  return `(function(){var r=Game.rooms.${room};if(!r)return "no ${room}";var n=0,i,c;for(i in Game.creeps){c=Game.creeps[i];if(c&&c.room.name==="${room}"&&c.memory.role==="EnergyMiner")n++;}var t=Game.time,q=[];if(n<2){q.push([WORK,WORK,MOVE],"EM-fixa-"+t+"-${room}",{memory:{role:"EnergyMiner",homeRoom:"${room}"}});${extra}}q.push([CARRY,CARRY,MOVE,MOVE],"CA-fix-"+t+"-${room}",{memory:{role:"carry",homeRoom:"${room}"}});r.memory.spawn_list=q;r.memory.spawnStall=0;return "${room} q"+q.length/3+" miners"+n;})()`;
}

const steps = [
  ["trim-E36N57", trimRoom("E36N57")],
  ["trim-E37N59", trimRoom("E37N59")],
  ["trim-E37N58", trimRoom("E37N58")],
  ["trim-E39N58", trimRoom("E39N58")],
  ["q-E36N57", queueMiners("E36N57", 2)],
  ["q-E37N59", queueMiners("E37N59", 1)],
];

let ok = true;
for (const [label, expr] of steps) {
  const r = await cons(expr, label);
  if (!r) ok = false;
  await sleep(3500);
}
if (!ok) process.exit(1);
console.log("posted all");
