#!/usr/bin/env node
/** One-shot GET dest `main` shard3 Memory.war + combat-creep census. No writes. */
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
if (!cfg?.token) throw new Error("no main.token");
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}${cfg.port ? ":" + cfg.port : ""}`.replace(/\/+$/, "");
const SHARD = "shard3";
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

const time = await api(`/api/game/time?shard=${SHARD}`);
const memFull = await api(`/api/user/memory?shard=${SHARD}`);
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

const combatRoles = ["Guard", "CCK", "ram", "signifer", "Solomon", "mosquito", "SquadCreepA", "SquadCreepB", "SquadCreepY", "SquadCreepZ"];
let combat = 0;
for (const r of combatRoles) combat += roles[r] || 0;
for (const r of Object.keys(roles)) if (r.indexOf("SquadCreep") === 0 && combatRoles.indexOf(r) < 0) combat += roles[r];

const out = {
  tick: time.json?.time,
  fetched: new Date().toISOString(),
  war: {
    off: !!war.off,
    dispatch: war.dispatch === false ? "OFF" : "ON",
    footing: !!war.footing,
    throttle: !!war.throttle,
    allies: war.allies,
    stats: war.stats || null,
    diary: (war.diary || []).slice(-15),
  },
  queuedCommands: cmds.length,
  mosquitoRows: mos.filter((m) => m && m.ts > 0).map((m) => m.n + "x" + m.ts),
  combatCreeps: combat,
  roles,
  targets: byTarget,
};

const line = [
  `t=${out.tick}`,
  `dispatch=${out.war.dispatch}`,
  `issued=${(war.stats && war.stats.n) || 0}`,
  `combat=${combat}`,
  `cmds=${cmds.length}`,
  `mos=${out.mosquitoRows.length}`,
  `diary=${(war.diary || []).length}`,
].join(" ");

console.log(line);
console.log(JSON.stringify(out, null, 2));

const logDir = path.join(REPO, "docs/speedrun-ledger");
const logFile = path.join(logDir, "_war-night.log");
fs.appendFileSync(logFile, `${out.fetched} ${line}\n`);
if (war.diary && war.diary.length) {
  const last = war.diary[war.diary.length - 1];
  fs.appendFileSync(logFile, `  last ${last.k} ${last.r} <- ${last.h} ${last.w}\n`);
}
