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

    // Creeps currently IN a spawn. spawnCreep writes Memory.creeps[name]
    // synchronously on the spawn tick, but depending on engine version the
    // creep joins Game.creeps anywhere between next tick and the END OF THE
    // HATCH (body.length * 3 ticks on the 2026-08-19 VPS rebuild). Any sweep
    // that deletes "memory without a creep" during that window orphans the
    // newborn: it hatches role-undefined and the memoryless-creep sweep
    // below hands it to the role-undefined suicide — every hatchling died at
    // age 0-100 and the empire looped spawn->suicide for hours. The names a
    // spawn is actively hatching are knowable exactly; never touch them.
    const hatching: { [name: string]: boolean } = {};
    for (const sn in Game.spawns) {
      const sp = Game.spawns[sn];
      if (sp.spawning && sp.spawning.name) hatching[sp.spawning.name] = true;
    }

    let executeCreepScriptsLaterList = [];
    const creepNames = Object.keys(Memory.creeps);
    for(let name of creepNames) {
      if(!Game.creeps[name]) {
        if (hatching[name]) continue; // mid-hatch: the owner of this memory is on its way
        // TWO-PASS deletion with a real grace window, not one tick: the entry
        // must have been creep-less (and not hatching) for MAX_BODY hatch time
        // before it goes. For the actually-dead that is ~30 ticks of stale
        // memory; for a newborn on any engine timing it is survival.
        const m: any = Memory.creeps[name];
        if (m && typeof m === "object") {
          if (m._sweep === undefined) {
            m._sweep = Game.time;
            continue;
          }
          if (Game.time - m._sweep < 30) continue;
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
