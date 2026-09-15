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

      // CPU is the one top-level field still seeded at the END of the tick
      // (inside CPUmanager, after creeps run). Every Memory.CPU.* touch before
      // that — the danger rung's `reduce` writes in rooms(), the spawn
      // producer's reduce read, a console command's fiveHundredTickAvg read —
      // is a TypeError on the first tick of a fresh deploy or after a partial
      // memory wipe. Seed the whole shape here; CPUmanager's own guards stay
      // and become no-ops.
      if(!Memory.CPU) {
        Memory.CPU = {};
      }
      if(!Memory.CPU.hundredTickAvg) {
        Memory.CPU.hundredTickAvg = {data: [], avg: 0};
      }
      if(!Memory.CPU.fiveHundredTickAvg) {
        Memory.CPU.fiveHundredTickAvg = {data: [], avg: 0};
      }

}

export default MemoryManager;
