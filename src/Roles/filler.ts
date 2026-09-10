/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { isUndeliverable, isUnreachableId, blacklistFillTarget } from "utils/Reachability";
import { planSitter } from "utils/PlanV2";
import { cachedDerived, cachedMyStructures } from "utils/RoomCache";
import { fillerBody, fillerName } from "Rooms/spawnSafety";
import { managerErrand } from "Roles/energyManager";

/**
 * The room's real, un-reserved fill need, nearest first.
 *
 * creep.findFillerTarget() hands out RESERVATIONS (room.memory.reserveFill) and
 * only ever releases one again on a successful transfer. A loaded filler asks
 * it for a target up to TWICE per tick - once for the structure it is filling
 * and once for the look-ahead it walks to next - so with a few fillers alive the
 * reserve list covers every extension in the room within a handful of ticks.
 * From then on findFillerTarget() returns FALSE for every filler at once and
 * they all sit on full stores doing nothing. Live E14S9: 4 fillers, 34k
 * banked in storage, room energy 119/1300, extensions climbing +1 a tick off
 * spawn regeneration alone.
 *
 * This function ignores reservations entirely and is the delivery guarantee:
 * while anything in the room still wants energy, a carrying filler has
 * somewhere to go. Priority is a NEARLY-dry tower, then spawn and extensions
 * (they are what blocks spawning), then any tower below half.
 */

/**
 * Energy a tower is topped up to before the extension network gets anything.
 *
 * Towers used to be strictly last: they were only offered as a target once
 * EVERY spawn and extension in the room was full. In a room that is spending
 * everything it earns that never happens, so the towers simply stay at zero —
 * live shard3 E37N59 sat at RCL6 with both towers on 4 and 0 of 1000 while 24
 * of its 37 extensions were empty and a container 10 tiles away held 2000.
 *
 * A dry tower is not a slow room, it is an undefended one, and this bot has
 * already been through that exact failure: see offerEmergencyFeed, written
 * after a 50-part Invader parked on E37N59's spawn with the towers on empty.
 *
 * 200 is one tower shot at close range plus change — enough to make an
 * opportunist reconsider and to buy the time the defence roles need. It is a
 * floor, not a fill: above it towers go back to being last in line, so the
 * spawn queue still gets essentially all of the room's throughput.
 */
export const TOWER_FLOOR = 200;

/**
 * Smallest pile of salvage a filler will break stride for.
 *
 * ── WHY THIS IS NOT `MaxStorage` ────────────────────────────────────────────
 *
 * The three probes below used to demand `>= MaxStorage` — a pile big enough to
 * fill the creep COMPLETELY. That makes anything under one full load invisible
 * forever, and a filler's load is 600 at RCL6 and 1000 at RCL7 (fillerPartCap),
 * so it was invisible by a wide margin.
 *
 * What actually lands on a hub floor is a creep's dying carry, and that is
 * always a PARTIAL load. Measured live shard3 2026-09-10, six of seven rooms,
 * with the piles sampled twice 27 ticks apart:
 *
 *   E37N58  265 -> 231 @21,17   (spawn is 20,17)
 *   E36N57  260 -> 233 @20,27   (spawn is 20,26)
 *   E39N58  226 -> 199 @14,25   (spawn is 14,24)
 *   E35N58  179 -> 152 @23,21   (spawn is 22,21)
 *
 * Every one of them fell by exactly 27 over 27 ticks — i.e. pure decay
 * (1/1000 per tick, so 1/tick at this size) and ZERO collection, on tiles a
 * filler stands next to constantly. The owner's report was "some energy on
 * floor randomly"; this is the half of it that is not a missing container.
 *
 * The threshold is not silly in principle — one intent per tick means a
 * pickup COSTS that tick's withdraw, so hoovering dust would trade fill
 * throughput for scraps. But the trade is asymmetric: a pile on the floor
 * decays to NOTHING, while a partial load only means one more trip later.
 * 100 is two CARRY parts' worth — comfortably worth an intent, and small
 * enough that a real death drop is never walked past again.
 *
 * The geometry is handled separately and is unchanged: `lootRange` is 1 while
 * the hub has energy (so this only fires on salvage the filler is already
 * standing next to, which costs no movement at all) and 10 only when the hub
 * is dry, where any energy at all is worth the walk.
 */
const LOOT_MIN = 100;

/**
 * How far a filler will look for salvage WHILE the hub can still supply it.
 *
 * This was 1, and 1 is measured from the CREEP, not from the storage — which
 * is the reason lowering LOOT_MIN alone changed nothing. The collect leg only
 * runs when the filler is empty, and an empty filler is standing at the
 * STORAGE; the piles that accumulate are dying creeps' carry, and creeps die
 * where they work, which is at the SPAWN and the extension ring. Those are
 * different tiles.
 *
 * Measured live shard3 2026-09-10, after LOOT_MIN shipped — every pile still
 * losing exactly 1/tick, i.e. still pure decay and still zero collection:
 *
 *   storage -> spawn         2-3 tiles (all seven rooms)
 *   E37N59  drop @35,32      2 from storage
 *   E37N58  drop @21,17      2
 *   E35N58  drop @23,21      2
 *   E36N57  drop @20,27      3
 *   E39N58  drop @14,25      1
 *
 * So 3 is the radius that actually contains a v2 hub, and it is bounded on
 * purpose. The failure the old range-10 leash caused is quoted above: a filler
 * locked a SOURCE pile 8 tiles out (E17S4: storage 41,34 -> miner drop 33,42)
 * and then walked the base for it every trip while the spawn sat at 64. Three
 * tiles cannot reach a source; it reaches the hub's own floor and nothing
 * else, so the detour is inside the route the filler already walks.
 */
const HUB_LOOT_RANGE = 3;

/**
 * One room-wide candidate list for fillNeed(), memoised per room per tick.
 *
 * fillNeed() ran up to FOUR room-wide FIND_MY_STRUCTURES passes, and a loaded
 * filler calls it TWICE per tick — once for the structure it delivers to and
 * once for the look-ahead on the leftover in its store — so an 8-filler room
 * paid up to eight room-wide passes per filler per tick for four answers that
 * are the same for every filler in it. Measured shard3 (limit 20, avg 20.6):
 * the filler role alone was 2.26 CPU across 8 creeps.
 *
 * Its sibling creep.findFillerTarget() has already been split this way —
 * see creepFunctions :363 (fillSpawnExt) and :439 (fillTowers) — and this is
 * the identical split, with the identical justification: what goes IN the memo
 * is structure type and store, and stores only settle BETWEEN ticks (transfer
 * is an intent, which is the whole reason the reservation ledger exists), so
 * the candidate set is a room/tick constant.
 *
 * What deliberately stays OUT of the memo, re-evaluated per creep per call:
 *
 *   excludeId        the caller's own current target on the look-ahead path.
 *   isUndeliverable  a room-wide TTL blacklist that advanceTo() WRITES TO
 *                    DURING THE TICK — a filler that gives up on a target
 *                    blacklists it for everyone (APPROACH_GIVE_UP above), so
 *                    folding this into the memo would keep handing the rest of
 *                    the fleet a target the room has just written off.
 *   isUnreachableId  same story, the physical half of it.
 *
 * Keys are private to this function rather than shared with findFillerTarget's:
 * the two predicates happen to coincide today for spawn/extension and must be
 * free to diverge without silently changing the other caller's answer.
 *
 * The list is returned in engine FIND order and only ever filtered afterwards,
 * so findClosestByRange() breaks ties on exactly the order it always did.
 */
function fillCandidates(room, key: string, want: (s: any) => boolean): any[] {
    return cachedDerived(room, key, () => cachedMyStructures(room).filter(want));
}

function fillNeed(creep, excludeId?, spawnOnly?) {
    const room = creep.room;
    // A tower under the floor outranks the extension network. Only when the
    // caller has asked for spawn/extension targets specifically (spawnOnly)
    // does this step aside, since that path exists to unblock spawning.
    if(!spawnOnly) {
        const dryTowers = fillCandidates(room, "fillNeedDryTowers", (s: any) =>
            s.structureType == STRUCTURE_TOWER
            && s.store[RESOURCE_ENERGY] < TOWER_FLOOR
            && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
            .filter((s: any) => s.id !== excludeId && !isUndeliverable(room, s.id));
        if(dryTowers.length) {
            return creep.pos.findClosestByRange(dryTowers);
        }
    }

    // isUndeliverable(): an extension with no walkable approach is hungry
    // FOREVER, which makes it permanently the nearest hungry structure to a
    // filler standing in the hub. Without this filter the whole fill layer
    // parks on it — E11S2 lost two loaded fillers to extension@18,36 and E9S2
    // lost two carriers to extension@20,39, both walled in by extensions the
    // current plan does not want. See utils/Reachability.
    let targets = fillCandidates(room, "fillNeedSpawnExt", (s: any) =>
        (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION)
        && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
        .filter((s: any) => s.id !== excludeId && !isUndeliverable(room, s.id));
    if(targets.length == 0 && spawnOnly) {
        return null;
    }
    if(targets.length == 0) {
        targets = fillCandidates(room, "fillNeedHalfTowers", (s: any) =>
            s.structureType == STRUCTURE_TOWER
            && s.store[RESOURCE_ENERGY] < s.store.getCapacity(RESOURCE_ENERGY) / 2)
            .filter((s: any) => s.id !== excludeId && !isUndeliverable(room, s.id));
    }
    if(targets.length == 0) {
        // Last resort: this function is the room's DELIVERY GUARANTEE, so it
        // may never answer "nowhere to go" just because the heuristic
        // blacklist got greedy. Retry with only the exact, physical filter -
        // a structure with no walkable approach is still off the table, but
        // everything else is back on it.
        targets = fillCandidates(room, "fillNeedAnyFillable", (s: any) =>
            (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION
             || s.structureType == STRUCTURE_TOWER)
            && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
            .filter((s: any) => s.id !== excludeId && !isUnreachableId(room, s.id));
    }
    if(targets.length == 0) {
        return null;
    }
    return creep.pos.findClosestByRange(targets);
}

/**
 * Move one step towards a fill target, and GUARANTEE the step happens.
 *
 * creep.MoveCostMatrixRoadPrio() drives PathFinder with a road-priority cost
 * matrix at maxRooms 1 / maxOps 1000. When that search comes back EMPTY it
 * still stores the empty path and calls move(undefined), so the creep silently
 * stays where it is - and because the stored path is empty it re-runs the same
 * failing search every tick forever. Live E14S9 after the reservation fix: two
 * LOADED fillers parked at range 2 from half-empty extensions, fatigue 0,
 * memory.path = [], for 130+ ticks, while the room ran on 42 of 1300 energy.
 *
 * So: if the creep has not left its tile for three ticks running, drop the
 * cached path and hand the step to the engine's own moveTo, which has no such
 * failure mode. Normal traffic jams resolve inside those three ticks and never
 * reach the fallback.
 */
/**
 * How long a filler may chase ONE target without ever getting adjacent to it
 * before the room writes that target off. This is the catch-all behind the
 * reachability flood fill: it also covers targets that are technically
 * reachable but effectively not (a permanent traffic wedge, a creep parked in
 * the only approach tile, a door that only opens when someone dies).
 */
const APPROACH_GIVE_UP = 50;

/** Same TTL/refresh as creepFunctions.liveReserveFill — do not blanket-wipe. */
const RESERVE_FILL_TTL = 55;

/**
 * Once per room per tick, not once per filler per tick.
 *
 * Every filler (and ControllerLinkFiller) called this at the top of its own
 * run(), so a 4-filler room walked and rewrote the reservation list four
 * times a tick for one answer. Re-running it inside the same tick cannot
 * change anything: Game.creeps does not gain or lose members mid-tick, and
 * entries takeReserveFill() adds later in the tick carry t == Game.time, so
 * the TTL arm keeps them either way.
 */
let _pruneTick = -1;
let _pruned: {[roomName: string]: boolean} = {};

export function pruneReserveFill(room) {
    if(_pruneTick !== Game.time) {
        _pruneTick = Game.time;
        _pruned = {};
    }
    if(_pruned[room.name]) return;
    _pruned[room.name] = true;

    let list = room.memory.reserveFill;
    if(!Array.isArray(list)) {
        room.memory.reserveFill = [];
        return;
    }
    let kept = [];
    for(let entry of list) {
        if(!entry || typeof entry !== "object" || !entry.id || !entry.creep) continue;
        if(!Game.creeps[entry.creep]) continue;
        if(Game.time - (entry.t || 0) >= RESERVE_FILL_TTL) {
            // sticky filler never re-calls findFillerTarget; refresh while
            // the owner is still walking this id so TTL cannot free it.
            let owner: any = Game.creeps[entry.creep];
            if(owner && owner.memory && owner.memory.t === entry.id) {
                entry.t = Game.time;
                kept.push(entry);
            }
            continue;
        }
        kept.push(entry);
    }
    if(kept.length !== list.length) {
        room.memory.reserveFill = kept;
    }
}

function advanceTo(creep, target, swampPrio = false) {
    if(creep.pos.isNearTo(target)) {
        delete creep.memory.stuckAt;
        delete creep.memory.stuckFor;
        delete creep.memory.tryT;
        delete creep.memory.tryFor;
        delete creep.memory.tryD;
        return;
    }

    // Failed-approach ledger. Counts ticks spent making NO PROGRESS towards
    // one target - the counter resets both when the creep arrives (above) and
    // whenever it gets closer than it has ever been to this target, so a long
    // walk across the base, a detour and an ordinary hub queue all keep it at
    // zero. Only a creep that is genuinely not converging trips it, and then
    // the target goes on the room-wide TTL blacklist so the other fillers stop
    // walking into the same wall too.
    //
    // The progress term matters: without it the first live run wrote off
    // spawn@20,40 in E11S2 and extension@45,36 in E17S4 purely because those
    // fillers were queued behind other fillers for 30 ticks.
    if(target && target.id) {
        let range = creep.pos.getRangeTo(target);
        if(creep.memory.tryT === target.id) {
            if(range < (creep.memory.tryD === undefined ? 999 : creep.memory.tryD)) {
                creep.memory.tryD = range;
                creep.memory.tryFor = 0;
            }
            else {
                creep.memory.tryFor = (creep.memory.tryFor || 0) + 1;
            }
        }
        else {
            creep.memory.tryT = target.id;
            creep.memory.tryD = range;
            creep.memory.tryFor = 0;
        }
        if(creep.memory.tryFor >= APPROACH_GIVE_UP) {
            // blacklistFillTarget() refuses the room's backbone (spawn,
            // storage, terminal), so only report what it actually took - the
            // first live run logged fillers "giving up" on their own spawn
            // while the blacklist had correctly ignored the request.
            if(blacklistFillTarget(creep.room, target.id)) {
                console.log("filler", creep.name, "gave up on", target.structureType, target.pos.x + "," + target.pos.y, "in", creep.room.name, "- blacklisted");
            }
            delete creep.memory.tryT;
            delete creep.memory.tryFor;
            delete creep.memory.tryD;
            creep.memory.t = false;
            creep.memory.path = false;
            delete creep.memory.MoveTargetId;
            return;
        }
    }

    if(creep.fatigue > 0) {
        return;
    }

    let here = creep.pos.x + "," + creep.pos.y;
    if(creep.memory.stuckAt === here) {
        creep.memory.stuckFor = (creep.memory.stuckFor || 0) + 1;
    }
    else {
        creep.memory.stuckAt = here;
        creep.memory.stuckFor = 0;
    }

    // Wedged, not merely jammed. Two loaded fillers fit in the pocket a v2 hub
    // leaves around its storage and then block each other's only exit, so BOTH
    // pathfinders answer "no path" and neither ever yields: live E14S9 had a
    // pair standing two tiles from a half-empty extension with stuckFor past
    // 400, holding 345 energy between them, until they died of old age. Shove
    // whatever is in the way and take its tile.
    if(creep.memory.stuckFor >= 8) {
        // only a wedge the shove below did NOT clear is worth a line; a hub as
        // busy as E14S9 produces a few dozen one-tick jams every 100 ticks
        if(creep.memory.stuckFor >= 50 && creep.memory.stuckFor % 50 == 8) {
            console.log("filler", creep.name, "wedged at", creep.pos.x + "," + creep.pos.y, "for", creep.memory.stuckFor, "ticks in", creep.room.name);
        }
        // Step onto a NEIGHBOURING tile by hand. Aiming straight at the target
        // is useless here - inside a hub the tile between the filler and the
        // extension it wants is usually another extension - so walk the 8
        // neighbours and drop the ones terrain or an obstacle structure rules
        // out. Live E14S9 has a filler parked on 23,25, whose only four exits
        // are diagonal road tiles (storage, spawn, tower and an extension take
        // the other four) and all four were held by other hub traffic.
        //
        // Free tiles win. If every exit is held by a creep the pick ROTATES on
        // the stuck counter: SwapPositionWithCreep only shoves a neighbour that
        // has not already moved this tick, so retrying the same neighbour every
        // tick is a guaranteed livelock while cycling through them is not.
        let terrain = creep.room.getTerrain();
        let free = [];
        let occupied = [];
        for(let dx = -1; dx <= 1; dx++) {
            for(let dy = -1; dy <= 1; dy++) {
                if(dx == 0 && dy == 0) continue;
                let x = creep.pos.x + dx;
                let y = creep.pos.y + dy;
                if(x < 1 || x > 48 || y < 1 || y > 48) continue;
                if(terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                let blocked = false;
                for(let structure of creep.room.lookForAt(LOOK_STRUCTURES, x, y)) {
                    if(OBSTACLE_OBJECT_TYPES.indexOf(structure.structureType) !== -1) {
                        blocked = true;
                        break;
                    }
                }
                if(blocked) continue;
                let step:any = {pos: new RoomPosition(x, y, creep.room.name), range: target.pos.getRangeTo(x, y)};
                if(creep.room.lookForAt(LOOK_CREEPS, x, y).length > 0) {
                    occupied.push(step);
                }
                else {
                    free.push(step);
                }
            }
        }
        free.sort((a:any, b:any) => a.range - b.range);
        occupied.sort((a:any, b:any) => a.range - b.range);

        let step:any = null;
        if(free.length > 0) {
            step = free[0];
        }
        else if(occupied.length > 0) {
            step = occupied[creep.memory.stuckFor % occupied.length];
        }
        if(step) {
            let direction = creep.pos.getDirectionTo(step.pos);
            creep.SwapPositionWithCreep(direction);
            creep.move(direction);
            creep.memory.moving = true;
        }
        return;
    }

    if(creep.memory.stuckFor >= 3) {
        creep.memory.path = false;
        delete creep.memory.MoveTargetId;
        creep.moveTo(target, {range: 1, reusePath: 3});
        creep.memory.moving = true;
        return;
    }

    if(swampPrio) {
        creep.MoveCostMatrixSwampPrio(target, 1);
    }
    else {
        creep.MoveCostMatrixRoadPrio(target, 1);
    }
}

/**
 * The hub bin, resolved once per room per tick.
 *
 * Room.findBin() (Functions/roomFunctions) walks a 24-tile lookFor ring and
 * does NOT consult room.memory.Structures.bin before doing it — so in a room
 * that has no bin yet, EVERY filler re-walked all 24 tiles EVERY tick to be
 * told "no bin" again. Nothing a creep does can build a container mid-tick,
 * so one resolution per room per tick is the identical answer, and the first
 * caller still performs findBin()'s Structures.bin write for the room.
 */
let _binTick = -1;
let _bin: {[roomName: string]: any} = {};
function hubBin(room, storage): any {
    if(_binTick !== Game.time) {
        _binTick = Game.time;
        _bin = {};
    }
    if(_bin[room.name] === undefined) {
        const S = room.memory.Structures;
        _bin[room.name] = (S && Game.getObjectById(S.bin)) || room.findBin(storage) || null;
    }
    return _bin[room.name];
}

/**
 * Is there ANY salvage on this room's floor at all? One answer per room per
 * tick, and a strict SUPERSET of what the per-creep probes in run() look for
 * (they add a range leash and an amount floor on top), so a `false` here
 * provably means all three of those probes would come back empty.
 *
 * Unfiltered room.find() results are shared for the whole tick by the engine,
 * so on a clean floor this turns three filtered range scans per filler per
 * tick into three array-length reads.
 */
let _salvageTick = -1;
let _salvage: {[roomName: string]: boolean} = {};
function roomHasSalvage(room): boolean {
    if(_salvageTick !== Game.time) {
        _salvageTick = Game.time;
        _salvage = {};
    }
    if(_salvage[room.name] === undefined) {
        _salvage[room.name] =
            room.find(FIND_DROPPED_RESOURCES).length > 0 ||
            room.find(FIND_TOMBSTONES).length > 0 ||
            room.find(FIND_RUINS).length > 0;
    }
    return _salvage[room.name];
}

/**
 * "Am I the only filler left in this room?" — one census per room per tick.
 *
 * Creeps cannot be born or die mid-tick, so the count is constant for the
 * whole tick and every filler in the room can share one answer.
 */
let _censusTick = -1;
let _census: {[roomName: string]: number} = {};
function lastFillerIn(room): boolean {
    if(_censusTick !== Game.time) {
        _censusTick = Game.time;
        _census = {};
    }
    if(_census[room.name] === undefined) {
        _census[room.name] = room.find(FIND_MY_CREEPS, {filter: (c) => c.memory.role == "filler"}).length;
    }
    return _census[room.name] == 1;
}


/**
 * HUB DUTY — the filler absorbs the EnergyManager's errand ladder.
 *
 * The planner builds the hub around ONE tile that is range 1 of storage, the
 * terminal and the hub link, and the filler stands on it for its whole life.
 * Every errand in energyManager.managerErrand() happens within a step of that
 * tile: drain the storage link, empty an overflowing bin, hold the terminal
 * energy float, push the room mineral out to the terminal. A second creep
 * whose only job is those errands is a second creep standing in the same
 * place, and Memory.CPU.roles priced it at 2.28 CPU/tick across seven of them
 * against a hard 20 CPU limit — 11% of the budget, with five of the seven not
 * moving at all across ten consecutive sampled ticks.
 *
 * THE FILL DUTY ALWAYS WINS. An errand is only ever STARTED on a tick where
 * the creep's store is empty AND the room's whole energy network is topped up
 * — spawn and extensions full, no tower under half. In that state the load
 * this creep would otherwise be holding is a load nobody wants, so the trip is
 * free. Once started an errand runs to completion, because abandoning one
 * mid-flight strands whatever is in the creep (which is often not energy).
 *
 * HUB_DUTY_MAX_TICKS is the backstop for exactly that: an errand target that
 * cannot be reached would otherwise hold the room's filler forever, so past
 * the deadline the errand is redirected to the storage, which both ends it and
 * empties the creep.
 */
const HUB_DUTY_MAX_TICKS = 30;

/**
 * Is the room's energy network completely satisfied?
 *
 * Deliberately NOT fillNeed(): that function is the room's delivery guarantee
 * and answers "where should this load go" — it never says "nowhere", so it can
 * never say "the room is fine". This is the opposite question and it has to be
 * allowed to say yes.
 *
 * The tower bar is half capacity, which is the same bar the half-tower rung of
 * fillNeed() uses, so a filler cannot go on hub duty while fillNeed() would
 * still have handed it a tower.
 */
function roomTopped(room: any): boolean {
    return cachedDerived(room, "fillerRoomTopped", () => {
        if(room.energyAvailable < room.energyCapacityAvailable) return false;
        for(const s of cachedMyStructures(room) as any[]) {
            if(s.structureType !== STRUCTURE_TOWER) continue;
            if((s.store[RESOURCE_ENERGY] || 0) < s.store.getCapacity(RESOURCE_ENERGY) / 2) return false;
        }
        return true;
    });
}

/**
 * One filler per room per tick may take the duty.
 *
 * A room with two fillers whose network is topped up would otherwise send both
 * at the same errand — same rung, same structure, two creeps walking to the
 * storage — and leave nobody holding a load for the moment the network drains.
 * Creeps run sequentially within a tick, so a module-local per-tick claim is
 * visible to every filler that runs after the one that took it.
 */
let dutyTick = -1;
let dutyRoom: { [roomName: string]: string } = {};
function claimHubDuty(creep: any): boolean {
    if(dutyTick !== Game.time) {
        dutyTick = Game.time;
        dutyRoom = {};
    }
    const held = dutyRoom[creep.room.name];
    if(held && held !== creep.name) return false;
    dutyRoom[creep.room.name] = creep.name;
    return true;
}

const run = function (creep) {
    creep.memory.moving = false;
    // Attributed reserveFill is pruned, never wiped: a %40 / spawn wipe
    // deleted other fillers' live claims and left sticky walkers unreserved.
    if(!creep.room.memory.reserveFill) {
        creep.room.memory.reserveFill = [];
    }
    else {
        pruneReserveFill(creep.room);
    }
    if(creep.evacuate()) {
		return;
	}
    // Last-filler handoff. This role never writes memory.storage (withdraw
    // uses room.storage), and ==22 is shorter than RCL7/8 hatch (27/36).
    // Fire once when TTL first covers body.length*3 plus a short queue slack.
    //
    // The census is LAST in the condition on purpose. It is a full
    // FIND_MY_CREEPS plus a memory read per creep, and the answer only ever
    // matters in the handful of ticks at the end of a filler's life — every
    // other tick it was a room-wide scan whose result was thrown away. The
    // three cheap reads in front of it are side-effect free, so short-
    // circuiting past the scan cannot change what this branch decides.
    if(!creep.memory._fillerQueued &&
       creep.ticksToLive <= creep.body.length * 3 + 3 &&
       creep.room.memory.spawn_list &&
       lastFillerIn(creep.room)) {
        creep.memory._fillerQueued = true;
        // ONE ladder, ONE name — see Rooms/spawnSafety fillerBody/fillerName.
        // This branch used to carry its own four-rung body table AND name the
        // creep `filler-` in lowercase, which is the one spelling every
        // head-of-line safety net in rooms.spawning (all `startsWith("Filler")`)
        // fails to match. The path that replaces a room's LAST filler was
        // therefore the only filler the stalled-head shredder could eat.
        const newName = fillerName(creep.room);
        creep.room.memory.spawn_list.unshift(fillerBody(creep.room), newName, {memory: {role: 'filler'}});
        console.log("added filler to spawn queue", creep.room.name, newName)
    }
	if(creep.ticksToLive <= 14 && !creep.memory.full) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}
    if(!creep.memory.MaxStorage) {
        let carryPartsAmount = 0
        for(let part of creep.body) {
            if(part.type == CARRY) {
                carryPartsAmount += 1;
            }
        }
        creep.memory.MaxStorage = carryPartsAmount * 50;
    }

    let MaxStorage = creep.memory.MaxStorage;


    if(creep.holdForFlee()) {
        return;
    }

    /*
     * Finish an errand in flight before anything else — see hub duty above.
     * `memory.target` is only ever written by managerErrand(), so its presence
     * IS the flag, and this sits above the full/empty bookkeeping so a load of
     * link energy is never mistaken for a fill load.
     *
     * The two escapes matter more than the happy path. An errand is normally
     * run to completion, because abandoning one strands whatever is in the
     * creep and that is often not energy — but if the room goes hungry while
     * this creep is holding nothing but ENERGY, the errand is over and the
     * cargo is a fill load. That is the whole reason hub duty is safe to give
     * to the room's lifeline.
     */
    if(creep.memory.target) {
        const cargo = creep.store.getUsedCapacity();
        const pureEnergy = cargo > 0 && creep.store.getUsedCapacity(RESOURCE_ENERGY) === cargo;
        if(!roomTopped(creep.room) && (cargo === 0 || pureEnergy)) {
            creep.memory.target = false;
            delete creep.memory._hubT;
            // A partial load of energy IS a fill load. Leaving `full` false
            // would send it back to the storage to top up first, which is a
            // whole round trip while the room is the one that went hungry.
            if(pureEnergy) creep.memory.full = true;
        }
        else if(Game.time - (creep.memory._hubT || Game.time) > HUB_DUTY_MAX_TICKS) {
            const bank = creep.room.storage;
            if(bank && creep.memory.target !== bank.id) {
                // Unreachable, or a rung that keeps re-deciding. Redirect to
                // the storage: it ends the errand AND empties the creep, which
                // a bare `target = false` would not — the cargo is often not
                // energy, and a filler cannot otherwise put a mineral down.
                creep.memory.target = bank.id;
                creep.memory._hubT = Game.time;
            }
            else {
                // ...and if it could not reach its own STORAGE in another
                // HUB_DUTY_MAX_TICKS, the redirect is not a rescue, it is the
                // same trap with a new deadline. Put the cargo on the floor
                // and give the room its filler back. Losing a hauler is worse
                // than losing one load, every time.
                const carried = Object.keys(creep.store)[0];
                if(carried) creep.drop(carried as ResourceConstant);
                creep.memory.target = false;
                delete creep.memory._hubT;
            }
        }
        if(creep.memory.target) {
            if(managerErrand(creep, MaxStorage)) {
                return;
            }
            creep.memory.target = false;
            delete creep.memory._hubT;
        }
    }

    if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    // store[] is start-of-tick. Judge "still have a load" from that, not
    // after a withdraw — the old check ran after collect and un-fulled us.
    const startedEnergy = creep.store[RESOURCE_ENERGY] || 0;
    if(creep.memory.full) {
        // The RCL literal must never exceed the BODY. An RCL8 ladder stopgap
        // with 150 capacity hit "full" (free==0) and "still-loaded < 200" the
        // SAME tick, un-fulled, and stood at the storage withdrawing ERR_FULL
        // forever — W1N1 spawn-dead: 282k banked, 60 extensions all empty,
        // every replacement filler born into the same livelock.
        const fillerCap = creep.store.getCapacity(RESOURCE_ENERGY) || 0;
        const rclFloor = creep.room.controller
            ? (creep.room.controller.level <= 6 ? 50 : creep.room.controller.level == 7 ? 100 : 200)
            : 50;
        if(creep.room.controller && startedEnergy < Math.min(rclFloor, Math.max(1, fillerCap))) {
            creep.memory.full = false;
            creep.memory.t = false;
        }
    }

    if(!creep.memory.full) {
        /*
         * Nothing in the store and nothing in the room wants energy: take a
         * hub errand instead of loading a standby carry nobody has asked for.
         * roomTopped() is checked BEFORE the claim so a room with fill work
         * never burns its one duty slot on a filler that is going to fill.
         */
        if(creep.store.getUsedCapacity() == 0 && roomTopped(creep.room) &&
            claimHubDuty(creep) && managerErrand(creep, MaxStorage)) {
            creep.memory.t = false;
            creep.memory._hubT = Game.time;
            return;
        }

        // native getter is authoritative — the Structures cache can go stale
        // when a storage is newly built (planV2 rooms), and a filler that
        // loses its storage falls into the cross-map scavenge path while the
        // spawn starves (E11S5: 774k banked, spawn at 92)
        let storage = creep.room.storage || (creep.room.memory.Structures && Game.getObjectById(creep.room.memory.Structures.storage)) || creep.room.findStorage();
        let bin;
        if(creep.room.memory.Structures) {
            bin = hubBin(creep.room, storage);
        }

        // Salvage free floor energy — but the hub outranks it. A range-10 leash
        // is still wide enough to reach a source pile from the hub itself
        // (E17S4: storage 41,34 -> miner drop 33,42 is range 8), and once
        // acquireEnergy...() locks that pile the filler walks the base for it
        // every trip: the room sat at RCL5 with 26k banked and 64 in the spawn.
        // While the bin/storage can supply us, the only loot worth an intent is
        // loot we are already standing next to — that costs no movement, and
        // acquireEnergy...() takes adjacent salvage before it locks anything.
        const hubSupplies =
            (bin && bin.store[RESOURCE_ENERGY] >= MaxStorage) ||
            (storage && storage.store[RESOURCE_ENERGY] > 0);
        const lootRange = hubSupplies ? HUB_LOOT_RANGE : 10;
        // Same question as before, asked in cost order. The danger gate is a
        // memory read and roomHasSalvage() is a provable superset of all three
        // probes, so on the (overwhelmingly common) clean-floor tick none of
        // the three range scans run at all; when one of them can hit, the
        // remaining two are short-circuited past on the first hit. The answer
        // is bit-for-bit the old `sum > 0 && !danger`.
        const freeLoot = !creep.room.memory.danger && roomHasSalvage(creep.room) && (
            creep.pos.findInRange(FIND_DROPPED_RESOURCES, lootRange, {
                filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= LOOT_MIN,
            }).length > 0 ||
            creep.pos.findInRange(FIND_TOMBSTONES, lootRange, {
                filter: (t) => t.store[RESOURCE_ENERGY] >= LOOT_MIN,
            }).length > 0 ||
            creep.pos.findInRange(FIND_RUINS, lootRange, {
                filter: (r) => r.store[RESOURCE_ENERGY] >= LOOT_MIN,
            }).length > 0);
        if (freeLoot) {
            creep.acquireEnergyWithContainersAndOrDroppedEnergy();
        } else if(bin && bin.store[RESOURCE_ENERGY] >= MaxStorage) {
            if(creep.pos.isNearTo(bin)) {
                let result = creep.withdraw(bin, RESOURCE_ENERGY);
                if(result == 0) {
                    creep.memory.full = true;
                }
            }
            else {
                advanceTo(creep, bin, true);
            }
        }
        else if(storage && storage.store[RESOURCE_ENERGY] > 0) {
            let result = creep.withdrawStorage(storage);
            if(result == 0) {
                creep.memory.full = true;
            }
        }
        else {
            // Storage empty: tap links. Live E37N59 sat 1.8k in three links
            // while fillers walked to the east wall because acquireEnergy
            // only knows containers/drops.
            const links: any[] = creep.room.find(FIND_MY_STRUCTURES, {
                filter: (s: any) =>
                    s.structureType === STRUCTURE_LINK &&
                    s.store[RESOURCE_ENERGY] >= 50,
            });
            let link: any = null;
            if (links.length) {
                if (storage) {
                    const hub = links.filter((l) => l.pos.getRangeTo(storage) <= 2);
                    if (hub.length) {
                        hub.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
                        link = hub[0];
                    }
                }
                if (!link) {
                    links.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
                    link = creep.pos.findClosestByRange(links) || links[0];
                }
            }
            if (link) {
                if (creep.pos.isNearTo(link)) {
                    if (creep.withdraw(link, RESOURCE_ENERGY) === 0) creep.memory.full = true;
                } else {
                    advanceTo(creep, link, true);
                }
            } else if (!creep.room.memory.danger) {
                creep.acquireEnergyWithContainersAndOrDroppedEnergy();
            }
        }
    }

    if(creep.memory.full) {
        // Resolved on demand, not up front. It is read in exactly ONE place —
        // the no-plan-sitter fallback on the last-transfer branch far below —
        // but the eager version paid Room.findStorage() on every tick of every
        // walk to an extension whenever Structures.storage was unset. That is
        // not a cheap call: even its fast path runs invalidateStaleStorageLink,
        // which sweeps a 25-tile lookForAt ring.
        const homeStorage = (): any => {
            if(!creep.room.memory.Structures) return undefined;
            return Game.getObjectById(creep.room.memory.Structures.storage) || creep.room.findStorage();
        };


        // creep.memory.t is STICKY — it is only re-asked when the object is
        // gone or full, so a target that turned out to be undeliverable would
        // otherwise be held until the creep dies of old age. Drop it here.
        let target: any = Game.getObjectById(creep.memory.t);
        if(target && isUndeliverable(creep.room, creep.memory.t)) {
            creep.memory.t = false;
            creep.memory.path = false;
            delete creep.memory.MoveTargetId;
            delete creep.memory.tryT;
            delete creep.memory.tryFor;
            delete creep.memory.tryD;
            target = null;
        }
        if(!target) {
            // Spawn/extensions first. findFillerTarget ranks output labs
            // above them once labs exist, so the only filler spends trips
            // topping a lab while spawning HOL-blocks.
            target = fillNeed(creep, undefined, true);
            if(target) {
                creep.memory.t = target.id;
            }
            else {
                target = creep.findFillerTarget();
            }
        }
        if(target && target.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
            target = creep.findFillerTarget();
        }
        // findFillerTarget() returns false as soon as everything it would pick
        // is already reserved by another filler (or by this one, a tick ago) -
        // and the old code then simply did nothing for the rest of the tick.
        // A filler holding energy is never allowed to idle while the room is
        // hungry, so fall back to the reservation-free scan.
        if(!target) {
            target = fillNeed(creep);
            if(target) {
                creep.memory.t = target.id;
            }
        }
        if(target) {
            if(creep.pos.isNearTo(target)) {
                let result = creep.transfer(target, RESOURCE_ENERGY);
                if(result == 0) {
                    let reserveFill = creep.room.memory.reserveFill;
                    if(reserveFill && reserveFill.length) {
                        let indexOfTargetId = reserveFill.findIndex(e => e && e.id === target.id);
                        if(indexOfTargetId !== -1) {
                            reserveFill.splice(indexOfTargetId, 1);
                        }
                    }
                }
                if(creep.store[RESOURCE_ENERGY] > target.store.getFreeCapacity(RESOURCE_ENERGY)) {
                    // look-ahead for the leftover in the store. Deliberately
                    // fillNeed() and not findFillerTarget(): the look-ahead used
                    // to burn a SECOND reservation every tick on top of the one
                    // above, which is what let a handful of fillers reserve the
                    // whole extension network and then starve it.
                    let newTarget = fillNeed(creep, target.id) || creep.findFillerTarget();
                    if(newTarget) {
                        creep.memory.t = newTarget.id;
                        advanceTo(creep, newTarget);
                    }
                    else if(result !== 0) {
                        // Stale FULL target and nothing else hungry: this
                        // branch used to fall out with the dead `t` kept and
                        // NO intent — a filler frozen on a hub lane tile for
                        // its whole life (E37N59: 88 ticks on 37,30 against
                        // a 1000/1000 tower, then its replacement did the
                        // same on the artery terminus).
                        creep.memory.t = false;
                        creep.idlePark();
                    }
                }
                else {
                    creep.memory.full = false;
                    creep.memory.t = false;
                    // BACK TO THE SITTER, NOT TO "SOMEWHERE BESIDE STORAGE".
                    //
                    // The planner builds the whole hub around one tile: layer 1
                    // places storage, terminal and the hub link so that a single
                    // position is range-1 of all three, and every refill number
                    // it publishes and optimises — tower[0] is the easiest tower
                    // to refill, the filler tour, the extension corridor's walk
                    // budget — is measured from exactly that tile. `range: 1` of
                    // storage is up to eight different tiles and only one of them
                    // is it, so a filler that came home to the wrong one paid an
                    // extra step on every withdraw and made the published figures
                    // unenforceable. plan.sitter is shipped now (PlanV2 `si`);
                    // range 0 because the sitter is a road and standing ON it is
                    // the entire point. Falls back to the old behaviour for a
                    // room with no adopted plan.
                    // ...but only while there is (or is about to be) work.
                    // The sitter is a ROAD tile — in E37N59 it is literally
                    // the terminus of the single-file NW haul artery — and a
                    // filler camping it while the room reads FULL plugs the
                    // lane for hundreds of ticks. One extra step when work
                    // reappears is cheaper than that.
                    const sitter = creep.room.energyAvailable < creep.room.energyCapacityAvailable
                        ? planSitter(creep.room) : null;
                    if(sitter) {
                        creep.MoveCostMatrixRoadPrio(sitter, 0);
                    }
                    else if(creep.room.energyAvailable >= creep.room.energyCapacityAvailable) {
                        creep.idlePark();
                    }
                    else {
                        const storage = homeStorage();
                        if(storage) {
                            creep.MoveCostMatrixRoadPrio(storage, 1);
                        }
                    }
                }
            }
            else {
                if(creep.room.memory.danger) {
                    creep.moveToSafePositionToRepairRampart(target, 1);
                }else {
                    advanceTo(creep, target);
                }
            }
        }
        else {
            // Full store, nothing hungry anywhere: do not stand wherever the
            // last delivery happened to end (that tile is usually a lane).
            creep.idlePark();
        }

    }
}

const roleFiller = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleFiller;
