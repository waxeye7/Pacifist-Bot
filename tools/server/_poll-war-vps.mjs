#!/usr/bin/env node
/** One-shot GET dest `vps` Memory.war + combat census. No writes. */
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).vps;
if (!cfg?.token) throw new Error("no vps.token");
const BASE = `${cfg.protocol || "http"}://${cfg.hostname}${cfg.port && cfg.port !== 80 && cfg.port !== 443 ? ":" + cfg.port : ""}`.replace(/\/+$/, "");
const H = { "X-Token": cfg.token, "X-Username": cfg.token };

function decodeMem(data) {
  if (data == null) return data;
  if (typeof data === "object") return data;
  if (typeof data !== "string") return data;
  if (data.startsWith("gz:")) {
    return JSON.parse(gunzipSync(Buffer.from(data.slice(3), "base64")).toString());
  }
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

async function api(p) {
  const url = p.startsWith("http") ? p : `${BASE}${p}`;
  const res = await fetch(url, { headers: H });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

const time = await api("/api/game/time");
const memFull = await api("/api/user/memory");
const mem = decodeMem(memFull.json?.data) || {};
const war = mem.war || {};
const cmds = mem.commandsToExecute || [];
const mos = (mem.e && mem.e.mosquito) || [];
const creeps = mem.creeps || {};

const roles = {};
const byTarget = {};
for (const name of Object.keys(creeps)) {
  const c = creeps[name];
  const role = (c && c.role) || "?";
  roles[role] = (roles[role] || 0) + 1;
  if (c && c.targetRoom) {
    if (!byTarget[c.targetRoom]) byTarget[c.targetRoom] = [];
    byTarget[c.targetRoom].push(role);
  }
}

const combatRoles = ["Guard", "CCK", "ram", "signifer", "Solomon", "mosquito", "scout", "SquadCreepA", "SquadCreepB", "SquadCreepY", "SquadCreepZ"];
let combat = 0;
for (const r of combatRoles) combat += roles[r] || 0;

const line = [
  `t=${time.json?.time}`,
  `dispatch=${war.dispatch === false ? "OFF" : "ON"}`,
  `issued=${(war.stats && war.stats.n) || 0}`,
  `combat=${combat}`,
  `cmds=${cmds.length}`,
  `mos=${mos.filter((m) => m && m.ts > 0).length}`,
  `diary=${(war.diary || []).length}`,
].join(" ");
console.log(line);
console.log(JSON.stringify({ tick: time.json?.time, war: { dispatch: war.dispatch === false ? "OFF" : "ON", stats: war.stats || null, diary: (war.diary || []).slice(-8) }, roles, targets: byTarget, cmds: cmds.length }, null, 2));

const logFile = path.join(REPO, "docs/speedrun-ledger/_war-vps.log");
fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
