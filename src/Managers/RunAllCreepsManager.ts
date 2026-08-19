import QuadSquadRunManager from "./QuadSquadRunManager";
import RunCreepManager from "./RunCreepManager";
import RunPowerCreepManager from "./RunPowerCreepManager";
import { powerDisabled } from "utils/Features";
import { skipHighRclCreep } from "utils/Speedrun";

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
        // TWO-PASS deletion, not one. spawnCreep writes Memory.creeps[name]
        // synchronously on the spawn tick, but on older engines (the VPS
        // docker) the creep only joins Game.creeps NEXT tick — so this sweep,
        // running after the rooms phase, deleted every newborn's memory on
        // its birth tick. The creep then lived role-undefined and the
        // memoryless-creep sweep below suicided it: the 2026-08-19 VPS
        // empire collapse (every hatchling dead at age 0, forever). An entry
        // must now be creep-less on two consecutive passes before it goes;
        // for the actually-dead that is one tick of extra memory, for the
        // newborn it is survival.
        const m: any = Memory.creeps[name];
        if (m && m._sweep === undefined) {
          m._sweep = Game.time;
          continue;
        }
        delete Memory.creeps[name];
        continue;
      }
      if ((Memory.creeps[name] as any)._sweep !== undefined) {
        delete (Memory.creeps[name] as any)._sweep;
      }
      if(skipHighRclCreep(Game.creeps[name])) continue;
      if(name.startsWith("SquadCreepA") || name.startsWith("SquadCreepB") || name.startsWith("SquadCreepY") || name.startsWith("SquadCreepZ") || name.startsWith("DuoCreepA") || name.startsWith("DuoCreepB")) {
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
      if(skipHighRclCreep(Game.creeps[name])) continue;
      RunCreepManager(name);
    }

    QuadSquadRunManager(executeCreepScriptsLaterList);
    // gated by Memory.verbose via Logger
    console.log('Creeps Ran in', Game.cpu.getUsed() - start, 'ms');

}

export default RunAllCreepsManager;
