import fs from "fs";
import { execFileSync } from "child_process";

const RACE = new Set([
  "E5S3", "E9S1", "E12S3", "E13S9", "E18S9", "E8S5", "E11S6", "E8S3",
  "E16S9", "E4S7", "E18S5", "E6S1", "E12S1", "E3S5", "E13S7", "E21S4",
]);
const tmpIn = process.env.TEMP + "\\p2mem.json";
const tmpOut = process.env.TEMP + "\\p2mem.out.json";

let s = fs.readFileSync(tmpIn, "utf8");
if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
const m = JSON.parse(s);
const notes = [];

const cmds = m.commandsToExecute || [];
m.commandsToExecute = cmds.filter((c) => {
  const t = c.targetRoom || c.room;
  const drop = t && RACE.has(t);
  if (drop) notes.push("drop cmd " + (c.formation || c.role || "?") + " -> " + t);
  return !drop;
});

if (m.target_colonise && RACE.has(m.target_colonise.room)) {
  notes.push("clear target_colonise " + m.target_colonise.room);
  m.target_colonise = {};
}
if (m.expand && RACE.has(m.expand.room)) {
  notes.push("clear expand " + m.expand.room + " phase=" + m.expand.phase);
  m.expand = {};
}

let roomScrub = 0;
if (m.rooms) {
  for (const r of Object.keys(m.rooms)) {
    if (!RACE.has(r)) continue;
    // leave the key; just strip attack targeting if present
    const rm = m.rooms[r];
    if (rm && (rm.target_colonise || rm.CCK || rm.claiming)) roomScrub++;
  }
}

fs.writeFileSync(tmpOut, JSON.stringify(m));
execFileSync("docker", ["cp", tmpOut, "local-screeps-server-redis-1:/tmp/p2mem.out.json"], { stdio: "pipe" });
const set = execFileSync(
  "docker",
  ["exec", "-i", "local-screeps-server-redis-1", "sh", "-c", "redis-cli -x set memory:pacifist2 < /tmp/p2mem.out.json"],
  { encoding: "utf8" },
);
console.log(notes.join("\n") || "no memory edits");
console.log("room keys touched", roomScrub);
console.log("redis", set.trim());
console.log("new cmds", (m.commandsToExecute || []).length);
