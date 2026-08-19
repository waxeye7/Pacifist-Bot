#!/usr/bin/env node
/** POST one short expression to dest main shard3 console. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8")).main;
const BASE = `${cfg.protocol || "https"}://${cfg.hostname}`;
const H = { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token };
const expr = process.argv.slice(2).join(" ");
if (!expr) {
  console.error("usage: node _live-console.mjs <expression>");
  process.exit(2);
}
const res = await fetch(`${BASE}/api/user/console`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ shard: "shard3", expression: expr }),
});
const j = await res.json();
console.log("status", res.status, JSON.stringify(j).slice(0, 800));
if (!res.ok || (j.ok !== 1 && !j.ok)) process.exit(1);
