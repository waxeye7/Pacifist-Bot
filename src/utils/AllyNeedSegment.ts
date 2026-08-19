/**
 * Public need-segment for the market-bot battery.
 *
 * Market-bot reads this as a foreign segment (id 7) and learns our rooms,
 * energy, free storage, and mineral/T3 holes without a hardcoded room list.
 * New claims show up here; lost rooms drop out.
 */

import { requestSegments } from "./Segments";

export const ALLY_NEED_SEGMENT = 7;

const T3 = ["XUH2O", "XUHO2", "XKH2O", "XKHO2", "XLH2O", "XLHO2", "XZH2O", "XZHO2", "XGH2O", "XGHO2"];
const RAW = ["O", "H", "U", "L", "Z", "K", "X"];

function stockOf(storage: StoreDefinition | undefined, terminal: StoreDefinition | undefined, key: string): number {
  return ((storage && storage[key]) || 0) + ((terminal && terminal[key]) || 0);
}

export function publishAllyNeed(): void {
  // setActiveSegments is next-tick. Request every tick so 7 stays mounted;
  // only rewrite the payload on the cadence once it is actually readable.
  requestSegments([ALLY_NEED_SEGMENT]);
  if (RawMemory.segments[ALLY_NEED_SEGMENT] === undefined) return;
  if (Game.time % 20 !== 7) return;

  let username = "";
  for (const name in Game.spawns) {
    const spawn = Game.spawns[name];
    if (spawn && spawn.owner && spawn.owner.username) {
      username = spawn.owner.username;
      break;
    }
  }

  const rooms: any[] = [];
  for (const name in Game.rooms) {
    const room = Game.rooms[name];
    if (!room.controller || !room.controller.my) continue;
    const storage = room.storage;
    const terminal = room.terminal;
    const sStore = storage && storage.store;
    const tStore = terminal && terminal.store;
    const stock: { [k: string]: number } = {};
    for (let i = 0; i < RAW.length; i++) stock[RAW[i]] = stockOf(sStore, tStore, RAW[i]);
    for (let i = 0; i < T3.length; i++) stock[T3[i]] = stockOf(sStore, tStore, T3[i]);
    rooms.push({
      n: name,
      e: stockOf(sStore, tStore, RESOURCE_ENERGY),
      free: storage ? storage.store.getFreeCapacity() : 0,
      cap: storage ? storage.store.getCapacity() : 0,
      term: !!terminal,
      termFree: terminal ? terminal.store.getFreeCapacity() : 0,
      stock
    });
  }

  RawMemory.segments[ALLY_NEED_SEGMENT] = JSON.stringify({
    v: 1,
    u: username,
    t: Game.time,
    rooms
  });
  RawMemory.setPublicSegments([ALLY_NEED_SEGMENT]);
}
