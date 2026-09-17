import { ownedRooms, withinTravelBudget } from "War/reach";
import { roomDistance } from "War/geo";

/** Ticks a dispatch row may sit unspawned before it is declared dead. */
const MOSQUITO_TTL = 5000;

function mosquito_manager() {
  if (!Memory.e) Memory.e = { mosquito: [] };
  if (!Memory.e.mosquito) Memory.e.mosquito = [];

  // Rows only ever died by spawning. A target no RCL8 room can reach
  // (findClosestRooms returns []) or a permanent boost drought leaves
  // ts > 0 forever — and dispatch counts live rows against MAX_MOSQUITO (2),
  // so two stuck rows killed the whole system for the rest of the global.
  // Same rule as ExecuteCommandsInNTicks: keep waiting, never forever.
  // Runs before the bucket gate so a long CPU drought still collects them.
  const keep = [];
  for (const u of Memory.e.mosquito) {
    if (!u) continue;
    // A row outlives its spawn count: mosquito_attack keys all in-room
    // combat off the row, so deleting at ts<=0 left the spawned wave to
    // stand at 25,25 for its whole TTL. The %1000 janitor in
    // mosquito_attack owns ts<=0 cleanup (drops once no live creep targets
    // u.n); the TTL here is only for rows that never manage to spawn.
    if (u.ts > 0) {
      if (typeof u.at !== "number") u.at = Game.time;
      if (Game.time - u.at >= MOSQUITO_TTL) {
        console.log("[mosquito] dropping stale dispatch to", u.n, "- no spawn in", MOSQUITO_TTL, "ticks");
        continue;
      }
    }
    keep.push(u);
  }
  if (keep.length !== Memory.e.mosquito.length) Memory.e.mosquito = keep;

  if (Game.cpu.bucket < 1500) return;

  for (let u of Memory.e.mosquito) {
    if (u.ts > 0) {
      const closestRooms = findClosestRooms(u.n);
      for (let closestRoom of closestRooms) {
        if (u.ts > 0) {
          if (global.spawn_mosquito(closestRoom.name, u.n)) {
            u.ts--;
            u.at = Game.time; // progress resets the clock
            continue;
          }
        }
      }
    }
  }
}

/** Closest owned RCL8 rooms with storage/terminal and ≥10k energy, within 5. */
function findClosestRooms(roomName: string): Room[] {
  const range = 5;
  const myRooms: Room[] = [];
  const names = ownedRooms();
  for (let i = 0; i < names.length; i++) {
    const myRoomName = names[i];
    if (roomDistance(roomName, myRoomName) > range) continue;
    // Straight-line distance is not the walk: a near room behind an
    // SK/avoided-room detour strands the wave in transit for most of its
    // TTL. travelHops is memoised, so this costs a findRoute at most once
    // per (home,target) per 1500 ticks.
    if (!withinTravelBudget(myRoomName, roomName)) continue;
    const room = Game.rooms[myRoomName];
    const storage = room && room.storage;
    const terminal = room && room.terminal;
    if (
      room &&
      storage &&
      terminal &&
      room.controller &&
      room.controller.my &&
      room.controller.level === 8 &&
      storage.store[RESOURCE_ENERGY] >= 10000
    ) {
      myRooms.push(room);
    }
  }
  myRooms.sort((a, b) => roomDistance(roomName, a.name) - roomDistance(roomName, b.name));
  return myRooms.slice(0, 3);
}

export default mosquito_manager;
