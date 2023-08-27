function clear_claimed_rooms() {
  if(!Memory.Operations) {
    Memory.Operations = {clear_claimed_rooms:{}};
  }

  for(let roomName in Memory.Operations.clear_claimed_rooms) {

  }

}

export default clear_claimed_rooms;
