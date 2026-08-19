import fs from "fs";
const cfg = JSON.parse(fs.readFileSync("screeps.json", "utf8")).main;
const res = await fetch(`${cfg.protocol}://${cfg.hostname}/api/user/console`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Token": cfg.token, "X-Username": cfg.token },
  body: JSON.stringify({ shard: "shard3", expression: "delete Memory.war.dispatch" }),
});
console.log(await res.text());
