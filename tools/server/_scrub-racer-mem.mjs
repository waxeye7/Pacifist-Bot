import fs from "fs";
import { execFileSync } from "child_process";

const RACE = [
  "E5S3", "E9S1", "E12S3", "E13S9", "E18S9", "E8S5", "E11S6", "E8S3",
  "E16S9", "E4S7", "E18S5", "E6S1", "E12S1", "E3S5", "E13S7", "E21S4",
];
const users = ["pacifist1", "pacifist-race"];

for (const user of users) {
  const raw = execFileSync(
    "docker",
    ["exec", "local-screeps-server-redis-1", "redis-cli", "--raw", "get", "memory:" + user],
    { encoding: "utf8" },
  );
  let s = raw;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.replace(/^\u0000+/, "").trim();
  let m;
  if (!s || s === "(nil)") {
    m = {};
  } else {
    try {
      m = JSON.parse(s);
    } catch (e) {
      console.error(user, "PARSE FAIL", e.message, "len", s.length, "head", JSON.stringify(s.slice(0, 40)));
      process.exit(1);
    }
  }
  // All rooms keys, not just the 16. Leftover non-bench basePlan.spawn[0]
  // + no Structures.spawns queues a 24-part CB at RCL3 (cycle-16 hygiene).
  let nRace = 0;
  let nOther = 0;
  if (!m.rooms) m.rooms = {};
  for (const r of Object.keys(m.rooms)) {
    if (RACE.includes(r)) nRace++;
    else nOther++;
    delete m.rooms[r];
  }
  const hadAuto = m.autoExpand != null;
  const hadColonise = m.target_colonise != null;
  delete m.autoExpand;
  delete m.target_colonise;
  m.speedrun = { startTick: null, rclTimes: {}, lastRcl: 0 };
  const tmp = (process.env.TEMP || "/tmp") + "\\mem-" + user + ".json";
  fs.writeFileSync(tmp, JSON.stringify(m));
  execFileSync("docker", ["cp", tmp, "local-screeps-server-redis-1:/tmp/mem-" + user + ".json"]);
  const set = execFileSync(
    "docker",
    ["exec", "-i", "local-screeps-server-redis-1", "sh", "-c", "redis-cli -x set memory:" + user + " < /tmp/mem-" + user + ".json"],
    { encoding: "utf8" },
  );
  console.log(
    user,
    "deleted room keys",
    nRace + nOther,
    "race",
    nRace,
    "other",
    nOther,
    "autoExpand",
    hadAuto,
    "target_colonise",
    hadColonise,
    "redis",
    set.trim(),
  );
}
