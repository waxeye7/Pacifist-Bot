#!/usr/bin/env node
/** Fire dropRoom("E36N58") on dest main shard3. Never E36N57. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}`;
const H = { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token };

const expr =
  'typeof dropRoom==="function"?dropRoom("E36N58"):(Memory.dropRoom="E36N58","armed Memory.dropRoom")';

const res = await fetch(`${BASE}/api/user/console`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ shard: "shard3", expression: expr }),
});
const j = await res.json();
console.log("status", res.status, JSON.stringify(j).slice(0, 400));
if (!res.ok || j.ok !== 1) process.exit(1);
