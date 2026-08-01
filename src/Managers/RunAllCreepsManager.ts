import QuadSquadRunManager from "./QuadSquadRunManager";
import RunCreepManager from "./RunCreepManager";
import RunPowerCreepManager from "./RunPowerCreepManager";
import { powerDisabled } from "utils/Features";

function RunAllCreepsManager() {

    const start = Game.cpu.getUsed()


    if (!powerDisabled()) {
        RunPowerCreepManager();
    }


    // Cold start (fresh server / wiped Memory): the engine only creates
    // Memory.creeps once a creep has existed, and nothing else in the bot seeds
    // it (MemoryManager does not), so Object.keys(undefined) throws and takes the
    // whole creep loop down. Seed it here, before the sweeps below that also
    // `delete Memory.creeps[name]` and test `name in Memory.creeps`.
    if(!Memory.creeps) {
        Memory.creeps = {};
    }

    let executeCreepScriptsLaterList = [];
    const creepNames = Object.keys(Memory.creeps);
    for(let name of creepNames) {
      if(!Game.creeps[name]) {
        delete Memory.creeps[name];
        continue;
      }
      if(name.startsWith("SquadCreepA") || name.startsWith("SquadCreepB") || name.startsWith("SquadCreepY") || name.startsWith("SquadCreepZ")) {
        executeCreepScriptsLaterList.push(name);
      }
      else {
        RunCreepManager(name);
      }
    }

    // A creep with NO Memory.creeps entry is invisible to the loop above, so
    // RunCreepManager's `role == undefined -> suicide()` guard can never fire for
    // the exact case it exists for: the creep idles forever as an obstacle
    // (live: Filler-1014650-E17S4). Sweep Game.creeps for names the loop missed.
    for(const name of Object.keys(Game.creeps)) {
      if(name in Memory.creeps) continue;
      RunCreepManager(name);
    }

    QuadSquadRunManager(executeCreepScriptsLaterList);
    // gated by Memory.verbose via Logger
    console.log('Creeps Ran in', Game.cpu.getUsed() - start, 'ms');

}

export default RunAllCreepsManager;
