import { funnelDonorTerminalTarget } from "Empire/funnel";

/**
 * A little description of this function
 * @param {Creep} creep
 **/

// Decrement the boost ledger only after a successful withdraw, and only as
// much as the lab can hold. Decrement-before-withdraw left amount at 0 while
// the compound bounced storage <-> creep and the lab stayed under-filled.
const REACTION_STOCK_MIN = 1000;

/*
 * HUB RESOURCE LISTS, HOISTED OUT OF THE PER-TICK PATH.
 *
 * These four lists used to be array literals declared INSIDE the hub ladder,
 * so every hub creep rebuilt all four of them on every tick it ran - one of
 * them 43 elements long - and then asked `.includes()` for every resource in
 * the store, which is a linear scan of the freshly built array.
 *
 * The hub role was measurably the most expensive creep in the empire: live
 * shard3 2026-09-11 billed it at 0.44 CPU per creep per tick against a 0.20
 * floor that is pure intent cost, while an energy miner doing real work
 * billed 0.247.
 *
 * BUILT LAZILY, NOT AT MODULE LOAD. RESOURCE_ALLOY and its siblings are
 * globals the Screeps runtime installs; they do not exist while the unit
 * suite is merely requiring this file, and evaluating them at module scope
 * takes the whole test run down with a ReferenceError. Once per global reset
 * is just as good as once per module load and costs nothing extra.
 *
 * Membership is an object lookup now. Same members, same order-independent
 * test, so every rung below behaves exactly as it did.
 */
function resourceSet(list: any[]): { [resource: string]: boolean } {
    const m: { [resource: string]: boolean } = {};
    for (let i = 0; i < list.length; i++) m[list[i]] = true;
    return m;
}

interface HubSets {
    toTerminalCommodities: { [resource: string]: boolean };
    toTerminalBoosts: { [resource: string]: boolean };
    toStorageBoosts: { [resource: string]: boolean };
    toStorageMisc: { [resource: string]: boolean };
}

let _hubSets: HubSets | null = null;

function hubSets(): HubSets {
    if (_hubSets) return _hubSets;
    _hubSets = {
        toTerminalCommodities: resourceSet([
            RESOURCE_ALLOY, RESOURCE_TUBE, RESOURCE_FIXTURES, RESOURCE_FRAME, RESOURCE_HYDRAULICS, RESOURCE_MACHINE,
            RESOURCE_CELL, RESOURCE_PHLEGM, RESOURCE_TISSUE, RESOURCE_MUSCLE, RESOURCE_ORGANOID, RESOURCE_ORGANISM,
            RESOURCE_WIRE, RESOURCE_SWITCH, RESOURCE_TRANSISTOR, RESOURCE_MICROCHIP, RESOURCE_CIRCUIT, RESOURCE_DEVICE,
            RESOURCE_CONDENSATE, RESOURCE_CONCENTRATE, RESOURCE_EXTRACT, RESOURCE_SPIRIT, RESOURCE_EMANATION, RESOURCE_ESSENCE,
            RESOURCE_GHODIUM_MELT, RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID,
            RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_ZYNTHIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_UTRIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_PURIFIER,
            RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_SILICON, RESOURCE_MIST,
            RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_KEANIUM_ACID]),
        toTerminalBoosts: resourceSet([
            RESOURCE_CATALYZED_LEMERGIUM_ACID,
            RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
            RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
            RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
            RESOURCE_CATALYZED_UTRIUM_ACID,
            RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
            RESOURCE_CATALYZED_ZYNTHIUM_ACID,
            RESOURCE_CATALYZED_KEANIUM_ACID]),
        // Same members as toTerminalBoosts, but kept as its own entry because
        // the two rungs are independent: one pushes boosts out to the terminal
        // to sell, the other pulls them back to storage. A future edit to one
        // must not silently move the other.
        toStorageBoosts: resourceSet([
            RESOURCE_CATALYZED_LEMERGIUM_ACID,
            RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
            RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
            RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
            RESOURCE_CATALYZED_UTRIUM_ACID,
            RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
            RESOURCE_CATALYZED_ZYNTHIUM_ACID,
            RESOURCE_CATALYZED_KEANIUM_ACID]),
        toStorageMisc: resourceSet([
            RESOURCE_KEANIUM_OXIDE, RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_POWER, RESOURCE_BATTERY]),
    };
    return _hubSets;
}

function storeAmt(s, res) {
    return (s && s.store && s.store[res]) || 0;
}

/** Feed an input lab from whichever store actually holds the reagent. */
function refillInputLab(creep, lab, resource, storage, terminal, MaxStorage) {
    if(!lab || !resource) return false;
    const needs = lab.mineralType == undefined ||
        (lab.mineralType == resource && lab.store[resource] < MaxStorage - 20);
    if(!needs) return false;
    const combined = storeAmt(storage, resource) + storeAmt(terminal, resource);
    // labs.ts starts the reaction at combined >= 1000. Demanding MaxStorage
    // (800 at RCL8) in ONE store leaves a 500+500 pile unfed forever.
    if(combined < REACTION_STOCK_MIN && lab.mineralType != resource) return false;
    const from = storeAmt(storage, resource) > 0 ? storage
        : (storeAmt(terminal, resource) > 0 ? terminal : null);
    if(!from) return false;
    if(creep.pos.isNearTo(from)) {
        const want = Math.min(MaxStorage, creep.store.getFreeCapacity(), storeAmt(from, resource));
        if(want > 0) {
            creep.withdraw(from, resource, want);
            creep.memory.target = lab.id;
        }
        return true;
    }
    creep.MoveCostMatrixRoadPrio(from, 1);
    return true;
}

/**
 * Fill a boost lab from whichever store actually holds the compound.
 *
 * This used to be storage-only. Market purchases land in the TERMINAL, so a
 * boost we had just bought was invisible to the hauler and the lab stayed
 * empty until some unrelated terminal->storage rung happened to move it.
 * Mirrors storeOf() in rooms.labs.ts: storage first, terminal second.
 */
function takeBoostFromStore(creep, storage, terminal, outputLab, boost, resource) {
    if(!outputLab || !boost) return false;
    let labFree = outputLab.store.getFreeCapacity(resource);
    if(!(labFree > 0)) return false;
    const from = storeAmt(storage, resource) > 0 ? storage
        : (storeAmt(terminal, resource) > 0 ? terminal : null);
    if(!from) return false;
    if(creep.pos.isNearTo(from)) {
        let want = Math.min(boost.amount, creep.store.getFreeCapacity(), labFree, storeAmt(from, resource));
        if(want > 0) {
            if(creep.withdraw(from, resource, want) == 0) {
                boost.amount -= want;
                if(boost.amount < 0) boost.amount = 0;
                creep.memory.target = outputLab.id;
            }
        }
        else if(creep.store[resource] > 0) {
            creep.memory.target = outputLab.id;
        }
        return true;
    }
    creep.MoveCostMatrixRoadPrio(from, 1);
    return true;
}


/**
 * THE HUB ERRAND LADDER, LIFTED OUT OF THE ROLE THAT OWNED IT.
 *
 * Everything below happens within one step of the hub: drain the storage link,
 * empty an overflowing bin, hold the terminal's energy float, push the room
 * mineral and the factory bars out to the terminal, feed the labs, the nuker
 * and the power spawn. The FILLER already stands on that exact tile for its
 * whole life — the planner builds the hub around a single position that is
 * range 1 of storage, terminal and the hub link — so a second creep whose only
 * job is those errands is a second creep standing in the same place.
 *
 * Measured on shard3 2026-09-10 from Memory.CPU.roles, the bot's own per-role
 * accounting, against a hard 20 CPU limit and a 2,350 bucket:
 *
 *   EnergyManager   2.28 CPU/tick over 7 creeps   (1.00 of that PathFinder)
 *   filler          3.31 CPU/tick over 7.6 creeps
 *
 * i.e. the managers cost 11% of the entire CPU limit, and sampling ten
 * consecutive ticks found five of the seven had not moved once and were
 * carrying nothing. That is the largest headcount lever left in the bot.
 *
 * RETURN CONTRACT: true = an errand was issued or continued this tick, so the
 * caller must not also move the creep. false = there is no hub work at all and
 * the caller should do whatever it does when idle.
 *
 * `acted` exists because the two blocks below are deliberately NOT exclusive:
 * a completed delivery clears `target` and the ladder picks the next errand in
 * the same tick. But a `target` that turns out to be a dead id issues nothing
 * at all, and reporting that as "handled" would freeze the caller.
 */
/**
 * How much energy the terminal is meant to be holding.
 *
 * Every market path is priced in terminal energy (transaction fees are paid
 * from it), and the old rule only filled the terminal once storage passed
 * 100k — so a 42k-storage room sat on a 200-energy terminal and no buy, sell,
 * send or gift could fire at all.
 *
 * The ladder reads the COMBINED storage+terminal energy on purpose: moving
 * energy between the two must not change the target, or the fill and drain
 * rungs chase each other.
 *
 * Extracted so hubWorkPending() below asks the identical question. Two copies
 * of a hysteresis band is two bands, and they drift.
 */
export function terminalFloat(room: any, storage: any, terminal: any): number {
    const energyBank = storeAmt(storage, RESOURCE_ENERGY) + storeAmt(terminal, RESOURCE_ENERGY);
    let target = 0;
    if(energyBank >= 200000) target = 40000;      // unchanged high-bank behaviour
    else if(energyBank >= 100000) target = 20000;
    else if(energyBank >= 20000) target = 5000;
    // A funnel donor stocks its terminal with the surplus it is about to ship
    // to the mother room (Empire/funnel). Never below the ladder.
    return Math.max(target, funnelDonorTerminalTarget(room));
}

/**
 * "Is there anything for a hub creep to do?" — WITHOUT doing it.
 *
 * managerErrand() is a do-it function, and its very first rung is "you are
 * carrying something, put it in the storage". A filler parked on a FULL
 * standby load that simply called the ladder would therefore dump its load
 * every time the room went quiet, refill it on the next tick, and dump it
 * again: two intents a tick, forever, for nothing.
 *
 * So the full-and-idle filler asks this first. It is a cheap superset of the
 * hub-only rungs — link, bin, terminal float, room mineral — and deliberately
 * NOT of the lab / factory / nuker / power-spawn corner, because a room that
 * runs any of those keeps a dedicated manager (see roomNeedsManager). A false
 * positive here costs one wasted dump; a false negative costs a hub link that
 * nobody drains, which is the one failure mode this whole handover has.
 */
export function hubWorkPending(creep: any): boolean {
    const room = creep.room;
    const storage: any = Game.getObjectById(creep.memory.storage) || creep.findStorage();
    // the same real-bank rule the ladder uses; see its comment
    if(!storage || storage.structureType !== STRUCTURE_STORAGE) return false;
    const MaxStorage = creep.memory.MaxStorage || 50;

    const link: any = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLinkToStorage();
    if(link && link.store[RESOURCE_ENERGY] > 0) return true;

    const S: any = room.memory.Structures || {};
    const bin: any = Game.getObjectById(S.bin) || room.findBin(storage);
    if(bin && bin.store.getFreeCapacity() < 2000) return true;

    const terminal: any = room.terminal;
    if(!terminal) return false;

    const target = terminalFloat(room, storage, terminal);
    const termE = storeAmt(terminal, RESOURCE_ENERGY);
    if(termE > target + 5000) return true;
    // same two arms as the drain rung, including its target term: a
    // predicate that disagrees with the ladder is a predicate that lies
    if(storeAmt(storage, RESOURCE_ENERGY) < 20000 && termE > target + MaxStorage) return true;
    if(target > 0 && termE < target &&
        storeAmt(storage, RESOURCE_ENERGY) > MaxStorage &&
        terminal.store.getFreeCapacity() > 5000) return true;

    const mineral: any = Game.getObjectById(room.memory.mineral) || room.findMineral();
    const mt = mineral && mineral.mineralType;
    if(mt && storeAmt(storage, mt) > 3000 && storeAmt(terminal, mt) < 30000 &&
        terminal.store.getFreeCapacity() > 10000) return true;

    return false;
}

/**
 * Does this room still need a creep whose ONLY job is the errand ladder below?
 *
 * Roles/filler now runs managerErrand() itself whenever its store is empty and
 * the room's energy network is topped up, which covers everything a hub-only
 * room ever asks for: the storage link, the bin, the terminal energy float and
 * the room mineral. Those are all within one step of the tile the filler
 * already stands on.
 *
 * What the filler must NOT inherit is the long-range half of the ladder. The
 * lab lines, the factory, the nuker and the power spawn are their own corner
 * of the base, an errand out there is a dozen ticks away from the hub, and the
 * filler is the room's lifeline. So a room that actually runs any of that
 * keeps a dedicated manager and a room that does not spends the 0.33 CPU/tick
 * and the body somewhere else. Live shard3 2026-09-10: one of seven rooms
 * (E37N59, three labs with inputLab1/inputLab2/outputLab1 configured) is on
 * the first side of that line and six are on the second.
 *
 * `fillers` is load-bearing: with no filler alive there is nobody to inherit
 * the duty, so the manager IS the duty and the rung must stay open.
 *
 * But "no filler alive" is normally a SPAWN GAP, not an outage. The filler
 * rung sits right below this one and unshifts ahead of it, so the tick that
 * sees zero fillers already queues the replacement; it is walking the hub
 * again inside ~60 ticks. Answering true on that tick bought E36N57 a whole
 * extra 1,500-tick manager body for a few ticks of nothing (live shard3
 * 2026-09-11: E36N57 with no labs configured and one filler was still
 * carrying a manager, and the settle watch caught the two NO FILLER ticks
 * that ordered it). So the fillerless arm is latched: the room has to have
 * been fillerless for NO_FILLER_GRACE ticks, which no spawn gap survives and
 * no real outage clears. A room in genuine collapse cannot afford the bigger
 * manager body either, so waiting costs it nothing.
 */
const NO_FILLER_GRACE = 150;

export function roomNeedsManager(room: any, fillers: number): boolean {
    if(!(fillers > 0)) {
        // fail open if the room has nowhere to keep the stamp
        if(!room.memory) return true;
        if(room.memory._noFiller === undefined) room.memory._noFiller = Game.time;
        if(Game.time - room.memory._noFiller >= NO_FILLER_GRACE) return true;
    }
    else if(room.memory && room.memory._noFiller !== undefined) {
        delete room.memory._noFiller;
    }
    if(room.controller && room.controller.level >= 8) return true;
    const M: any = room.memory || {};
    const labs: any = M.labs;
    if(labs && (labs.inputLab1 || labs.inputLab2 || labs.outputLab1)) return true;
    const S: any = M.Structures || {};
    if(S.nuker || S.powerSpawn || S.factory) return true;
    return false;
}

export function managerErrand(creep: any, MaxStorage: number): boolean {
    let acted = false;

    if(creep.store.getFreeCapacity() == MaxStorage) {
        creep.memory.target = false
    }

    if(creep.memory.target) {
        let target = Game.getObjectById(creep.memory.target);
        if(!target) {
            creep.memory.target = false;
        }
        else if(creep.pos.isNearTo(target)) {
            // One resource per tick. Clearing on any non-OK (ERR_FULL, or
            // ERR_BUSY from a second type) dropped leftover cargo into the
            // next withdraw — leftover G sat until death; leftover energy
            // walked into input labs.
            const resource = Object.keys(creep.store)[0];
            if(resource) {
                const r = creep.transfer(target, resource);
                if(r == ERR_FULL || r == ERR_INVALID_TARGET || r == ERR_NOT_OWNER || r == ERR_INVALID_ARGS) {
                    creep.memory.target = false;
                }
            }
            if(creep.store.getUsedCapacity() == 0) {
                creep.memory.target = false;
            }
            acted = true;
        }
        else {
            creep.MoveCostMatrixRoadPrio(target, 1)
            acted = true;
        }
    }
    if(!creep.memory.target) {
        let storage: any = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        /*
         * A REAL BANK, OR NOTHING.
         *
         * creepFunctions.findStorage() hands back the 2k HUB CONTAINER as a
         * stand-in whenever the room has no STRUCTURE_STORAGE — which is a
         * window of thousands of ticks at RCL4 while the storage is a site.
         * NO_CONTAINER_STANDIN excludes the EnergyManager from that answer by
         * name, and its comment says exactly why: this ladder dumps its whole
         * cargo (any resource) into whatever it is given and pins it as
         * memory.target, and every rung below is written against 20k / 100k /
         * 175k / 275k, so a 2,000-cap box reads as permanently empty AND
         * permanently un-drainable.
         *
         * The FILLER is not on that exclusion list — it wants the box, that is
         * the whole point of the stand-in — and the filler now runs this
         * ladder. So the guard has to live here, on the ladder, and not in a
         * list of role names that a new caller silently is not on. It is also
         * what the manager's own answer already effectively is: undefined.
         */
        if(!storage || storage.structureType !== STRUCTURE_STORAGE) return acted;
        let terminal = creep.room.terminal;
        let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLinkToStorage();
        let bin = Game.getObjectById(creep.room.memory.Structures.bin) || creep.room.findBin(storage);

        // Partial cargo dumps to storage before any new withdraw. Full-only
        // used to skip this and pick a lab/factory/nuker with leftover G.
        if(creep.store.getUsedCapacity() > 0) {
            if(storage) {
                creep.memory.target = storage.id;
                if(creep.pos.isNearTo(storage)) {
                    const resource = Object.keys(creep.store)[0];
                    if(resource) creep.transfer(storage, resource);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
            }
            return true;
        }



        if(creep.room.memory.labs) {
            let inputLab1; let inputLab2;
            let outputLab1; let outputLab2; let outputLab3; let outputLab4;
            let outputLab5; let outputLab6; let outputLab7; let outputLab8;

            // {n, lab} so boost.labN always fills outputLabN. A dense push
            // plus number++ poured lab2's mineral into lab3 when outputLab2
            // was missing (legacy strip deletes holes independently).
            let outputLabs = [];

            if(creep.room.memory.labs.inputLab1) {inputLab1 = Game.getObjectById(creep.room.memory.labs.inputLab1)}
            if(creep.room.memory.labs.inputLab2) {inputLab2 = Game.getObjectById(creep.room.memory.labs.inputLab2)}
            if(creep.room.memory.labs.outputLab1) {
                outputLab1 = Game.getObjectById(creep.room.memory.labs.outputLab1)
                outputLabs.push({n: 1, lab: outputLab1})
            }
            if(creep.room.memory.labs.outputLab2) {
                outputLab2 = Game.getObjectById(creep.room.memory.labs.outputLab2)
                outputLabs.push({n: 2, lab: outputLab2})
            }
            if(creep.room.memory.labs.outputLab3) {
                outputLab3 = Game.getObjectById(creep.room.memory.labs.outputLab3)
                outputLabs.push({n: 3, lab: outputLab3})
            }
            if(creep.room.memory.labs.outputLab4) {
                outputLab4 = Game.getObjectById(creep.room.memory.labs.outputLab4)
                outputLabs.push({n: 4, lab: outputLab4})
            }
            if(creep.room.memory.labs.outputLab5) {
                outputLab5 = Game.getObjectById(creep.room.memory.labs.outputLab5)
                outputLabs.push({n: 5, lab: outputLab5})
            }
            if(creep.room.memory.labs.outputLab6) {
                outputLab6 = Game.getObjectById(creep.room.memory.labs.outputLab6)
                outputLabs.push({n: 6, lab: outputLab6})
            }
            if(creep.room.memory.labs.outputLab7) {
                outputLab7 = Game.getObjectById(creep.room.memory.labs.outputLab7)
                outputLabs.push({n: 7, lab: outputLab7})
            }
            if(creep.room.memory.labs.outputLab8) {
                outputLab8 = Game.getObjectById(creep.room.memory.labs.outputLab8)
                outputLabs.push({n: 8, lab: outputLab8})
            }

            let currentOutput = creep.room.memory.labs.status.currentOutput;
            let lab1Input = creep.room.memory.labs.status.lab1Input;
            let lab2Input = creep.room.memory.labs.status.lab2Input;

            if(inputLab1 && inputLab1.mineralType != undefined && inputLab1.mineralType != lab1Input) {
                if(creep.pos.isNearTo(inputLab1)) {
                    creep.withdraw(inputLab1, inputLab1.mineralType);
                    creep.memory.target = storage.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(inputLab1, 1);
                }
                return true;
            }

            if(inputLab2 && inputLab2.mineralType != undefined && inputLab2.mineralType != lab2Input) {
                if(creep.pos.isNearTo(inputLab2)) {
                    creep.withdraw(inputLab2, inputLab2.mineralType);
                    creep.memory.target = storage.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(inputLab2, 1);
                }
                return true;
            }
            for(let entry of outputLabs) {
                let number = entry.n;
                let outputLab = entry.lab;

                if(number == 1 && creep.room.memory.labs.outputLab1 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab1 && creep.room.memory.labs.status.boost.lab1.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab1.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_LEMERGIUM_ACID)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return true;
                        }
                        // takeBoostFromStore already min(amount, carry, labFree);
                        // requiring storage >= amount skipped every partial fill.
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_LEMERGIUM_ACID) && (storeAmt(storage, RESOURCE_CATALYZED_LEMERGIUM_ACID) + storeAmt(terminal, RESOURCE_CATALYZED_LEMERGIUM_ACID)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab1, RESOURCE_CATALYZED_LEMERGIUM_ACID)) {
                                return true;
                            }
                        }

                    }
                }


                else if(number == 2 && creep.room.memory.labs.outputLab2 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab2 && creep.room.memory.labs.status.boost.lab2.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab2.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return true;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) && (storeAmt(storage, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) + storeAmt(terminal, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab2, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE)) {
                                return true;
                            }
                        }
                    }
                }

                else if(number == 3 && creep.room.memory.labs.outputLab3 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab3 && creep.room.memory.labs.status.boost.lab3.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab3.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_UTRIUM_ACID)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return true;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_UTRIUM_ACID) && (storeAmt(storage, RESOURCE_CATALYZED_UTRIUM_ACID) + storeAmt(terminal, RESOURCE_CATALYZED_UTRIUM_ACID)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab3, RESOURCE_CATALYZED_UTRIUM_ACID)) {
                                return true;
                            }
                        }
                    }
                }


                else if(number == 4 && creep.room.memory.labs.outputLab4 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab4 && creep.room.memory.labs.status.boost.lab4.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab4.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_KEANIUM_ALKALIDE)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return true;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_KEANIUM_ALKALIDE) && (storeAmt(storage, RESOURCE_CATALYZED_KEANIUM_ALKALIDE) + storeAmt(terminal, RESOURCE_CATALYZED_KEANIUM_ALKALIDE)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab4, RESOURCE_CATALYZED_KEANIUM_ALKALIDE)) {
                                return true;
                            }
                        }
                    }
                }


                else if(number == 5 && creep.room.memory.labs.outputLab5 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab5 && creep.room.memory.labs.status.boost.lab5.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab5.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return true;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) && (storeAmt(storage, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) + storeAmt(terminal, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab5, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE)) {
                                return true;
                            }
                        }
                    }
                }

                else if(number == 6 && creep.room.memory.labs.outputLab6 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab6 && creep.room.memory.labs.status.boost.lab6.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab6.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_ZYNTHIUM_ACID)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return true;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_ZYNTHIUM_ACID) && (storeAmt(storage, RESOURCE_CATALYZED_ZYNTHIUM_ACID) + storeAmt(terminal, RESOURCE_CATALYZED_ZYNTHIUM_ACID)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab6, RESOURCE_CATALYZED_ZYNTHIUM_ACID)) {
                                return true;
                            }
                        }
                    }
                }

                else if(number == 7 && creep.room.memory.labs.outputLab7 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab7 && creep.room.memory.labs.status.boost.lab7.use > 0) {
                    if(creep.room.memory.labs.status.boost.lab7.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != RESOURCE_CATALYZED_GHODIUM_ALKALIDE)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return true;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) && (storeAmt(storage, RESOURCE_CATALYZED_GHODIUM_ALKALIDE) + storeAmt(terminal, RESOURCE_CATALYZED_GHODIUM_ALKALIDE)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab7, RESOURCE_CATALYZED_GHODIUM_ALKALIDE)) {
                                return true;
                            }
                        }
                    }
                }

                else if(number == 8 && creep.room.memory.labs.outputLab8 && creep.room.memory.labs.status && creep.room.memory.labs.status.boost && creep.room.memory.labs.status.boost.lab8 && creep.room.memory.labs.status.boost.lab8.use > 0) {
                    let resource:ResourceConstant = RESOURCE_CATALYZED_KEANIUM_ACID;
                    if(creep.room.memory.labs.lab8reserved) {
                        resource = RESOURCE_UTRIUM_OXIDE;
                    }
                    if(creep.room.memory.labs.status.boost.lab8.amount == 0) {
                        // do nothing
                    }
                    else {
                        if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != resource)) {
                            if(creep.pos.isNearTo(outputLab)) {
                                creep.withdraw(outputLab, outputLab.mineralType);
                                creep.memory.target = storage.id;
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(outputLab, 1);
                            }
                            return true;
                        }
                        else if(outputLab && (outputLab.mineralType == undefined || outputLab.mineralType == resource) && (storeAmt(storage, resource) + storeAmt(terminal, resource)) > 0) {
                            if(takeBoostFromStore(creep, storage, terminal, outputLab, creep.room.memory.labs.status.boost.lab8, resource)) {
                                return true;
                            }
                        }
                    }
                }



                else if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != currentOutput || outputLab.mineralType == currentOutput && outputLab.store[outputLab.mineralType] > MaxStorage)) {
                    if(creep.pos.isNearTo(outputLab)) {
                        creep.withdraw(outputLab, outputLab.mineralType);
                        creep.memory.target = storage.id;
                    }
                    else {
                        creep.MoveCostMatrixRoadPrio(outputLab, 1);
                    }
                    return true;
                }

            }

            if(refillInputLab(creep, inputLab1, lab1Input, storage, terminal, MaxStorage)) {
                return true;
            }
            if(refillInputLab(creep, inputLab2, lab2Input, storage, terminal, MaxStorage)) {
                return true;
            }
        }
        if(closestLink && closestLink.store[RESOURCE_ENERGY] > 0 && creep.store.getFreeCapacity() == MaxStorage) {
            if(creep.pos.isNearTo(closestLink)) {
                creep.withdraw(closestLink, RESOURCE_ENERGY);
                creep.memory.target = storage.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(closestLink, 1);
            }
            return true;
        }

        if(bin && bin.store.getFreeCapacity() < 2000 && creep.store.getFreeCapacity() == MaxStorage) {
            if(creep.pos.isNearTo(bin)) {
                for(let resourceType in bin.store) {
                    creep.withdraw(bin, resourceType);
                }
                creep.memory.target = storage.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(bin, 1);
            }
            return true;
        }
		// if(!creep.memory.controllerLink && creep.room.controller && creep.room.controller.level >= 7) {
		// 	let links = creep.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK});
		// 	if(links.length > 3) {
		// 		let controllerLink = creep.room.controller.pos.findClosestByRange(links);
		// 		creep.memory.controllerLink = controllerLink.id;
		// 	}
		// }
        // if(creep.room.controller && creep.room.controller.level >= 7 && creep.memory.controllerLink) {
        //     let controllerLink:any = Game.getObjectById(creep.memory.controllerLink);
        //     if(controllerLink && controllerLink.store[RESOURCE_ENERGY] == 0) {
        //         if(creep.pos.isNearTo(storage)) {
        //             creep.withdraw(storage, RESOURCE_ENERGY);
        //             creep.memory.target = controllerLink.id;
        //         }
        //         else {
        //             creep.MoveCostMatrixRoadPrio(storage, 1);
        //         }
        //         return;
        //     }
        // }

        // Terminal energy float, scaled by the bank. Every market path is
        // priced in terminal energy (transaction fees are paid from it), and
        // the old rule only filled the terminal once storage passed 100k - so
        // a 42k-storage room sat on a 200-energy terminal and no buy, sell,
        // send or gift could fire at all.
        //
        // The ladder reads the COMBINED storage+terminal energy on purpose:
        // moving energy between the two must not change the target, or the
        // fill and drain rungs below chase each other.
        const terminalEnergyTarget = terminalFloat(creep.room, storage, terminal);

        /*
         * Drain back to storage. 5000 of hysteresis above the target keeps the
         * first arm from fighting the fill rung below.
         *
         * THE SECOND ARM USED TO FIGHT IT ANYWAY. It read
         * `storage < 20000 && terminal > MaxStorage` — a low-bank recovery that
         * says nothing about the terminal's target — and it is tested FIRST, so
         * it won every time. Take a room whose combined bank sits just over
         * 20,000, which is exactly where terminalFloat() switches the target on
         * at 5,000:
         *
         *   storage 15,000 + terminal 5,000  -> arm 2: storage < 20,000, drain
         *   storage 20,000 + terminal 0      -> fill rung: terminal < 5,000, fill
         *   storage 15,000 + terminal 5,000  -> arm 2 again, forever
         *
         * 5,000 energy shuttled back and forth across the hub for the life of
         * the room, a creep round trip at a time. Live E36N57 2026-09-10 was
         * inside that band at 19,938 + 259 and its terminal had just been
         * pulled from 2,426 to 259 by this arm while the fill rung wanted
         * 5,000 in it.
         *
         * So the recovery arm now respects the target too: it only pulls back
         * what is ABOVE the float, which leaves a starved room recovering
         * everything (its target is 0 below a 20,000 bank) and leaves a room in
         * the band alone.
         */
        if(terminal && terminal.store[RESOURCE_ENERGY] > terminalEnergyTarget + 5000 && creep.store.getFreeCapacity() == MaxStorage || storage && storage.store[RESOURCE_ENERGY] < 20000 && terminal && terminal.store[RESOURCE_ENERGY] > terminalEnergyTarget + MaxStorage) {
            if(creep.pos.isNearTo(terminal)) {
                creep.withdraw(terminal, RESOURCE_ENERGY);
                creep.memory.target = storage.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(terminal, 1);
            }
            return true;
        }



        if(terminal && terminalEnergyTarget > 0 && terminal.store[RESOURCE_ENERGY] < terminalEnergyTarget && storage && storage.store[RESOURCE_ENERGY] > MaxStorage && terminal.store.getFreeCapacity() > 5000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_ENERGY);
                creep.memory.target = terminal.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return true;
        }


        // Room mineral -> terminal. 20000 meant a room mining 70k of H still
        // had nothing in the terminal to sell with; 3000 gets the sell paths
        // stocked, and the 30k stop is the spike-sell reserve (Market/budget
        // sellCaps) - past that the mineral is better off in storage.
        let Mineral:any = Game.getObjectById(creep.room.memory.mineral) || creep.room.findMineral();
        let MineralType = Mineral.mineralType;
        if(storage && storage.store[MineralType] > 3000 && terminal && terminal.store[MineralType] < 30000 && terminal.store.getFreeCapacity() > 10000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, MineralType);
                creep.memory.target = terminal.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return true;
        }


        // REGRESSION REPAIR: the old `% 50 <= 50` was always true, so the LIVE
        // behavior was every tick - and this block is not just compound moves,
        // it also contains the factory / nuker / power-spawn / ops delivery
        // state machine further down. Throttling to 1-in-50 left the manager
        // frozen mid-errand for 49 ticks and stalled factory and power
        // processing. The gate was decorative; keep the always-run behavior.
        {


            const SETS = hubSets();
            if(storage && terminal && terminal.store.getFreeCapacity() > MaxStorage * 5) {
                for(let resource in storage.store) {
                    if(SETS.toTerminalCommodities[resource]) {
                        if(creep.pos.isNearTo(storage)) {
                            creep.withdraw(storage, resource);
                            creep.memory.target = terminal.id;
                        }
                        else {
                            creep.MoveCostMatrixRoadPrio(storage, 1);
                        }
                        return true;
                    }
                }
            }



            if(storage && terminal && terminal.store.getFreeCapacity() > MaxStorage * 5) {
                for(let resource in storage.store) {
                    if(SETS.toTerminalBoosts[resource] && storage.store[resource] > 20000 && terminal.store[resource] < 3000) {
                        if(creep.pos.isNearTo(storage)) {


                            creep.withdraw(storage, resource);
                            creep.memory.target = terminal.id;
                        }
                        else {
                            creep.MoveCostMatrixRoadPrio(storage, 1);
                        }
                        return true;
                    }
                }
            }



            if(storage && terminal && storage.store.getFreeCapacity() > MaxStorage * 5) {
                for(let resource in terminal.store) {
                    if(SETS.toStorageBoosts[resource] && (storage.store[resource] < 18000 && terminal.store[resource] > 0 || terminal.store[resource] > 4000)) {
                        if(creep.pos.isNearTo(terminal)) {
                            if(storage.store[resource] > 25000 && terminal.store[resource] > 3000) {
                                let amount = terminal.store[resource] - 3000;
                                if(amount > creep.store.getFreeCapacity()) {
                                    amount = creep.store.getFreeCapacity();
                                }
                                creep.withdraw(terminal,resource, amount);
                            }
                            else {
                                creep.withdraw(terminal, resource);
                            }
                            creep.memory.target = storage.id;
                        }
                        else {
                            creep.MoveCostMatrixRoadPrio(terminal, 1);
                        }
                        return true;
                    }
                }
            }


            if(storage && terminal && storage.store.getFreeCapacity() > MaxStorage * 5) {
                for(let resource in terminal.store) {
                    if(SETS.toStorageMisc[resource] && (storage.store.getFreeCapacity() <= 100000 && storage.store[resource] <= 15000 || storage.store.getFreeCapacity() > 175000 && storage.store[resource] <= 50000)) {
                        if(creep.pos.isNearTo(terminal)) {
                            creep.withdraw(terminal, resource);
                            creep.memory.target = storage.id;
                        }
                        else {
                            creep.MoveCostMatrixRoadPrio(terminal, 1);
                        }
                        return true;
                    }
                }
            }


            // if(creep.ticksToLive % 50 == 40 || creep.ticksToLive % 50 == 41 || creep.ticksToLive % 50 == 42 || creep.ticksToLive % 50 == 43 || creep.ticksToLive % 50 == 44 || creep.ticksToLive % 50 == 45 || creep.ticksToLive % 50 == 46 || creep.ticksToLive % 50 == 47 || creep.ticksToLive % 50 == 48 || creep.ticksToLive % 50 == 49) {
            //     let listOfResourcesToTerminalFromFactory:any = [RESOURCE_KEANIUM, RESOURCE_MIST, RESOURCE_CONDENSATE, RESOURCE_KEANIUM_BAR];
            //     if(terminal && factory && terminal.store.getUsedCapacity() < 295000) {
            //         for(let resource in factory.store) {
            //             if(listOfResourcesToTerminalFromFactory.includes(resource)) {
            //                 if(creep.pos.isNearTo(factory)) {
            //                     creep.withdraw(factory, resource);
            //                     creep.memory.target = terminal.id;
            //                 }
            //                 else {
            //                     creep.MoveCostMatrixRoadPrio(factory, 1);
            //                 }
            //                 return;
            //             }
            //         }
            //     }
            // }


        let nuker = Game.getObjectById(creep.room.memory.Structures.nuker) || creep.room.findNuker();
        if(storage && nuker) {
            if(storage.store[RESOURCE_GHODIUM] >= 3000 && nuker.store[RESOURCE_GHODIUM] < 5000) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, RESOURCE_GHODIUM);
                    creep.memory.target = nuker.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
                return true;
            }
        }


        if(storage && nuker) {
            if(storage.store[RESOURCE_ENERGY] >= 275000 && nuker.store[RESOURCE_ENERGY] < 300000) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, RESOURCE_ENERGY);
                    creep.memory.target = nuker.id;
                }
                else {
                    creep.MoveCostMatrixRoadPrio(storage, 1);
                }
                return true;
            }
        }


        let powerSpawn:any = Game.getObjectById(creep.room.memory.Structures.powerSpawn);
        if(storage && powerSpawn && storage.store[RESOURCE_POWER] >= 1 && powerSpawn.store[RESOURCE_POWER] == 0) {
            if(creep.pos.isNearTo(storage)) {
                if(storage.store[RESOURCE_POWER] >= 100) {
                    creep.withdraw(storage, RESOURCE_POWER, 100);
                }
                else {
                    creep.withdraw(storage, RESOURCE_POWER);
                }
                creep.memory.target = powerSpawn.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return true;
        }

        if(storage && terminal && storage.store[RESOURCE_OPS] > 30000 && terminal.store.getUsedCapacity() < 290000) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, RESOURCE_OPS);
                creep.memory.target = terminal.id;
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return true;
        }

        }



        // Nothing wanted moving around the hub this tick.
        return acted;
    }

    return true;
}

 const run = function (creep) {
    creep.memory.moving = false;
    if(creep.evacuate()) {
		return;
	}
    // A manager that replaces itself is a manager the spawn ladder never gets
    // to veto, so the ladder's gate has to run here too — otherwise a room that
    // no longer needs one keeps one forever. Order matters: the TTL test is
    // true on exactly one tick of a creep's life, so the two room-wide finds
    // behind it are paid once, not every tick.
    if(creep.ticksToLive == creep.body.length  * 3 &&
        creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "EnergyManager")}}).length == 1 &&
        roomNeedsManager(creep.room, creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "filler")}}).length)) {
        let newName = 'EnergyManager-'+ Math.floor(Math.random() * Game.time) + "-" + creep.room.name;
        if(creep.room.memory.danger && creep.room.memory.danger_timer > 100) {
            creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
        }
        else {
            if(creep.room.controller.level == 6) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
            else if(creep.room.controller.level == 7) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
            else if(creep.room.controller.level == 8 && !creep.room.memory.danger && Game.cpu.bucket < 9000 && creep.room.terminal && creep.room.terminal.store[RESOURCE_BATTERY] > 1000) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
            else if(creep.room.controller.level == 8 && !creep.room.memory.danger && Game.cpu.bucket >= 5000) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
            else if(creep.room.controller.level == 8 && (creep.room.memory.danger || Game.cpu.bucket < 5000)) {
                creep.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'EnergyManager'}});
            }
        }

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

	if(creep.ticksToLive <= 10 && _.keys(creep.store).length == 0) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}




    // No errand this tick. The park fallback here was commented out, so a
    // manager with no terminal/labs/factory work reached the end of run() with
    // NO intent and froze wherever it stood — 181 straight ticks on E37N59's
    // hub artery tile 35,33 (film, 2026-08-22).
    if(!managerErrand(creep, MaxStorage)) {
        creep.idlePark();
    }
}











const roleEnergyManager = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleEnergyManager;
