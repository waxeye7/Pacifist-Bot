function decrementTempBadRooms() {
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
