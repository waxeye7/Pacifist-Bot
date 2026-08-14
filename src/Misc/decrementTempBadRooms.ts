function decrementTempBadRooms() {
  // AvoidRooms is push-only except incidental vision splices; wipe on a
  // long cadence so findRoute includes() does not grow without bound.
  // Rooms re-add on the next walk-in.
  if (Game.time % 20000 === 0) {
    Memory.AvoidRooms = [];
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
