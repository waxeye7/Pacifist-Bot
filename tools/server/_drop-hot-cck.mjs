#!/usr/bin/env node
/** Cancel queued CCK commands. Live shard3 + VPS. */
import fs from "fs";

const expr =
  "Memory.commandsToExecute=(Memory.commandsToExecute||[]).filter(function(c){return !c||c.formation!=='CCK'});'dropped-cck'";

async function hit(name) {
  const cfg = JSON.parse(fs.readFileSync("screeps.json", "utf8"))[name];
  if (!cfg || !cfg.token) {
    console.log(name, "skip");
    return;
  }
  const port = cfg.port && cfg.port !== 80 && cfg.port !== 443 ? ":" + cfg.port : "";
  const base = (cfg.protocol || "https") + "://" + cfg.hostname + port;
  const body = { expression: expr };
  if (name === "main") body.shard = "shard3";
  const res = await fetch(base + "/api/user/console", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token },
    body: JSON.stringify(body),
  });
  console.log(name, res.status, (await res.text()).slice(0, 180));
}

await hit("vps");
await hit("main");
