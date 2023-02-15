function MemoryManager() {

    if(!Memory.targetRampRoom) {
        Memory.targetRampRoom = {
          room:false,
          urgent:false
        }
      }

      if(!Memory.keepAfloat) {
        Memory.keepAfloat = [];
      }


}

export default MemoryManager;
