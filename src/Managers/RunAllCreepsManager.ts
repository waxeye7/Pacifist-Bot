import QuadSquadRunManager from "./QuadSquadRunManager";
import RunCreepManager from "./RunCreepManager";
import RunPowerCreepManager from "./RunPowerCreepManager";
import { powerDisabled } from "utils/Features";
import { skipHighRclCreep } from "utils/Speedrun";
import { creepRoleIsOptional, skipOptionalCreep } from "utils/CpuPolicy";

/**
 * How many ticks of skip history to keep. Unbounded lifetime totals answer no
 * question anyone asks: live shard3 read `n: 1,480,607` with
 * `roles: { builder: 776367, ... }` — and `builder` has not been an optional
 * role for long enough that nobody could say when it stopped, because the
 * counter had no clock on it. A windowed count says "is the latch biting NOW",
 * which is the only thing this record is ever consulted for.
 */
const CPU_SKIP_WINDOW = 1000;

function noteOptionalSkip(role: string | undefined): void {
    const m: any = Memory;
    let rec = m.cpuSkip;
    // Roll the window: past CPU_SKIP_WINDOW ticks since it opened, start clean.
    if (!rec || typeof rec.since !== "number" || Game.time - rec.since >= CPU_SKIP_WINDOW) {
      rec = m.cpuSkip = { since: Game.time, tick: Game.time, tickN: 0, n: 0, last: Game.time, roles: {} };
    }
    if (rec.tick !== Game.time) {
      rec.tick = Game.time;
      rec.tickN = 0;
    }
    rec.tickN++;
    rec.n++;
    rec.last = Game.time;
    const r = role || "?";
    rec.roles[r] = (rec.roles[r] || 0) + 1;
}

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
    // Two-pass: income/defence first, then discretionary roles while the
    // tick is still under budget. Object.keys order is arbitrary — running
    // optional creeps first would spend the 20-CPU limit on repair and
    // starve the miners. Spawn crisis only ages surplus out; this skips
    // their run() the same tick the bucket is sick.
    const essentialNames: string[] = [];
    const optionalNames: string[] = [];
    function queueCreep(name: string): void {
      if (name.startsWith("SquadCreepA") || name.startsWith("SquadCreepB") || name.startsWith("SquadCreepY") || name.startsWith("SquadCreepZ") || name.startsWith("DuoCreepA") || name.startsWith("DuoCreepB")) {
        executeCreepScriptsLaterList.push(name);
        return;
      }
      const creep = Game.creeps[name];
      const role = creep && creep.memory && creep.memory.role;
      const danger = !!(creep && creep.room && creep.room.memory && creep.room.memory.danger);
      if (danger || !creepRoleIsOptional(role)) essentialNames.push(name);
      else optionalNames.push(name);
    }

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
      queueCreep(name);
    }

    // A creep with NO Memory.creeps entry is invisible to the loop above, so
    // RunCreepManager's `role == undefined -> suicide()` guard can never fire for
    // the exact case it exists for: the creep idles forever as an obstacle
    // (live: Filler-1014650-E17S4). Sweep Game.creeps for names the loop missed.
    // Queue as essential: they have no role yet and must hit the restore path,
    // and must not run ahead of miners on a 20-CPU tick.
    for(const name of Object.keys(Game.creeps)) {
      if(name in Memory.creeps) continue;
      if(skipHighRclCreep(Game.creeps[name])) continue;
      essentialNames.push(name);
    }

    for (const name of essentialNames) RunCreepManager(name);

    const limit = Game.cpu.limit || 20;
    const bucket = Game.cpu.bucket;
    for (const name of optionalNames) {
      const creep = Game.creeps[name];
      if (!creep) continue;
      const role = creep.memory && creep.memory.role;
      if (skipOptionalCreep({
        role,
        usedCpu: Game.cpu.getUsed(),
        limit,
        bucket,
        danger: !!(creep.room.memory && creep.room.memory.danger),
      })) {
        noteOptionalSkip(role);
        continue;
      }
      RunCreepManager(name);
    }

    QuadSquadRunManager(executeCreepScriptsLaterList);
    // gated by Memory.verbose via Logger
    console.log('Creeps Ran in', Game.cpu.getUsed() - start, 'ms');

}

export default RunAllCreepsManager;
