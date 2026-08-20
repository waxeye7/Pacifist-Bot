#!/usr/bin/env node
/**
 * Dump a private server's world to the plan-suite's OFFLINE room-dump format,
 * over the HTTP API instead of the local docker mongo.
 *
 *   fnm exec --using 22 node tools/server/dump-vps-rooms.mjs --dest vps
 *   fnm exec --using 22 node tools/server/dump-vps-rooms.mjs --dest vps --rooms W3N4,W4N2
 *
 * Writes a JSON array of `{room, terrain, objects}` records — byte-for-byte the
 * shape `fetchRoomsFromMongo`'s ROOMS_FILE branch expects (see
 * tools/plan-suite/v2/shared.mjs:695) — so the whole v2 suite runs against a
 * remote world with the local docker stack DOWN:
 *
 *   ROOMS_FILE=tools/plan-suite/v2/_vps/rooms.json node tools/plan-suite/v2/plan.mjs --rooms W3N4
 *
 * WHY THE API AND NOT MONGO: the VPS's mongo is not reachable from here, and
 * `/api/game/room-terrain?room=X&encoded=1` returns the SAME string mongo's
 * `rooms.terrain` holds — one digit per tile, bit0 wall, bit1 swamp — so no
 * re-encoding happens on the way through. The unencoded form (a list of
 * {x,y,type} tiles) is a different shape the suite cannot read; do not use it.
 *
 * `objects` is narrowed to source/controller/mineral, which is exactly the
 * `$in` the mongo dump applies. The extra fields the API returns on those
 * objects (reservation, sign, invaderHarvested...) are kept: the mongo dump
 * keeps them too, and the ownership pass in push-expansion-pack.mjs --api-owned
 * reads controller.user / controller.reservation.
 *
 * Read-only against the server. It writes one local file.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : dflt;
}

const DEST = arg("dest", "vps");
const OUT = path.resolve(REPO, arg("out", path.join("tools", "plan-suite", "v2", "_vps", "rooms.json")));
const SIZE = Number(arg("size", 5)); // W0N0..W<size>N<size>
const CONCURRENCY = Number(arg("concurrency", 4));

function defaultRooms() {
  const out = [];
  for (let x = 0; x <= SIZE; x++) for (let y = 0; y <= SIZE; y++) out.push(`W${x}N${y}`);
  return out;
}
const ROOMS = arg("rooms", null) ? arg("rooms", null).split(",").map((s) => s.trim()) : defaultRooms();

const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8"))[DEST];
if (!cfg) throw new Error(`no "${DEST}" in screeps.json`);
const port = cfg.port && cfg.port !== 80 && cfg.port !== 443 ? `:${cfg.port}` : "";
const BASE = `${cfg.protocol || "http"}://${cfg.hostname}${port}`;
const HEADERS = { "X-Token": cfg.token, "X-Username": cfg.token };

async function get(endpoint) {
  const res = await fetch(BASE + endpoint, { headers: HEADERS });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok !== 1) throw new Error(`${endpoint}: ${res.status} ${JSON.stringify(json).slice(0, 160)}`);
  return json;
}

const KEEP = new Set(["source", "controller", "mineral"]);

async function dumpRoom(room) {
  const t = await get(`/api/game/room-terrain?room=${room}&encoded=1`);
  const terrain = t.terrain && t.terrain[0] && t.terrain[0].terrain;
  if (typeof terrain !== "string" || terrain.length !== 2500)
    throw new Error(`terrain for ${room} is not a 2500-char string`);
  const o = await get(`/api/game/room-objects?room=${room}`);
  const all = o.objects || [];
  return {
    record: { room, terrain, objects: all.filter((x) => KEEP.has(x.type)) },
    // console-only view of who is sitting on the room
    note: {
      sources: all.filter((x) => x.type === "source").length,
      owner: (all.find((x) => x.type === "controller") || {}).user || null,
      reserved: ((all.find((x) => x.type === "controller") || {}).reservation || {}).user || null,
      spawns: all.filter((x) => x.type === "spawn").map((s) => s.user),
      cores: all.filter((x) => x.type === "invaderCore").length,
      gameTime: o.gameTime,
    },
  };
}

async function main() {
  const me = await get("/api/auth/me").catch(() => ({}));
  console.log(`# ${DEST} ${BASE} user=${me.username || "?"} id=${me._id || "?"} rooms=${ROOMS.length}`);

  const records = [];
  const notes = [];
  const skipped = [];
  const queue = ROOMS.slice();
  await Promise.all(
    Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
      for (let room = queue.shift(); room; room = queue.shift()) {
        try {
          const { record, note } = await dumpRoom(room);
          records.push(record);
          notes.push({ room, ...note });
        } catch (e) {
          skipped.push(`${room}: ${e.message}`);
        }
      }
    }),
  );

  records.sort((a, b) => a.room.localeCompare(b.room));
  notes.sort((a, b) => a.room.localeCompare(b.room));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(records, null, 2));

  console.log("room    src  owner            reserved  spawns  cores");
  for (const n of notes)
    console.log(
      `${n.room.padEnd(7)} ${String(n.sources).padStart(2)}   ${String(n.owner || "-").padEnd(16)} ` +
        `${String(n.reserved || "-").padEnd(9)} ${String(n.spawns.length || "-").padEnd(7)} ${n.cores || "-"}`,
    );
  if (skipped.length) console.log(`skipped ${skipped.length}: ${skipped.join(" | ")}`);
  console.log(`wrote ${OUT} — ${records.length} rooms, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
