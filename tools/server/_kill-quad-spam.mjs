#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}`;
const H = { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token };

async function go(expr) {
  const res = await fetch(`${BASE}/api/user/console`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ shard: "shard3", expression: expr }),
  });
  const j = await res.json();
  console.log(res.status, JSON.stringify(j).slice(0, 400));
}

await go("Memory.war.dispatch=false");

await go(
  "(function(){var d={};for(var n in Game.rooms){var r=Game.rooms[n];if(!r.controller||!r.controller.my||!r.memory.spawn_list)continue;var q=r.memory.spawn_list,nx=[],h={A:0,B:0,Y:0,Z:0},x=0;for(var i=0;i+2<q.length;i+=3){var m=q[i+2]&&q[i+2].memory,role=m&&m.role,L=0;if(role&&role.indexOf('SquadCreep')===0)L=role.charAt(role.length-1);if(L){if(h[L]>=1){x++;continue;}h[L]++;}nx.push(q[i],q[i+1],q[i+2]);}if(x){r.memory.spawn_list=nx;d[n]=x;}}if(Memory.commandsToExecute)Memory.commandsToExecute=Memory.commandsToExecute.filter(function(c){return !c||(c.formation!=='RangedQuad'&&c.formation!=='MeleeQuad');});return d;})()"
);
