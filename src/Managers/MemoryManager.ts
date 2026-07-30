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

      // default silent logs (shard3). Toggle: setVerbose(true) / Memory.verbose = true
      if (Memory.verbose === undefined) {
        Memory.verbose = false;
      }

}

export default MemoryManager;
