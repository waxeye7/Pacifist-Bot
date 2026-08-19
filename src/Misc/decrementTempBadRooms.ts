/** How long a name stays on the flat AvoidRooms list after it was last seen. */
const AVOID_ROOMS_TTL = 20000;

function decrementTempBadRooms() {
  // ------------------------------------------------------------------
  // AvoidRooms ages PER ENTRY, not as a block.
  //
  // This used to be `if (Game.time % 20000 === 0) Memory.AvoidRooms = []`, a
  // wholesale wipe of every name at once. Every 20,000 ticks the bot forgot
  // every towered room it had ever paid to learn about, and the only way the
  // list ever refilled was by walking another creep into the towers and
  // watching it die (creepFunctions pushes on walk-in). The lesson was
  // re-learned by dying, forever, on a fixed clock.
  //
  // Instead: stamp each name with the tick it was last observed and drop it
  // 20,000 ticks after ITS OWN stamp. The array stays a flat Array<string> —
  // every reader does `.includes` / `_.includes` / `indexOf` (routeCallback in
  // creepFunctions, rooms.remotes, rooms.observe, rooms.ts, SneakyController-
  // Upgrader, SquadCreepA, SquadDuo, WallClearer, MapViz) — so nothing else
  // has to change. Names pushed elsewhere arrive un-stamped and are stamped
  // here on the next pass, which is this same tick or the next one.
  //
  // AvoidRoomsTemp below is a DIFFERENT list: a per-room countdown written by
  // creepFunctions on hostile contact and decremented once per tick here. Both
  // are read independently by the routeCallback; they are not merged.
  // ------------------------------------------------------------------
  if (!Memory.AvoidRoomsAt) {
    Memory.AvoidRoomsAt = {};
  }
  if (Array.isArray(Memory.AvoidRooms)) {
    const stamps = Memory.AvoidRoomsAt;
    const kept: string[] = [];
    for (const roomName of Memory.AvoidRooms as string[]) {
      const at = stamps[roomName];
      if (typeof at !== "number") {
        // New push (or pre-existing entry from before stamping): start its
        // clock now rather than expiring something we have never aged.
        stamps[roomName] = Game.time;
        kept.push(roomName);
        continue;
      }
      // Game.time can go backwards on a server reset — treat a future stamp
      // as "just seen" instead of leaking the entry forever.
      if (at > Game.time) {
        stamps[roomName] = Game.time;
        kept.push(roomName);
        continue;
      }
      if (Game.time - at < AVOID_ROOMS_TTL) {
        kept.push(roomName);
        continue;
      }
      delete stamps[roomName];
    }
    if (kept.length !== Memory.AvoidRooms.length) {
      Memory.AvoidRooms = kept;
    }
    // Stamps for names that were spliced off the array by positive evidence
    // (rooms.remotes / rooms.observe / rooms.ts) would otherwise sit in Memory
    // forever.
    for (const roomName in stamps) {
      if (kept.indexOf(roomName) === -1) delete stamps[roomName];
    }
  } else {
    Memory.AvoidRooms = [];
    Memory.AvoidRoomsAt = {};
  }

  if (!Memory.AvoidRoomsTemp) {
    Memory.AvoidRoomsTemp = {};
    return;
  }
  
  for (const roomName in Memory.AvoidRoomsTemp) {
    const roomValue = Memory.AvoidRoomsTemp[roomName];
    if (typeof roomValue === 'number') {
      if (roomValue > 0) {
        Memory.AvoidRoomsTemp[roomName]--;
      } else if(roomValue < 0){
        Memory.AvoidRoomsTemp[roomName] = 0;
      } else if(roomValue === 0) {
        delete Memory.AvoidRoomsTemp[roomName];
      }
    }
  }
}

export default decrementTempBadRooms;
