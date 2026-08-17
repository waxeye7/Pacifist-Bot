import { ownedRooms } from "War/reach";
import { roomDistance } from "War/geo";

function mosquito_manager() {
  if (Game.cpu.bucket < 1500) return;
  if (!Memory.e) Memory.e = { mosquito: [] };

  for (let u of Memory.e.mosquito) {
    if (u.ts > 0) {
      const closestRooms = findClosestRooms(u.n);
      for (let closestRoom of closestRooms) {
        if (u.ts > 0) {
          if (global.spawn_mosquito(closestRoom.name, u.n)) {
            u.ts--;
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
