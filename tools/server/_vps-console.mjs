#!/usr/bin/env node
import fs from "fs";
const cfg = JSON.parse(fs.readFileSync("screeps.json", "utf8")).vps;
const BASE = `${cfg.protocol || "http"}://${cfg.hostname}`;
const expr = process.argv.slice(2).join(" ");
if (!expr) {
  console.error("usage: node tools/server/_vps-console.mjs <expression>");
  process.exit(2);
}
const res = await fetch(`${BASE}/api/user/console`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token },
  body: JSON.stringify({ expression: expr }),
});
console.log("status", res.status, JSON.stringify(await res.json()).slice(0, 500));
