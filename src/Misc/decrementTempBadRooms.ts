function decrementTempBadRooms() {
for (const roomName in Memory.AvoidRoomsTemp) {
  const roomValue = Memory.AvoidRoomsTemp[roomName];
  if (roomValue > 0) {
    Memory.AvoidRoomsTemp[roomName] ++;
  } else if(roomValue < 0){
    Memory.AvoidRoomsTemp[roomName] = 0;
  }
}
}

export default decrementTempBadRooms;
