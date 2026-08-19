import { logAlways } from "utils/Logger";
import { consumeBoostOwner, labKeyForId } from "Rooms/rooms.labs";
import { invalidateStaleStorageLink } from "Functions/roomFunctions";
import { plannedLinkTile } from "utils/PlanV2";
import {
    cachedDerived,
    cachedDropped,
    cachedHostileCreeps,
    cachedMyCreeps,
    cachedMyStructures,
    cachedRuins,
    cachedSites,
    cachedSources,
    cachedStructures,
    cachedTombstones,
    getCachedCostMatrix,
    terrainBaseMatrix,
} from "utils/RoomCache";

// declare global required now that this file imports (module scope): a bare
// `interface Creep` stopped merging with the global type.
declare global {
interface Creep {
    Boost: () => boolean | "done";
    tryUnboostAtHome: () => boolean;
    evacuate:any;
    holdForFlee: () => boolean;
    findFillerTarget:any;
    findSource: () => object;
    findSpawn:() => object | void;
    findStorage:() => object | void;
    findClosestLink:() => object | void;
    findClosestLinkToStorage:() => object | void;
    withdrawStorage:(storage:StructureStorage | StructureContainer) => number | void;
    moveToRoom:(roomName:string, travelTarget_x?:number, travelTarget_y?:number, ignoreRoadsBool?:boolean, swampCostValue?:number, rangeValue?:number) => void;
    moveToRoomAvoidEnemyRooms:any;
    harvestEnergy:any;
    acquireEnergyWithContainersAndOrDroppedEnergy:any;
    roadCheck:() => boolean;
    fleeHomeIfInDanger: () => void | string;
    fleeFromMelee: (creep:Creep) => void;
    fleeFromRanged: (creep:Creep) => void;
    moveAwayIfNeedTo:any;
    Sweep: () => string | number | false;
    recycle: () => void;
    RangedAttackFleeFromMelee:any;
    SwapPositionWithCreep:any;
    MoveCostMatrixRoadPrio:any;
    MoveCostMatrixSwampPrio:any;
    MoveCostMatrixIgnoreRoads:any;
    roomCallbackRoadPrioUpgraderInPosition:any;
    moveToSafePositionToRepairRampart:any;
    MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch:any;
    MoveToSourceSafely:any;
    /** Unified movement — prefer this over bare moveTo */
    goTo: (target: any, opts?: GoToOpts) => ScreepsReturnCode | void;
}
}

interface GoToOpts {
    range?: number;
    /** "road" | "swamp" | "ignoreRoads" | "avoidHostiles" */
    style?: "road" | "swamp" | "ignoreRoads" | "avoidHostiles";
    ignoreRoads?: boolean;
    swampCost?: number;
    reusePath?: number;
    /** if target room differs, use multi-room travel */
    maxRooms?: number;
}

/**
 * ---------------------------------------------------------------------------
 * Fill reservations (room.memory.reserveFill)
 *
 * findFillerTarget() used to push the bare id of whatever it picked onto
 * room.memory.reserveFill, and ONLY a successful transfer ever took one off
 * again. Nothing else released: not the creep dying on the way there, not the
 * creep changing its mind, and not the callers that ask the question
 * speculatively (a loaded filler asks up to twice a tick - once for the thing
 * it is filling, once for the look-ahead). So with a handful of fillers alive
 * the list covered every extension in the room within a few ticks,
 * findFillerTarget() returned false for all of them at once, and the room sat
 * on full stores until filler.ts wiped the list on its 40-tick timer - after
 * which the whole cycle repeated.
 *
 * Reservations are now ATTRIBUTED - {id, creep, t} instead of a bare id - which
 * makes all three missing releases possible:
 *   - the owner died          -> dropped, the name is no longer in Game.creeps
 *   - the owner retargeted    -> taking a reservation drops that creep's
 *                                previous one, so a creep holds at most ONE
 *   - nobody ever delivered   -> dropped after RESERVE_FILL_TTL ticks
 * and a creep is never blocked by its OWN reservation, so re-asking for the
 * target it is already walking to gives the same answer instead of churning.
 *
 * Callers that only want to look ahead pass {reserve: false} and take nothing.
 * ---------------------------------------------------------------------------
 */
// 25 expired mid-walk (filler approach give-up is 50); a live walker
// also refreshes below so a sticky target cannot drop out from under them.
const RESERVE_FILL_TTL = 55;

/**
 * ---------------------------------------------------------------------------
 * Undeliverable targets
 *
 * Every picker below chooses with findClosestByRange, which does not know
 * whether a path exists. An extension whose eight neighbours are all other
 * extensions (the rooms are full of them: the plan moved under a built base,
 * see utils/PlanV2) can never be filled, so it is hungry forever, so it is
 * permanently the CLOSEST hungry thing to anything standing in the hub — and
 * every filler in the room locks onto it and stops delivering. Live E11S2 had
 * two fillers holding full stores pinned on extension@18,36 and E9S2 had two
 * carriers pinned on extension@20,39, all four ping-ponging between two tiles.
 *
 * utils/Reachability owns the analysis (one flood fill per room per ~50 ticks)
 * and writes room.memory.unreach; the oscillation damper in
 * Managers/RunCreepManager writes room.memory.badFill. Neither is imported
 * here — the two memory shapes are read directly, so keep this in sync with
 * utils/Reachability.isUndeliverable.
 * ---------------------------------------------------------------------------
 */
const fillTargetIsDead = (room:any, id:string):boolean => {
    if(!room || !id || !room.memory) {
        return false;
    }
    let unreach = room.memory.unreach;
    if(unreach && unreach.ids && unreach.ids.length && unreach.ids.indexOf(id) !== -1) {
        return true;
    }
    let bad = room.memory.badFill;
    if(bad) {
        let until = bad[id];
        if(until) {
            if(Game.time < until) {
                return true;
            }
            delete bad[id];
        }
    }
    return false;
}

/** prune dead/expired/legacy entries, and return the live list. */
const liveReserveFill = (room:any):any[] => {
    if(!Array.isArray(room.memory.reserveFill)) {
        room.memory.reserveFill = [];
        return room.memory.reserveFill;
    }
    /*
     * Prune once per room per tick rather than once per asking creep — a
     * Game.creeps lookup and a memory read per entry, and every filler and
     * carrier in the room asks (twice, for the look-ahead).
     *
     * Safe because every reason the prune drops an entry is a BETWEEN-tick
     * change (owner gone from Game.creeps, TTL lapsed), and the only thing that
     * grows the list mid-tick is takeReserveFill — whose entries are stamped
     * with Game.time and owned by a creep that is demonstrably alive. So a
     * second prune in the same tick can only ever hand back the same list.
     */
    cachedDerived(room, "reserveFillPruned", () => {
    let list = room.memory.reserveFill;
    let kept:any[] = [];
    for(let entry of list) {
        // bare-id entries from before this change carry neither an owner nor a
        // timestamp, so there is no way to tell a live one from a leaked one
        if(!entry || typeof entry !== "object" || !entry.id || !entry.creep) continue;
        if(!Game.creeps[entry.creep]) continue;
        if(Game.time - (entry.t || 0) >= RESERVE_FILL_TTL) {
            // sticky filler never re-calls findFillerTarget; refresh while
            // the owner is still walking this id so TTL cannot free it.
            let owner:any = Game.creeps[entry.creep];
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
        return true;
    });
    return room.memory.reserveFill;
}

/** ids reserved by SOMEONE ELSE - the ones this creep must not pick. */
const reserveFillIdsOfOthers = (creep:any):string[] => {
    let ids:string[] = [];
    for(let entry of liveReserveFill(creep.room)) {
        if(entry.creep !== creep.name) {
            ids.push(entry.id);
        }
    }
    return ids;
}

/** claim id for this creep, releasing whatever it held before. */
const takeReserveFill = (creep:any, id:string):void => {
    let list = liveReserveFill(creep.room);
    for(let i = list.length - 1; i >= 0; i--) {
        if(list[i].creep === creep.name) {
            list.splice(i, 1);
        }
    }
    list.push({id: id, creep: creep.name, t: Game.time});
}

/**
 * Re-derive room.memory.Structures.controllerLink — the controller depot: a
 * real LINK from RCL5 up, a non-source CONTAINER below RCL7, a link again
 * above it.
 *
 * Both fill branches in findFillerTarget (ControllerLinkFiller's and filler's)
 * carried a verbatim copy of this scan, and both run it on EVERY call while
 * the key is unset — which is the normal state of any room that has no depot
 * yet. That is two room.find()s plus a findInRange(sources, 1) per container,
 * per filler, per tick, for an answer that is a pure function of the room.
 *
 * Memoised per room per tick, keyed on the CURRENT value of the key so a
 * mid-tick `controllerLink = false` (the dead-object and RCL7-container arms
 * below both write one) still forces the rescan it always forced. Two runs
 * with the same inputs write the same id, so skipping the second is invisible.
 */
function _discoverControllerDepot(room:any):void {
    const key = "ctrlDepotScan:" + (room.memory.Structures.controllerLink || "0");
    cachedDerived(room, key, () => {
        // A LINK always wins from RCL5 up, whatever the level split below says.
        //
        // The `level < 7` branch searches CONTAINERS ONLY, but links unlock at
        // RCL5 — so an RCL5/6 room with a real controller link had the key
        // pinned to a container and the link was invisible to every consumer of
        // the key. Live W2N1 (RCL6): key = the EMPTY container at (10,9) while
        // the controller link at (9,9), one tile closer to the controller, held
        // a full 800 energy through 444+ ticks of zero controller progress.
        // Matches the RCL5+ rung in rooms.spawning.ts:1866-1869.
        let ctrlLink:any = null;
        const plannedCtrl = plannedLinkTile(room, 2);
        if (plannedCtrl && room.controller.level >= 5) {
            const here = room.lookForAt(LOOK_STRUCTURES, plannedCtrl.x, plannedCtrl.y);
            for (const s of here) {
                if (s.structureType === STRUCTURE_LINK && (s as StructureLink).my &&
                    s.id !== room.memory.Structures.StorageLink) {
                    ctrlLink = s;
                    break;
                }
            }
        }
        if(room.controller.level >= 5 && !ctrlLink) {
            let ctrlLinks = cachedMyStructures(room).filter((building:any) =>
                building.structureType == STRUCTURE_LINK &&
                building.id !== room.memory.Structures.StorageLink &&
                building.pos.getRangeTo(room.controller) <= 3);
            if(ctrlLinks.length > 0) {
                ctrlLink = room.controller.pos.findClosestByRange(ctrlLinks);
            }
        }
        if(ctrlLink && ctrlLink.id !== room.memory.Structures.StorageLink) {
            room.memory.Structures.controllerLink = ctrlLink.id;
        }
        else if(room.controller.level < 7) {
            /*
             * `getRangeTo(controller) == 3` — EXACTLY three — is what this used
             * to ask for, so a depot the planner put at range 1, 2 or 4 was
             * invisible and the key stayed unset forever (and the source-
             * container filter below it only ran when there were 2+ candidates,
             * so a single source container at range 3 was adopted as the depot).
             * Range 4, source containers excluded up front: the same definition
             * upgrader.ts/controllerDepot, Roles/carry.ts and the spawn gate in
             * rooms.spawning.ts use, so all four agree on which structure is the
             * depot.
             */
            let sources = cachedSources(room);
            let containers = cachedStructures(room).filter((building:any) =>
                building.structureType == STRUCTURE_CONTAINER &&
                building.id !== room.memory.Structures.bin &&
                building.id !== room.memory.Structures.storage &&
                building.pos.getRangeTo(room.controller) <= 4 &&
                building.pos.findInRange(sources, 1).length == 0);
            if(containers.length > 0) {
                room.memory.Structures.controllerLink = room.controller.pos.findClosestByRange(containers).id;
            }
        }
        else {
            let links = cachedMyStructures(room).filter((building:any) =>
                building.structureType == STRUCTURE_LINK &&
                building.id !== room.memory.Structures.StorageLink &&
                building.pos.getRangeTo(room.controller) <= 3);
            if(links.length > 0) {
                let controllerLink:any = room.controller.pos.findClosestByRange(links);
                if(controllerLink.pos.getRangeTo(room.controller) <= 4)  {
                    room.memory.Structures.controllerLink = controllerLink.id;
                }
            }
        }
        return true;
    });
}

// CREEP PROTOTYPES
Creep.prototype.findFillerTarget = function findFillerTarget(opts?:any):any {

    // speculative/look-ahead callers pass {reserve:false} and claim nothing
    let reserve = !(opts && opts.reserve === false);
    let reserveFill = reserveFillIdsOfOthers(this);


    if(this.memory.role == "ControllerLinkFiller" && (!this.room.memory.Structures.controllerLink || Game.time % 10000 == 0) && this.room.controller && this.room.controller.level >= 2) {
        _discoverControllerDepot(this.room);
    }

    if(this.memory.role == "ControllerLinkFiller" && this.room.controller && this.room.memory.Structures.controllerLink) {
        let controllerLink:any = Game.getObjectById(this.room.memory.Structures.controllerLink);
        if(controllerLink) {
            // same deadness + reservation as every other fill pick: skipping
            // them here blacklisted a live depot and then re-picked it forever
            if(!fillTargetIsDead(this.room, controllerLink.id) && !reserveFill.includes(controllerLink.id)) {
                if(controllerLink.structureType == STRUCTURE_CONTAINER && controllerLink.store.getFreeCapacity() >= 200) {
                    if(this.room.controller.level >= 7) {
                        this.room.memory.Structures.controllerLink = false;
                    }
                    else {
                        if(reserve) {
                            takeReserveFill(this, controllerLink.id);
                        }
                        this.memory.t = controllerLink.id;
                        return controllerLink;
                    }
                }
                else if(controllerLink.structureType == STRUCTURE_LINK && controllerLink.store[RESOURCE_ENERGY] <= 600) {
                    if(reserve) {
                        takeReserveFill(this, controllerLink.id);
                    }
                    this.memory.t = controllerLink.id;
                    return controllerLink;
                }
            }
        }
        else {
            this.room.memory.Structures.controllerLink = false;
        }
    }
    // spawn-first: labs used to outrank hungry spawn/extensions the moment
    // 4 lab keys existed, so the room sat on a full bank while energyAvailable
    // starved the producer.
    if(this.room.energyAvailable < this.room.energyCapacityAvailable) {

        /*
         * Split into a room/tick half and a per-creep half.
         *
         * "which spawns and extensions are hungry" cannot change during a tick
         * — transfer() is an intent and stores only settle between ticks, which
         * is the whole reason the reservation ledger below exists — so the raw
         * hungry set is derived once per room per tick and every filler in the
         * room shares it. Only the two per-creep questions (does someone else
         * hold a reservation on it, is it blacklisted) still run per creep, in
         * the same order and with the same short-circuit as before.
         */
        const hungryFill:any[] = cachedDerived(this.room, "fillSpawnExt", () =>
            cachedMyStructures(this.room).filter((building:any) =>
                (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION) &&
                building.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
        let spawnAndExtensions = hungryFill.filter((building:any) =>
            !reserveFill.includes(building.id) && !fillTargetIsDead(this.room, building.id));
        if(spawnAndExtensions.length > 0) {
            let t = this.pos.findClosestByRange(spawnAndExtensions);
            if(reserve) {
                takeReserveFill(this, t.id);
            }
            this.memory.t = t.id;
            return t;
        }

    }
    if(this.room.memory.labs && Object.keys(this.room.memory.labs).length >= 4) {
        let outputLab1;
        let outputLab2;
        let outputLab3;
        let outputLab4;
        let outputLab5;
        let outputLab6;
        let outputLab7;
        let outputLab8;

        let Labs = [];

        if(this.room.memory.labs.outputLab1) {
            outputLab1 = Game.getObjectById(this.room.memory.labs.outputLab1)
            Labs.push(outputLab1)
        }
        if(this.room.memory.labs.outputLab2) {
            outputLab2 = Game.getObjectById(this.room.memory.labs.outputLab2)
            Labs.push(outputLab2)
        }
        if(this.room.memory.labs.outputLab3) {
            outputLab3 = Game.getObjectById(this.room.memory.labs.outputLab3)
            Labs.push(outputLab3)
        }
        if(this.room.memory.labs.outputLab4) {
            outputLab4 = Game.getObjectById(this.room.memory.labs.outputLab4)
            Labs.push(outputLab4)
        }
        if(this.room.memory.labs.outputLab5) {
            outputLab5 = Game.getObjectById(this.room.memory.labs.outputLab5)
            Labs.push(outputLab5)
        }
        if(this.room.memory.labs.outputLab6) {
            outputLab6 = Game.getObjectById(this.room.memory.labs.outputLab6)
            Labs.push(outputLab6)
        }
        if(this.room.memory.labs.outputLab7) {
            outputLab7 = Game.getObjectById(this.room.memory.labs.outputLab7)
            Labs.push(outputLab7)
        }
        if(this.room.memory.labs.outputLab8) {
            outputLab8 = Game.getObjectById(this.room.memory.labs.outputLab8)
            Labs.push(outputLab8)
        }

        for(let lab of Labs) {
            if(lab && (lab.store[RESOURCE_ENERGY] <= 2000 - this.memory.MaxStorage*2 || lab.store[RESOURCE_ENERGY] < 1200) && !reserveFill.includes(lab.id) && !fillTargetIsDead(this.room, lab.id)) {
                if(reserve) {
                    takeReserveFill(this, lab.id);
                }
                this.memory.t = lab.id;
                return lab;
            }
        }
    }


    // Unconditional: every findFillerTarget call that got past the rung above
    // used to run a whole FIND_MY_STRUCTURES filter for this, even in a room
    // with no towers at all. Room/tick half memoised, per-creep half kept.
    const hungryTowers:any[] = cachedDerived(this.room, "fillTowers", () =>
        cachedMyStructures(this.room).filter((building:any) =>
            building.structureType == STRUCTURE_TOWER && building.store.getFreeCapacity(RESOURCE_ENERGY) >= 100));
    let towers2 = hungryTowers.filter((building:any) =>
        !reserveFill.includes(building.id) && !fillTargetIsDead(this.room, building.id));
    if(towers2.length > 0) {
        let t = this.pos.findClosestByRange(towers2);
        if(reserve) {
            takeReserveFill(this, t.id);
        }
        this.memory.t = t.id;
        return t;
    }

    let storage = Game.getObjectById(this.memory.storage) || this.findStorage() || this.room.storage;
    if(this.room.memory.Structures.extraLinks) {
        for(let linkID of this.room.memory.Structures.extraLinks) {
            let extraLink:any = Game.getObjectById(linkID);
            if(extraLink && extraLink.store[RESOURCE_ENERGY] < 800 && storage && storage.store[RESOURCE_ENERGY] > 100000 && !reserveFill.includes(extraLink.id)) {
                if(reserve) {
                    takeReserveFill(this, extraLink.id);
                }
                this.memory.t = extraLink.id;
                return extraLink;
            }
        }
    }


    if(this.room.memory.Structures.powerSpawn) {
        let powerSpawn:any = Game.getObjectById(this.room.memory.Structures.powerSpawn);
        if(powerSpawn && powerSpawn.store[RESOURCE_ENERGY] < 2500 && storage && storage.store[RESOURCE_ENERGY] > 280000 && !reserveFill.includes(powerSpawn.id)) {
            if(reserve) {
                takeReserveFill(this, powerSpawn.id);
            }
            this.memory.t = powerSpawn.id;
            return powerSpawn;
        }
    }




    if(this.memory.role == "filler" && (!this.room.memory.Structures.controllerLink || Game.time % 10000 == 0) && this.room.controller.level >= 2) {
        // Same scan as the ControllerLinkFiller branch above — it used to be a
        // verbatim second copy, which meant a room with no depot paid for it
        // once per filler as well as once per ControllerLinkFiller.
        _discoverControllerDepot(this.room);
    }

    if(this.memory.role == "filler" && this.room.energyAvailable == this.room.energyCapacityAvailable && this.room.controller && this.room.memory.Structures.controllerLink) {
        let controllerLink:any = Game.getObjectById(this.room.memory.Structures.controllerLink);
        if(controllerLink) {
            if(!fillTargetIsDead(this.room, controllerLink.id) && !reserveFill.includes(controllerLink.id)) {
                if(controllerLink.structureType == STRUCTURE_CONTAINER && controllerLink.store.getFreeCapacity() > 1800) {
                    if(this.room.controller.level >= 7) {
                        this.room.memory.Structures.controllerLink = false;
                    }
                    else {
                        if(reserve) {
                            takeReserveFill(this, controllerLink.id);
                        }
                        this.memory.t = controllerLink.id;
                        return controllerLink;
                    }
                }
                // ...but only if the room will ever take it back out again. This
                // rung is opportunistic — a filler with nothing better to do tops
                // the controller link up out of the bank — and with no upgrader and
                // no ControllerLinkFiller alive it is a pure loss: the energy goes
                // storage -> filler -> controller link and stays there. Worse,
                // since forwardToControllerLink now hands an unconsumed controller
                // link back to the hub, the two would trade the same energy back
                // and forth at a 3% link tax per hop. Same test both sides.
                // ...and only while the room can afford the generosity. This rung
                // spends the BANK on the controller link, so below the reserve it
                // is undoing the miner-side routing change one carry at a time.
                else if(controllerLink.structureType == STRUCTURE_LINK && controllerLink.store[RESOURCE_ENERGY] <= 400 && _roomFeedsController(this.room) && !_bankBelowReserve(this.room)) {
                    if(reserve) {
                        takeReserveFill(this, controllerLink.id);
                    }
                    this.memory.t = controllerLink.id;
                    return controllerLink;
                }
            }
        }
        else {
            this.room.memory.Structures.controllerLink = false;
        }
    }
    return false;
}

Creep.prototype.evacuate = function evacuate():any {
    if(this.room.memory.defence && this.room.memory.defence.nuke && this.room.memory.defence.evacuate || this.memory.nukeHaven) {
        if(!this.memory.nukeTimer) {
            let nukes = this.room.find(FIND_NUKES).filter(function(nuke) {return nuke.timeToLand < 300;});;
            if(nukes.length > 0) {
                nukes.sort((a,b) => a.timeToLand - b.timeToLand);
                this.memory.nukeTimer = nukes[0].timeToLand + 1;
            }
        }
        if(!this.memory.homeRoom) {
            this.memory.homeRoom = this.room.name;
        }
        if(this.memory.nukeTimer && this.memory.nukeTimer > 0) {
            this.memory.nukeTimer --;
        }

        // nukeHaven is otherwise never cleared, so remotes that passed
        // through home during evac get yanked back every tick for life.
        // Haven is done when the timer has lapsed or home has no nukes.
        const homeObj = this.memory.homeRoom && Game.rooms[this.memory.homeRoom];
        const noHomeNukes = homeObj && homeObj.find(FIND_NUKES).length === 0;

        if(this.memory.nukeTimer > 0 && !noHomeNukes) {

            if(!this.memory.nukeHaven) {
                let possibleRooms = Object.values(Game.map.describeExits(this.room.name)).filter(roomname => Game.map.getRoomStatus(roomname).status === Game.map.getRoomStatus(this.room.name).status);
                let index = Math.floor(Math.random() * possibleRooms.length);
                this.memory.nukeHaven = possibleRooms[index];
            }
            if(this.memory.nukeHaven) {
                this.moveToRoom(this.memory.nukeHaven)
            }

        }
        else {
            if(this.room.name == this.memory.homeRoom) {
                delete this.memory.nukeHaven;
                delete this.memory.nukeTimer;
                return false;
            }
            else {
                this.moveToRoom(this.memory.homeRoom);
                return true;
            }
        }

        return true;
    }
    return false;
}

// Honour defence's same-tick flee step. Last intent wins, so a later
// role move() walks back into the pack. True => caller must return.
// Check melee<=6 AND ranged<=8 independently: ranged-else-melee skipped
// the melee standing next to a mixed invader pack.
Creep.prototype.holdForFlee = function(): boolean {
    if(!this.memory.fleeing) return false;
    // one hostile scan per room per tick, shared with the flee/avoid matrices
    const hostiles = cachedHostileCreeps(this.room);
    for(const h of hostiles) {
        const range = this.pos.getRangeTo(h);
        if(h.getActiveBodyparts(RANGED_ATTACK) > 0 && range <= 8) return true;
        if(h.getActiveBodyparts(ATTACK) > 0 && range <= 6) return true;
    }
    return false;
}

Creep.prototype.Boost = function Boost():any {

    // Empty list means we are done — callers treat a falsy return as "keep
    // waiting", so a bare `return` here parked the creep for its whole life.
    if(!this.memory.boostlabs || this.memory.boostlabs.length == 0) {
        return true;
    }

    let labs = [];
    let stale = [];
    for(let labID of this.memory.boostlabs) {
        let lab:any = Game.getObjectById(labID);
        if(lab) labs.push(lab);
        else stale.push(labID);
    }
    if(stale.length) {
        for(const id of stale) {
            const key = labKeyForId(this.room, id);
            if(key) consumeBoostOwner(this.room, key, this.name);
        }
        this.memory.boostlabs = this.memory.boostlabs.filter(id => stale.indexOf(id) === -1);
    }
    if(labs.length == 0) {
        return true;
    }

    let closestLab:any = this.pos.findClosestByRange(labs);
    if(!closestLab) {
        return true;
    }

    // Timestamp, not a counter. RD/RRD must not increment this.
    if(!this.memory.boostWait) this.memory.boostWait = Game.time;

    const dropThisLab = () => {
        const key = labKeyForId(this.room, closestLab.id);
        if(key) consumeBoostOwner(this.room, key, this.name);
        this.memory.boostlabs = this.memory.boostlabs.filter(labid => labid !== closestLab.id);
        delete this.memory.boostWait;
    };

    // Mineral in the lab cannot boost any unboosted part we still have
    // (wrong compound, or those parts already boosted). ERR_NOT_FOUND
    // used to just console.log and sit here until TTL.
    const mineral = closestLab.mineralType;
    const canUse = !mineral || this.body.some((p:any) =>
        !p.boost && BOOSTS[p.type] && BOOSTS[p.type][mineral]);

    const waitedOut = Game.time - this.memory.boostWait > 80;
    const ttlGiveUp = this.ticksToLive < 1100 && this.getActiveBodyparts(CLAIM) === 0;

    if(closestLab.mineralAmount < 30 || !canUse) {
        if(!canUse || ttlGiveUp || waitedOut) {
            dropThisLab();
            return this.memory.boostlabs.length == 0 ? true : false;
        }
        this.MoveCostMatrixRoadPrio(closestLab, 3);
        return false;
    }

    if(this.pos.isNearTo(closestLab)) {
        let result = closestLab.boostCreep(this);
        if(result == 0) {
            dropThisLab();
            return true;
        }
        // ERR_NOT_FOUND / INVALID_TARGET: this compound will never apply.
        if(result == ERR_NOT_FOUND || result == ERR_INVALID_TARGET || waitedOut) {
            dropThisLab();
            return this.memory.boostlabs.length == 0 ? true : false;
        }
        console.log(result);
        return false;
    }

    this.MoveCostMatrixRoadPrio(closestLab, 1);
    return false;
}

/**
 * Give the X-tier boosts back before dying. recycle() is the only other place
 * that unboosts, and Solomon / Squad / FreedomFighter / Dismantler / healer /
 * Guard never call it, so their boosts are burned every rotation.
 *
 * Roles opt in from their at-home / idle branch, once per tick, e.g.
 *     if(creep.tryUnboostAtHome()) return;
 * It no-ops unless the creep carries an X boost, is in its home room, and is
 * retiring (memory.retire, or ticksToLive < 200). Returns true while it is
 * walking to / working the lab, false once there is nothing left to do.
 */
Creep.prototype.tryUnboostAtHome = function tryUnboostAtHome(): boolean {
    if(!this.memory.retire && !(this.ticksToLive < 200)) return false;
    if(this.memory.homeRoom && this.memory.homeRoom !== this.room.name) return false;
    if(!this.room.memory.labs) return false;
    // unboostCreep hands back HALF the mineral, so only the X tier pays for the
    // walk and the lab pause.
    if(!this.body.some((p:any) => p.boost && String(p.boost).charAt(0) === "X")) return false;

    let ids = [];
    for(let i = 1; i <= 8; i++) {
        if(this.room.memory.labs["outputLab" + i]) ids.push(this.room.memory.labs["outputLab" + i]);
    }
    if(this.room.memory.labs.inputLab1) ids.push(this.room.memory.labs.inputLab1);
    if(this.room.memory.labs.inputLab2) ids.push(this.room.memory.labs.inputLab2);
    // ERR_TIRED otherwise — a cooling lab cannot unboost.
    let labs = ids.map((id:any) => Game.getObjectById(id)).filter((l:any) => l && l.cooldown === 0);
    if(!labs.length) return false;
    let lab:any = this.pos.findClosestByRange(labs);
    if(!lab) return false;

    // Same bookkeeping as recycle(): an unpaused lab runs its reaction and eats
    // the returned minerals.
    if(!this.room.memory.labs.paused) this.room.memory.labs.paused = [];
    let entry = this.room.memory.labs.paused.filter((p:any) => p.id === lab.id)[0];
    if(entry) entry.timer = Math.max(entry.timer, 21);
    else this.room.memory.labs.paused.push({timer: 21, id: lab.id});

    if(!this.pos.isNearTo(lab)) {
        this.MoveCostMatrixRoadPrio(lab, 1);
        return true;
    }
    let result = lab.unboostCreep(this);
    if(result === OK) {
        let done = this.room.memory.labs.paused.filter((p:any) => p.id === lab.id)[0];
        if(done) done.timer = 1;
        return false;
    }
    // ERR_NOT_FOUND: nothing on this body is boosted after all.
    return result !== ERR_NOT_FOUND;
}



Creep.prototype.findSource = function() {
    let source;

    if(this.memory.sourceId) {
        source = Game.getObjectById(this.memory.sourceId);
    }
    if(!source) {
        let sources = this.room.find(FIND_SOURCES, {filter: s => s.energy > 0});
        if(sources.length) {
            sources = sources.filter(function(thisSource) {return thisSource.pos.getOpenPositions().length > 0;});
            source = this.pos.findClosestByRange(sources);
            // source = _.find(sources, function(s) {
            // let open = s.pos.getOpenPositions();
            // return open.length > 0;});
        }
    }

    if(source) {
        this.memory.source = source.id;
        return source;
    }
}

Creep.prototype.findSpawn = function() {
    // room/tick constant — spawns do not appear or move mid-tick
    const spawns:any[] = cachedDerived(this.room, "mySpawns", () =>
        cachedMyStructures(this.room).filter((structure:any) => structure.structureType == STRUCTURE_SPAWN));
    if(spawns.length) {
        this.memory.spawn = spawns[0].id;
        return spawns[0]
    }
}


/*
 * Roles that must NOT be handed the hub container as a stand-in storage at
 * RCL4+, because they treat whatever findStorage() returns as the room's
 * terminal-scale bank and dump non-energy into it with no free-capacity check:
 *
 *   EnergyManager  dumps its whole cargo (any resource) and pins it as
 *                  memory.target; every one of its bank rungs is written
 *                  against 20k/100k/175k/275k, so a 2k box reads as
 *                  permanently empty AND permanently un-drainable — its
 *                  mineral evacuation only fires above 3000, which a 2000-cap
 *                  container can never reach.
 *   MineralMiner   `store[mineralType] < 19500` is unconditionally true for a
 *                  container, so it never falls through to the terminal and
 *                  cements minerals into the energy hub.
 *   billtong       transfers every resourceType with no free-capacity test.
 *   goblin         same, with looted minerals, and no terminal fallback.
 *
 * All four only exist in rooms that are long past RCL4, so keeping their old
 * `undefined` answer costs nothing and keeps the hub an ENERGY hub. Everyone
 * else — carriers, fillers, builders, repairers, upgraders, sweepers — wants
 * the box and either goes through withdrawStorage()'s container arm or checks
 * free capacity itself.
 */
const NO_CONTAINER_STANDIN: {[role: string]: boolean} = {
    EnergyManager: true,
    MineralMiner: true,
    billtong: true,
    goblin: true,
};

Creep.prototype.findStorage = function() {
    if(this.memory.storage) {
        const pinned: any = Game.getObjectById(this.memory.storage);
        if(!pinned || !pinned.pos || pinned.pos.roomName !== this.room.name) {
            delete this.memory.storage;
        }
        // A hub container pinned before the storage existed is a 2k box the
        // creep would keep using next to a 1M bank. Repoint on sight.
        else if(pinned.structureType === STRUCTURE_CONTAINER && this.room.storage && this.room.storage.my) {
            delete this.memory.storage;
        }
    }
    if(!this.room.controller || this.room.controller.level === 0) return;
    // See the comment at the bottom of this function: at RCL4+ the answer is
    // deliberately NON-STICKY, so every caller re-derives it every tick. Both
    // halves of the derivation are room/tick constants, so they are memoised
    // per room per tick instead of per creep per tick.
    const storage:any[] = cachedDerived(this.room, "myStorage", () =>
        cachedMyStructures(this.room).filter((structure:any) => structure.structureType == STRUCTURE_STORAGE));
    if(storage.length) {
        this.memory.storage = storage[0].id;
        return storage[0];
    }
    /*
     * No STRUCTURE_STORAGE resolves in this room — and that is NOT an
     * RCL1-3-only state. At RCL4 the storage spends thousands of ticks as a
     * construction SITE, and at any RCL it can be destroyed; for that whole
     * window the old `level >= 4` branch returned undefined and the room had
     * no bulk energy sink at all.
     *
     * Live E36N57, storage site 21,28 at 13k/30k: source container 9,6 pinned
     * 2000/2000 (the miner burning ~5 e/t into the ground), six carriers
     * driving around full at 400/400 with nowhere to put it, carry.ts falling
     * through to "drop it next to the spawn" with 100-700 energy rotting on
     * the floor, and the builders with no hub to drink from so the storage
     * site crawled at ~2.5 e/t. Every one of those is the same missing sink.
     *
     * The hub container IS the sink/source for exactly that window, so hand it
     * back at any level where the real storage does not exist.
     * `Room.prototype.findStorage` already behaves this way (it has no RCL
     * gate at all — no storage means findStorageContainer()); this just stops
     * the creep-side finder from disagreeing with the room-side one.
     *
     * The one thing the container answer must NOT do at RCL4+ is stick. Every
     * caller is `Game.getObjectById(memory.storage) || creep.findStorage()`,
     * so a written pin is never re-resolved while the object is alive — and
     * the hub container OUTLIVES the storage build. Pinning it here would
     * leave a creep born during the site window delivering into a 2k box for
     * the rest of its life with a real storage standing next to it (the same
     * staleness Room.findStorage repoints around). Below RCL4 the pin stays
     * exactly as it was; at RCL4+ we re-derive, which costs one cached
     * room.find per calling creep for the few thousand ticks the site exists.
     */
    const sticky = this.room.controller.level < 4;
    if(!sticky && NO_CONTAINER_STANDIN[this.memory.role]) return;
    let spawn:any = Game.getObjectById(this.memory.spawn) || this.findSpawn();
    if(spawn && spawn.pos.y >= 2) {
        // Keyed on the spawn id, not just the room: memory.spawn is per creep,
        // so in a multi-spawn room two creeps can be asking about two tiles.
        const box:any = cachedDerived(this.room, "hubBoxAt:" + spawn.id, () => {
            const storagePosition = new RoomPosition(spawn.pos.x, spawn.pos.y - 2, this.room.name);
            for(const building of storagePosition.lookFor(LOOK_STRUCTURES)) {
                if(building.structureType == STRUCTURE_CONTAINER) {
                    return building;
                }
            }
            return null;
        });
        if(box) {
            if(sticky) this.memory.storage = box.id;
            return box;
        }
    }
    // spawn.y-2 is only the FIRST hub offset the construction code uses. The
    // room finder knows the rest of them (and the newer plans do not all put
    // the hub there), so widen to it rather than giving up.
    //
    // It walks eight offsets with a lookFor each and pins Structures.storage on
    // the way; both the answer and the pin are room/tick constants, so the
    // first creep to ask pays for it and the rest of the room reuses it.
    const hubBox:any = cachedDerived(this.room, "hubBox", () => this.room.findStorageContainer());
    if(hubBox) {
        if(sticky) this.memory.storage = hubBox.id;
        return hubBox;
    }
}

Creep.prototype.findClosestLink = function() {
    // object-form filters go through lodash's matcher, which is the slow way to
    // ask this; the list itself is a room/tick constant, only the pick is not
    const links:any[] = cachedDerived(this.room, "myLinks", () =>
        cachedMyStructures(this.room).filter((s:any) => s.structureType == STRUCTURE_LINK));
    if(links.length) {
        let closestLink = this.pos.findClosestByRange(links);
        this.memory.closestLink = closestLink.id;
        return closestLink;
    }
}

Creep.prototype.findClosestLinkToStorage = function():any {
    // Same stale-pin drop as findStorageLink: a live RCL5 source-ring
    // id never rescans on its own. Then reuse the room finder so EM
    // and the room pin agree on the hub.
    invalidateStaleStorageLink(this.room);
    const hub: any = this.room.findStorageLink();
    if(hub) {
        this.memory.closestLink = hub.id;
        return hub;
    }
}




/**
 * ---------------------------------------------------------------------------
 * Storage withdrawal floors
 *
 * The reserve in `withdrawStorage` exists for ONE consumer: the fillers. They
 * are what turn a bank into spawnable energy, so they draw with no floor at
 * all and everyone else leaves them a cushion.
 *
 * The old rule was a single hard 2000 for every non-filler role, and that is
 * what starved W2N1 during its recovery: with the storage sitting anywhere
 * under 2000 the builder was locked out entirely, fell through to
 * `acquireEnergyWithContainersAndOrDroppedEnergy()` — containers 0, drops 0,
 * every source container empty — and did nothing for hours while the energy it
 * needed to finish the room's own extensions/containers sat eight tiles away.
 * A room in that state cannot climb out: the very structures that would give
 * it throughput are the ones the builder is forbidden to pay for.
 *
 * So the floor becomes a priority ladder rather than a wall:
 *
 *     filler                     0     absolute priority, unchanged
 *     builder / buildcontainer   300   only while the room HAS sites + income
 *     upgrader / CtrlLinkFiller  1000  only while the room has income
 *     everything else            2000  unchanged
 *
 * Both lowered rungs are gated on the room still having an energy income (a
 * live miner, or a remote hauler feeding it). With no income the room is not
 * recovering, it is dying, and the right answer there is the old behaviour:
 * hand everything to the fillers so a miner gets spawned first.
 * ---------------------------------------------------------------------------
 */
const STORAGE_FLOOR_DEFAULT = 2000;
const STORAGE_FLOOR_BUILD = 300;
const STORAGE_FLOOR_UPGRADE = 1000;
/** Smallest slice above a lowered floor that is worth walking to the bank for. */
const STORAGE_MIN_DRAW = 50;

/** Roles allowed to draw the storage down to STORAGE_FLOOR_BUILD. */
const STORAGE_BUILD_ROLES: { [role: string]: boolean } = {
    builder: true,
    buildcontainer: true,
};

/** Roles allowed to draw the storage down to STORAGE_FLOOR_UPGRADE. */
const STORAGE_UPGRADE_ROLES: { [role: string]: boolean } = {
    upgrader: true,
    ControllerLinkFiller: true,
};

/**
 * Does the room still earn energy? Cached on the Room object, which the engine
 * rebuilds every tick, so this costs one `find` per room per tick at most.
 */
function _roomHasEnergyIncome(room: any): boolean {
    if (room._pacIncome !== undefined) return room._pacIncome;
    let income = false;
    const creeps: any[] = room.find(FIND_MY_CREEPS);
    for (let i = 0; i < creeps.length; i++) {
        const role = creeps[i].memory && creeps[i].memory.role;
        // A miner is local income; a hauler is remote income arriving.
        if (role === "EnergyMiner" || role === "energyMiner" || role === "carry") {
            income = true;
            break;
        }
    }
    room._pacIncome = income;
    return income;
}

/**
 * Is this room running its controller depot — i.e. will anything ever take
 * energy back out of the controller link? See Roles/energyMiner's
 * `roomFeedsController`, which this shares the `room._pacFeedsCtrl` cache slot
 * with on purpose: the two answers must agree, and a shared slot makes that
 * true by construction rather than by discipline.
 */
function _roomFeedsController(room: any): boolean {
    if (room._pacFeedsCtrl !== undefined) return room._pacFeedsCtrl;
    const has = room.find(FIND_MY_CREEPS, {
        filter: (c: any) => c.memory && (c.memory.role === "upgrader" || c.memory.role === "ControllerLinkFiller"),
    }).length > 0;
    room._pacFeedsCtrl = has;
    return has;
}

/**
 * Is the room's bank under the reserve it must hold before it may spend on the
 * controller? Mirror of `Roles/energyMiner`'s `bankBelowReserve` — duplicated
 * for the same reason `_roomFeedsController` is (importing a role from here
 * would be circular), and sharing its `room._pacBankLow` cache slot so the two
 * answers cannot drift apart.
 *
 * The rung this guards moves energy OUT OF STORAGE into the controller link,
 * so leaving it ungated would drain the very reserve the miner-side change
 * exists to build.
 */
const _CONTROLLER_FEED_RESERVE = 2000;
const _DOWNGRADE_URGENT = 15000;

function _bankBelowReserve(room: any): boolean {
    if (room._pacBankLow !== undefined) return room._pacBankLow;
    const store = room.storage && room.storage.my ? room.storage : null;
    let low: boolean;
    if (!store) {
        low = false;
    } else {
        const ctrl = room.controller;
        if (ctrl && ctrl.my && (ctrl.ticksToDowngrade || Infinity) < _DOWNGRADE_URGENT) {
            low = false;
        } else {
            const bank = (store.store[RESOURCE_ENERGY] || 0)
                + (room.terminal && room.terminal.my ? (room.terminal.store[RESOURCE_ENERGY] || 0) : 0);
            low = bank < _CONTROLLER_FEED_RESERVE;
        }
    }
    room._pacBankLow = low;
    return low;
}

/** Does the room have anything to build? Cached on the Room object. */
function _roomHasSites(room: any): boolean {
    if (room._pacSites !== undefined) return room._pacSites;
    const has = room.find(FIND_MY_CONSTRUCTION_SITES).length > 0;
    room._pacSites = has;
    return has;
}

/** All live sites are road/rampart — naked-shell work, not labs/nuker/ext. */
function _roomShellSitesOnly(room: any): boolean {
    if (room._pacShellOnly !== undefined) return room._pacShellOnly;
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    if (!sites.length) {
        room._pacShellOnly = false;
        return false;
    }
    for (let i = 0; i < sites.length; i++) {
        const t = sites[i].structureType;
        if (t !== STRUCTURE_ROAD && t !== STRUCTURE_RAMPART) {
            room._pacShellOnly = false;
            return false;
        }
    }
    room._pacShellOnly = true;
    return true;
}

/** The storage floor this creep must respect, by role and room state. */
function _storageFloorFor(creep: any): number {
    const role = creep.memory && creep.memory.role;
    if (role === "filler") return 0;
    const room = creep.room;
    if (STORAGE_BUILD_ROLES[role]) {
        if (_roomHasSites(room) && _roomHasEnergyIncome(room)) {
            const lvl = room.controller && room.controller.level;
            if (lvl >= 6) {
                const freeze = lvl >= 8 ? 150000 : lvl >= 7 ? 80000 : 30000;
                const store = room.storage && room.storage.my
                    ? (room.storage.store[RESOURCE_ENERGY] || 0) : 0;
                // Broke + only road/rampart sites: spend the thin bank.
                // 80k here is why W2N1's 8k sat unused while the token
                // builder stood 0e next to 5 road sites.
                if (_roomShellSitesOnly(room) && store < freeze) return STORAGE_FLOOR_BUILD;
                return freeze;
            }
            return STORAGE_FLOOR_BUILD;
        }
        return STORAGE_FLOOR_DEFAULT;
    }
    if (STORAGE_UPGRADE_ROLES[role]) {
        if (_roomHasEnergyIncome(room)) return STORAGE_FLOOR_UPGRADE;
        return STORAGE_FLOOR_DEFAULT;
    }
    return STORAGE_FLOOR_DEFAULT;
}

Creep.prototype.withdrawStorage = function withdrawStorage(storage) {
    if(storage) {
        let StructureType = storage.structureType;
        let StorageEnergyStore = storage.store[RESOURCE_ENERGY];
        let Role = this.memory.role;
        let StorageFloor = _storageFloorFor(this);
        // A lowered floor is a CAP, not just a gate. `withdraw()` with no
        // amount takes everything the creep can hold, so a bare gate at 300
        // let the first builder to reach a 407-energy storage empty it — the
        // cushion the floor is supposed to be existed only on paper. Live
        // W2N1 did exactly that within a minute of this landing: 407 -> 0.
        // Above the default rung nothing changes: 2000 already dwarfs any
        // worker body, so the cap never binds there.
        let StorageCapped = StorageFloor > 0 && StorageFloor < STORAGE_FLOOR_DEFAULT && StructureType == STRUCTURE_STORAGE;
        // ...and a trip is only worth making if the slice above the floor is
        // worth carrying.
        let StorageGate = StorageCapped ? StorageFloor + STORAGE_MIN_DRAW : StorageFloor;
        if(StorageEnergyStore < StorageGate && StructureType == STRUCTURE_STORAGE) {
            if(Game.time % 50 == 1) {
                console.log("Storage requires", StorageGate, "energy for role", Role, "- try again later.", this.room.name)
            }
            this.acquireEnergyWithContainersAndOrDroppedEnergy();
            return;
        }
        else if(StructureType == STRUCTURE_CONTAINER && Role != "filler") {
            // Hub at spawn.y-2 is findStorage() below RCL4. A 200e box
            // used to bounce builders (hard 300) so W3N3's two [W,2C,2M]
            // walked 0e while the depot sites sat at 0. Leave 50.
            const boxMin = STORAGE_BUILD_ROLES[Role] && _roomHasSites(this.room) ? 50 : 300;
            if(StorageEnergyStore < boxMin) {
                if(Game.time % 50 == 0) {
                    console.log("Container Storage requires", boxMin, "energy to withdraw. Try again later.", this.room.name)
                }
                this.acquireEnergyWithContainersAndOrDroppedEnergy();
                return;
            }
            // ...and when the box DOES have enough, take it. This branch used
            // to end here with no else, and the else below is unreachable for
            // a container, so every non-filler worker under RCL4 (builder,
            // repair, maintainer, upgrader, buildcontainer,
            // ControllerLinkFiller) returned undefined next to a full hub:
            // no withdraw, no move, and every caller only reacts to `== 0`.
            if(this.pos.isNearTo(storage)) {
                return this.withdraw(storage, RESOURCE_ENERGY);
            }
            if(Role) {
                this.MoveCostMatrixRoadPrio(storage, 1);
            }
            else {
                this.MoveCostMatrixIgnoreRoads(storage, 1);
            }
            return;
        }
        else {
            if(this.pos.isNearTo(storage)) {
                if(StorageCapped) {
                    let draw = Math.min(this.store.getFreeCapacity(RESOURCE_ENERGY), StorageEnergyStore - StorageFloor);
                    if(draw <= 0) {
                        this.acquireEnergyWithContainersAndOrDroppedEnergy();
                        return;
                    }
                    return this.withdraw(storage, RESOURCE_ENERGY, draw);
                }
                let result = this.withdraw(storage, RESOURCE_ENERGY);
                return result;
            }
            else {
                if(Role) {
                    this.MoveCostMatrixRoadPrio(storage, 1);
                }
                else {
                    this.MoveCostMatrixIgnoreRoads(storage, 1);
                }

            }
        }
    }
    else {
        this.room.findStorage();
    }
}

/** Native moveTo — captured before we replace it */
const _nativeMoveTo: any = Creep.prototype.moveTo;

/**
 * A stable cache key for "where am I walking to".
 *
 * The seven MoveCostMatrix* variants all guard their PathFinder call with
 * `!this.memory.MoveTargetId || this.memory.MoveTargetId != target.id`, and
 * then store `target.id`. That works for a structure or a creep and silently
 * fails for everything else: a bare RoomPosition has no `id`, so the guard
 * stored `undefined`, read `undefined` back, and `!undefined` re-triggered the
 * search on the very next tick. Every such creep re-ran a `maxOps: 1000`
 * PathFinder EVERY TICK for its whole life, with a perfectly good path already
 * sitting in memory.
 *
 * Measured on the live local server: of 202 creeps, 82 were holding a path and
 * 25 of those (30%) had no MoveTargetId — 16 carriers, 6 miners, 3 remote
 * repairers — i.e. up to 25,000 pathfinding ops a tick thrown away, against a
 * 100-tick average of 38 CPU.
 *
 * After: that count is zero. The honest CPU figure is per-creep, because the
 * fleet size moves on its own between samples and the raw average moves with
 * it — 38.37 CPU / 202 creeps = 0.190 before, 0.166-0.181 (mean ~0.175) across
 * three post-deploy samples of 192-213 creeps, so roughly -8%. The raw 100-tick
 * average did read 31.60 right after the deploy, but the fleet was at 157 at
 * that moment and that number should not be quoted on its own.
 *
 * Positions get a key built from their coordinates, which is exactly as stable
 * as an id: the same destination produces the same string, a different one
 * invalidates the path just like a different id would. Flags fall back to
 * their name.
 */
function moveKeyOf(target: any, style?: string): string {
    let key = "";
    if (!target) key = "";
    else if (target.id) key = target.id;
    else {
        const p: any = target.pos || target;
        if (p && typeof p.x === "number" && typeof p.y === "number" && p.roomName) {
            key = "p" + p.roomName + ":" + p.x + "," + p.y;
        } else if (target.name) {
            key = "n" + target.name;
        }
    }
    // style is part of the key: a road path reused after a flee/swamp
    // switch walks the old corridor through hostiles / expensive swamp
    return style ? style + "|" + key : key;
}

function asMoveTarget(target: any, dest: RoomPosition): any {
    if (target && target.pos && target.id) return target;
    if (target && target.pos) return target;
    return { pos: dest, id: "p" + dest.roomName + ":" + dest.x + "," + dest.y };
}

/**
 * Single movement API for Pacifist.
 * Same room → PathFinder + cached cost matrices.
 * Other room → native multi-room (long reusePath) for now.
 *
 * Styles: road (default), swamp, ignoreRoads, avoidHostiles
 */
Creep.prototype.goTo = function goTo(target: any, opts: GoToOpts = {}) {
    if (this.fatigue > 0) return ERR_TIRED;
    if (target == null) return ERR_INVALID_TARGET;

    const range = opts.range != null ? opts.range : 1;
    let style: GoToOpts["style"] = opts.style;
    if (!style) {
        // swampCost<=2 used to pick ignoreRoads (swamp 10) — the opposite
        // of a cheap-swamp ask (annoy.ts swampCost:2). Swamp matrix is 2.
        if (opts.ignoreRoads) style = "ignoreRoads";
        else if (opts.swampCost != null && opts.swampCost <= 3) style = "swamp";
        else style = "road";
    }
    if (this.memory.fleeing || (this.room.memory && this.room.memory.danger)) {
        style = "avoidHostiles";
    }

    let dest: RoomPosition;
    if (target instanceof RoomPosition) {
        dest = target;
    } else if (target.pos) {
        dest = target.pos;
    } else if (typeof target.x === "number" && typeof target.y === "number" && target.roomName) {
        dest = new RoomPosition(target.x, target.y, target.roomName);
    } else {
        return ERR_INVALID_TARGET;
    }

    if (this.pos.roomName === dest.roomName && this.pos.getRangeTo(dest) <= range) {
        return OK;
    }

    // multi-room fallback (never visualize — paths-to-edge spam + CPU)
    if (dest.roomName !== this.pos.roomName) {
        // avoidHostiles is otherwise dropped here: native moveTo walks the
        // default exit, so a creep leaving mid-raid steps through melee.
        // Walk the in-room exit on the avoid matrix; once on the border,
        // native finishes the room change.
        if (style === "avoidHostiles") {
            let exitDir: any = Game.map.findExit(this.pos.roomName, dest.roomName);
            if (!(typeof exitDir === "number" && exitDir > 0)) {
                const route: any = Game.map.findRoute(this.pos.roomName, dest.roomName);
                if (route && route !== -2 && route.length > 0) {
                    exitDir = route[0].exit;
                }
            }
            if (typeof exitDir === "number" && exitDir > 0) {
                const exit = this.pos.findClosestByRange(exitDir);
                if (exit && this.pos.getRangeTo(exit) > 0) {
                    const exitRange = this.pos.getRangeTo(exit) <= 1 ? 0 : 1;
                    this.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(exit, exitRange);
                    return OK;
                }
            }
        }
        return _nativeMoveTo.call(this, dest, {
            range,
            reusePath: opts.reusePath != null ? opts.reusePath : 80,
            ignoreRoads: style === "ignoreRoads",
            swampCost: style === "swamp" || style === "ignoreRoads" ? 2 : 5,
            maxRooms: opts.maxRooms != null ? opts.maxRooms : 16,
            // intentionally omit visualizePathStyle
        });
    }

    const mt = asMoveTarget(target, dest);
    if (style === "swamp") {
        this.MoveCostMatrixSwampPrio(mt, range);
    } else if (style === "ignoreRoads") {
        this.MoveCostMatrixIgnoreRoads(mt, range);
    } else if (style === "avoidHostiles") {
        this.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(mt, range);
    } else {
        this.MoveCostMatrixRoadPrio(mt, range);
    }
    return OK;
};

/**
 * Soft-replace moveTo → goTo when Memory.bench.opts.goTo (optimized).
 * baseline profile restores native moveTo behavior.
 */
(Creep.prototype as any).moveTo = function (first: any, second?: any, third?: any) {
    const useGoTo = !(Memory.bench && Memory.bench.opts && Memory.bench.opts.goTo === false);
    // strip path visuals always (blue exit lines / white combat paths)
    if (typeof first === "number" && typeof second === "number" && third && third.visualizePathStyle) {
        delete third.visualizePathStyle;
    } else if (second && second.visualizePathStyle) {
        delete second.visualizePathStyle;
    }
    if (!useGoTo) {
        return _nativeMoveTo.apply(this, arguments as any);
    }
    if (typeof first === "number" && typeof second === "number") {
        const opts = third || {};
        const pos = this.room.getPositionAt(first, second);
        if (!pos) return ERR_INVALID_TARGET;
        this.goTo(pos, {
            range: opts.range != null ? opts.range : 0,
            ignoreRoads: opts.ignoreRoads,
            swampCost: opts.swampCost,
            reusePath: opts.reusePath,
        });
        return OK;
    }
    const opts = second || {};
    // native moveTo defaults range 0 for object targets; range 1 returned
    // early so moveTo(rampart) never stepped onto the tile (defender manning)
    this.goTo(first, {
        range: opts.range != null ? opts.range : 0,
        ignoreRoads: opts.ignoreRoads,
        swampCost: opts.swampCost,
        reusePath: opts.reusePath,
    });
    return OK;
};

Creep.prototype.moveToRoom = function moveToRoom(roomName, travelTarget_x = 25, travelTarget_y = 25, ignoreRoadsBool = false, swampCostValue = 5, rangeValue = 20) {
    this.goTo(new RoomPosition(travelTarget_x, travelTarget_y, roomName), {
        range: rangeValue,
        reusePath: 80,
        ignoreRoads: ignoreRoadsBool,
        swampCost: swampCostValue,
    });
}

/**
 * One legal step OFF the border band, for a creep the transition code has
 * wedged on an exit tile.
 *
 * Prefers tiles further from the edge (that is the whole point), prefers empty
 * tiles, and shoves a neighbour only when every candidate is occupied — a
 * border pile-up is by definition a place where everything is occupied, so
 * "only step somewhere empty" is exactly the rule that would leave the creep
 * where it is.
 */
function stepOffExit(creep: any): boolean {
    const terrain = creep.room.getTerrain();
    const free: Array<{ dir: number; depth: number }> = [];
    const occupied: Array<{ dir: number; depth: number }> = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const x = creep.pos.x + dx;
            const y = creep.pos.y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            let blocked = false;
            for (const s of creep.room.lookForAt(LOOK_STRUCTURES, x, y)) {
                if ((OBSTACLE_OBJECT_TYPES as any).indexOf(s.structureType) !== -1) {
                    blocked = true;
                    break;
                }
            }
            if (blocked) continue;
            const dir = creep.pos.getDirectionTo(new RoomPosition(x, y, creep.room.name));
            // how far off the edge this candidate is — bigger is better
            const depth = Math.min(x, 49 - x, y, 49 - y);
            if (creep.room.lookForAt(LOOK_CREEPS, x, y).length > 0) occupied.push({ dir, depth });
            else free.push({ dir, depth });
        }
    }
    const options = free.length ? free : occupied;
    if (!options.length) return false;
    options.sort((a, b) => b.depth - a.depth);
    const dir = options[0].dir as DirectionConstant;
    if (!free.length) creep.SwapPositionWithCreep(dir);
    creep.move(dir);
    creep.memory.moving = true;
    return true;
}

/** How many exit tiles moveToRoomAvoidEnemyRooms is willing to path-score. */
const EXIT_CANDIDATES = 5;

/*
 * Two ROOM-level facts the traveller below reads per creep per tick: does this
 * foreign room have towers (-> Memory.AvoidRooms), and does it hold a collapsing
 * invader core (-> Memory.AvoidRoomsTemp). Neither depends on which creep is
 * asking, and both were a filtered FIND_HOSTILE_STRUCTURES walk EVERY tick for
 * EVERY creep whose room is not its home room — i.e. both legs of every remote
 * hauler, every scout, every remote worker, in an RCL8 enemy room where the
 * hostile-structure list is long.
 *
 * Called from exactly where the finds used to be, so the &&-chain around them
 * short-circuits identically and a room with no controller still never scans.
 */
const _hostileTowers = (room:any):any[] =>
    cachedDerived(room, "hostileTowers", () =>
        room.find(FIND_HOSTILE_STRUCTURES, {filter: (s:any) => s.structureType === STRUCTURE_TOWER}));

const _hostileCollapsingCores = (room:any):any[] =>
    cachedDerived(room, "hostileCores", () =>
        room.find(FIND_HOSTILE_STRUCTURES, {filter: (s:any) => s.structureType === STRUCTURE_INVADER_CORE && s.level > 0}));

Creep.prototype.moveToRoomAvoidEnemyRooms = function (targetRoom) {

    function isValidRoomName(roomName) {
        const match = roomName.match(/^(E|W)(\d+)(N|S)(\d+)$/);
        if (!match) {
            return false; // Invalid room name format
        }

        const [_, eastWestDirection, eastWestCoord, northSouthDirection, northSouthCoord] = match;

        const isValidNumber = (num) => {
            const remainder = num % 10;
            return remainder >= 4 && remainder <= 6;
        };

        return isValidNumber(eastWestCoord) && isValidNumber(northSouthCoord);
    }

    if(this.memory.role === "Guard" && this.memory.targetRoom !== targetRoom) {
        let hostileCreeps = cachedHostileCreeps(this.room);
        let hostileCreepsWithAttack = hostileCreeps.filter(creep => creep.getActiveBodyparts(ATTACK) > 25 || creep.getActiveBodyparts(RANGED_ATTACK) > 25);
        if(hostileCreepsWithAttack.length > 0) {
            let closestHostileCreep = this.pos.findClosestByRange(hostileCreepsWithAttack);
            if(this.pos.getRangeTo(closestHostileCreep) <= 9) {
                this.moveToRoomAvoidEnemyRooms(this.memory.homeRoom);
                return;
            }
        }
    }

    if (this.room.name !== this.memory.homeRoom) {
        if (this.room.controller && !this.room.controller.my && _hostileTowers(this.room).length > 0 && !_.includes(Memory.AvoidRooms, this.room.name, 0)) {
            Memory.AvoidRooms.push(this.room.name);
            // When we learned it, for whoever ages the list out. The map is
            // owned elsewhere and may not exist yet — never create it here.
            if ((Memory as any).AvoidRoomsAt) (Memory as any).AvoidRoomsAt[this.room.name] = Game.time;
        }

        else if (isValidRoomName(this.room.name) && (Game.time % 2 === 0 || this.hitsMax <= 4500)) {

            let strongholds = _hostileCollapsingCores(this.room);
            if(strongholds.length && strongholds[0].effects && strongholds[0].effects.length &&
                strongholds[0].effects[0].effect === EFFECT_COLLAPSE_TIMER) {

                let timerUntilGone = strongholds[0].effects[0].ticksRemaining;

                if (!Memory.AvoidRoomsTemp) {
                    Memory.AvoidRoomsTemp = {};
                }
                if (typeof Memory.AvoidRoomsTemp[this.room.name] === 'number') {
                    const roomValue = Memory.AvoidRoomsTemp[this.room.name];
                    if (roomValue === 0) {
                        Memory.AvoidRoomsTemp[this.room.name] = timerUntilGone;
                    }
                } else {
                    Memory.AvoidRoomsTemp[this.room.name] = timerUntilGone;
                }
            }

        }

    }

    if (this.memory.route && this.memory.route.length > 0 && this.memory.route[0].room === this.room.name) {
        this.memory.route.shift();
    }

    /*
     * A route is computed ONCE and then walked to the end. Everything below
     * only recomputes it when it is empty, invalid, or aimed at the wrong
     * target — so a room that turns hostile AFTER the route was picked is
     * walked into anyway, by every creep already holding that route.
     *
     * Live: three ContainerBuilders left E37N58 for E39N58 on a route through
     * E38N57, an RCL8 with six towers. The first one died, which is the only
     * way Memory.AvoidRooms ever learns a room (the push above needs one of
     * ours to be STANDING in it) — and the survivors kept the route they
     * already had and walked in after it. The list learned; the fleet did not.
     *
     * So re-check the held route against what we know now. Recomputing is a
     * findRoute call, so it must not become a per-tick habit: a hostile hop
     * that is genuinely the only way through comes straight back out of
     * findRoute (cost 24, not Infinity), and a naive "drop it" would then
     * re-path every tick forever. Keying on the SIGNATURE of the offending
     * hops means we pay exactly one recompute per change in that set — the
     * unavoidable-room case drops once, gets the same route back, and settles.
     */
    if (Game.time % 5 === 0 && this.memory.route && this.memory.route.length > 0) {
        let offenders = "";
        for (let i = 0; i < this.memory.route.length; i++) {
            const hop = this.memory.route[i] && this.memory.route[i].room;
            // The destination is a deliberate choice, not an accident of
            // routing — never refuse to path to where we were sent.
            if (!hop || hop === targetRoom) continue;
            if ((Memory.AvoidRooms && _.includes(Memory.AvoidRooms, hop, 0)) ||
                (Memory.AvoidRoomsTemp && Memory.AvoidRoomsTemp[hop])) {
                offenders += hop + ",";
            }
        }
        if (offenders) {
            if (this.memory._routeAvoid !== offenders) {
                this.memory._routeAvoid = offenders;
                delete this.memory.route;
            }
        }
        else if (this.memory._routeAvoid) {
            delete this.memory._routeAvoid;
        }
    }

    if (!this.memory.route || this.memory.route === -2 || this.memory.route && this.memory.route.length === 0 || (this.memory.route.length === 1 && this.memory.route[0].room === this.room.name) || (this.memory.route && this.memory.route.length > 0 && this.memory.route[this.memory.route.length - 1].room !== targetRoom)) {
        this.memory.route = Game.map.findRoute(this.room.name, targetRoom, {
            // arrow keeps `this` as the creep. A shorthand method binds `this`
            // to the options object, so the highway/SK weights never ran.
            routeCallback: (roomName, fromRoomName) => {
                if (Game.map.getRoomStatus(roomName).status !== "normal") {
                    return Infinity;
                }
                if ((Memory.AvoidRooms && Memory.AvoidRooms.includes(roomName)) || (Memory.AvoidRoomsTemp && Memory.AvoidRoomsTemp[roomName]) && roomName !== targetRoom) {
                    return 24;
                }

                /*
                 * AvoidRooms is a list of rooms that have already killed
                 * something of ours. Intel we gathered by LOOKING is free and
                 * arrives first: establishMemory() writes
                 * roomData.has_hostile_structures for every visible room whose
                 * controller is not ours, and it survives in Memory.rooms once
                 * vision is gone. That is the only persisted hostility signal
                 * in the codebase — there is no stored owner name, controller
                 * level or tower count for foreign rooms — so it is what we
                 * have.
                 *
                 * Deliberately soft (24, same rung as AvoidRooms, never
                 * Infinity): the flag also trips on invader cores and on
                 * leftover junk in empty rooms, and a hostile room is
                 * sometimes the only way through. `controller.my` is checked
                 * live because we always have vision of rooms we own — that
                 * covers a room we have since claimed whose old roomData still
                 * says hostile (E39N58 held a foreign spawn before it was
                 * ours), which would otherwise tax our own territory forever.
                 */
                if (roomName !== targetRoom) {
                    const seen: any = Game.rooms[roomName];
                    if (!seen || !seen.controller || !seen.controller.my) {
                        const intel: any = Memory.rooms && Memory.rooms[roomName];
                        if (intel && intel.roomData && intel.roomData.has_hostile_structures) {
                            return 24;
                        }
                    }
                }

                if (this && this.memory) {
                    // digits of "W15N15" are not the coords: parse, then
                    // highway if either %10==0, SK if both %10 in [4,6]
                    const parsed = roomName.match(/^[WE](\d+)[NS](\d+)$/);
                    if (parsed) {
                        const wx = parseInt(parsed[1], 10) % 10;
                        const ny = parseInt(parsed[2], 10) % 10;
                        if (wx === 0 || ny === 0) {
                            return 2;
                        }
                        if (wx >= 4 && wx <= 6 && ny >= 4 && ny <= 6) {
                            return 24;
                        }
                    }
                }

                return 4;
            }
        });
    }
        if(this.memory.route && this.memory.route != 2 && this.memory.route.length > 0) {
        let exit;
        let position;

        // Stuck on border pile-up: re-pick exit if we haven't moved
        if (this.memory._exitStuckPos === this.pos.x + "," + this.pos.y) {
            this.memory._exitStuck = (this.memory._exitStuck || 0) + 1;
        } else {
            this.memory._exitStuck = 0;
            this.memory._exitStuckPos = this.pos.x + "," + this.pos.y;
        }
        if (this.memory._exitStuck >= 5) {
            /*
             * A wedged creep has to MOVE.
             *
             * This used to do exactly one thing — `delete this.memory.exit` —
             * which leaves the creep standing on the same border tile, where the
             * room-transition code hands it straight back. Measured: 14 of 105
             * creeps were sitting on an exit tile at a single instant (13% of the
             * fleet), including pairs stacked on the same tile
             * (EnergyMiner-99651/90986-E2S7 both at 5,1;
             * RemoteRepairer-21961/43696-E3S3 both at 49,21 with _exitStuck 3 and
             * 2), and remote miner seat-time of 57-65% is largely this.
             */
            delete this.memory.exit;
            this.memory._exitStuck = 0;
            this.memory.path = false;
            delete this.memory._move;
            delete this.memory.MoveTargetId;
            stepOffExit(this);
            return;
        }

        if(!this.memory.exit || this.memory.exit.roomName !== this.room.name) {
            const routeData = this.memory.route[0];

            const exitPositions = this.room.find(routeData.exit);
            const exitsWithoutWalls = exitPositions.filter(position => {
              const structuresAtExit = position.lookFor(LOOK_STRUCTURES);
              // (there used to be a lookFor(LOOK_CREEPS) here whose result was
              // never read — one wasted look per exit tile, up to 49 of them)
              // skip blocked by walls; prefer emptier tiles later
              return !structuresAtExit.some(structure => structure.structureType === STRUCTURE_WALL);
            });

            if (exitsWithoutWalls.length > 0) {
                // Spread creeps across exit tiles (was: all findClosestByPath + ignoreCreeps → border line)
                const hash = this.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                // A full exit side is up to 49 tiles and the findPathTo below
                // is maxOps 500 EACH — ~25k ops per creep per re-pick, for
                // tiles half a room away that were never going to win on
                // pathLen*3. Score only the nearest handful; the crowding
                // penalty still spreads the fleet across those.
                const candidates = exitsWithoutWalls.length > EXIT_CANDIDATES
                    ? exitsWithoutWalls
                        .map((p) => ({ p, d: this.pos.getRangeTo(p) }))
                        .sort((a, b) => a.d - b.d)
                        .slice(0, EXIT_CANDIDATES)
                        .map((e) => e.p)
                    : exitsWithoutWalls;
                // score: prefer closer, prefer fewer creeps on tile, slight hash offset for diversity
                let best = null;
                let bestScore = Infinity;
                for (let i = 0; i < candidates.length; i++) {
                    const p = candidates[i];
                    const crowd = p.lookFor(LOOK_CREEPS).length;
                    const dist = this.pos.getRangeTo(p);
                    // path cost without ignoreCreeps so occupied exits look worse
                    const path = this.pos.findPathTo(p, { ignoreCreeps: false, maxOps: 500 });
                    const pathLen = path && path.length ? path.length : dist + 20;
                    const score = pathLen * 3 + crowd * 15 + ((i + hash) % 3);
                    if (score < bestScore) {
                        bestScore = score;
                        best = p;
                    }
                }
                this.memory.exit = best || candidates[hash % candidates.length];
            }
        }
        exit = this.memory.exit;
        if(!exit) {
            exit = this.pos.findClosestByRange(this.memory.route[0].exit);
        }
        if(exit && typeof exit.x === 'number' && typeof exit.y === 'number') {
            position = new RoomPosition(exit.x, exit.y, this.room.name);
        }
        if (!position) {
            delete this.memory.exit;
            return;
        }

        // If someone is already on the exit tile and it isn't us, don't all stand on the border —
        // path to a free adjacent approach or wait one tile back.
        const onExit = position.lookFor(LOOK_CREEPS);
        const blockedByOther = onExit.some((c) => c.id !== this.id);
        if (blockedByOther && this.pos.getRangeTo(position) <= 1) {
            // re-roll exit next tick
            delete this.memory.exit;
            // step aside along the border if possible
            const open = this.pos.getOpenPositions ? this.pos.getOpenPositions() : [];
            if (open && open.length) {
                this.move(this.pos.getDirectionTo(open[0]));
            }
            return;
        }

        // range 0 only when adjacent; otherwise range 1 reduces queueing on the exit pixel
        const range = this.pos.getRangeTo(position) <= 1 ? 0 : 1;
        this.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(position, range);

        return;
    }

};



Creep.prototype.harvestEnergy = function harvestEnergy() {
    if (
        this.memory.targetRoom &&
        this.memory.homeRoom &&
        this.memory.targetRoom !== this.memory.homeRoom
    ) {
        const home = Game.rooms[this.memory.homeRoom];
        // Remotes open at RCL3 (cap>=550) / RCL4. The old `< 4` rewrite
        // yanked every remote miner (and rescue ContainerBuilder that
        // called harvestEnergy) back home the first empty tick.
        // ContainerBuilders keep their colony target at any RCL.
        if (this.memory.role !== "buildcontainer" &&
            home && home.controller && home.controller.my && home.controller.level < 3) {
            this.memory.targetRoom = this.memory.homeRoom;
            delete this.memory.exit;
            delete this.memory.route;
            // remote sourceId stays visible from an adjacent home and
            // findSource would walk us back out the exit we just used
            delete this.memory.sourceId;
            delete this.memory.source;
        }
    }
    if(this.memory.targetRoom && this.memory.targetRoom !== this.room.name) {
        return this.moveToRoomAvoidEnemyRooms(this.memory.targetRoom)
    }

    let storedSource:any = Game.getObjectById(this.memory.source);
    // Same three predicates, cheapest first. getOpenPositions() is 8 RoomPosition
    // allocations, a terrain fetch and up to 8 lookFor(LOOK_CREEPS) — and being
    // leftmost it ran for every harvesting creep every tick, including the
    // parked miner sitting on its seat that `isNearTo` rejects in one compare.
    // All three are side-effect free, so && may be reordered freely.
    if (!storedSource || (!this.pos.isNearTo(storedSource) && !this.memory.sourceId && !storedSource.pos.getOpenPositions().length)) {
        delete this.memory.source;
        storedSource = this.findSource();
    }

    if(storedSource) {

        if(this.pos.isNearTo(storedSource) &&
        (this.memory.checkAmIOnRampart && this.memory.role == "EnergyMiner" ||
           this.memory.role !== "EnergyMiner" || this.memory.targetRoom !== this.memory.homeRoom)) {
            // still run the rampart-sit: adjacency used to skip MoveToSourceSafely
            if(this.room.memory.danger) {
                this.MoveToSourceSafely(storedSource, 1);
            }
            return this.harvest(storedSource);
        }
        else {
            if(this.room.memory.danger) {
                this.MoveToSourceSafely(storedSource, 1);

            }
            else {
                this.MoveCostMatrixRoadPrio(storedSource, 1, this.memory.role);
            }

            // spawn writes danger:false on every RCL6+ miner; live refresh
            // then arms this branch for 1-hit chips and steals the battery.
            // Same 300-hit floor as rooms.defence during danger.
            if(this.memory.danger && this.hits + 300 < this.hitsMax) {
                let HostileCreeps = cachedHostileCreeps(this.room);
                if(HostileCreeps.length > 0) {
                    let closestHostileToCreep = this.pos.findClosestByRange(HostileCreeps);
                    if(closestHostileToCreep && this.pos.getRangeTo(closestHostileToCreep) <= 3) {
                        this.room.roomTowersHealMe(this);
                    }
                }
            }
        }
    }

}

// try here to make ignore creeps on home path but not ignore creeps on the way there because then can stay on road when full energy for best movement but it could be risky hm

/* ------------------------------------------------------------------ *
 * Energy pickup: per-creep target lock + heap reservation ledger.
 *
 * Problem: the legacy path re-scanned every tick, sorted candidates by
 * AMOUNT, and had no reservations — so a pile shrinking mid-travel made
 * every hauler re-pick, and all haulers converged on the same pile.
 *
 * Fix: lock a target in creep.memory.pickup for PICKUP_LOCK_TTL ticks and
 * reserve the energy we intend to take, so other haulers see the pile as
 * already spoken for and pick a different one. Selection is by DISTANCE,
 * never by amount (amount is the thrash key).
 *
 * NOTE: the feature flag is read straight off Memory.features rather than
 * through utils/Features, to keep this hot path free of a module hop.
 * ------------------------------------------------------------------ */

/** Ticks a hauler sticks to a chosen pile before re-evaluating. */
const PICKUP_LOCK_TTL = 25;

/** Rebuilt lazily once per tick from Game.creeps — heap only, never Memory. */
let _pickupLedger: { tick: number; claims: Map<string, number> } | null = null;

/** Feature flag mirror of utils/Features.ts `pickupLock` (undefined = ON). */
function _pickupLockEnabled(): boolean {
    const f: any = (Memory as any).features;
    return !f || f.pickupLock !== false;
}

/** Energy in a drop / ruin / tombstone / container. */
function _pickupEnergyOf(o: any): number {
    if (!o) return 0;
    if (typeof o.amount === "number") {
        return o.resourceType === RESOURCE_ENERGY ? o.amount : 0;
    }
    if (o.store) return o.store[RESOURCE_ENERGY] || 0;
    return 0;
}

/** How much of a locked target a creep is actually going to take. */
function _pickupClaimOf(creep: any): number {
    const p = creep.memory && creep.memory.pickup;
    if (!p || !p.id) return 0;
    const free = creep.store.getFreeCapacity();
    if (free <= 0) return 0;
    return Math.min(free, p.amt != null ? p.amt : free);
}

/** id -> total energy claimed by live, unexpired locks. Rebuilt once/tick. */
function _pickupClaims(): Map<string, number> {
    if (_pickupLedger && _pickupLedger.tick === Game.time) return _pickupLedger.claims;
    const claims = new Map<string, number>();
    for (const name in Game.creeps) {
        const c: any = Game.creeps[name];
        const p = c.memory && c.memory.pickup;
        if (!p || !p.id) continue;
        if (p.t == null || Game.time - p.t > PICKUP_LOCK_TTL) continue;
        const claim = _pickupClaimOf(c);
        if (claim <= 0) continue;
        claims.set(p.id, (claims.get(p.id) || 0) + claim);
    }
    _pickupLedger = { tick: Game.time, claims };
    return claims;
}

/**
 * Energy on a target that nobody has claimed yet.
 * `ownClaim` is the asker's own reservation on this target — excluded so a
 * creep re-validating (or re-picking after TTL) its own lock doesn't see its
 * own reservation and bounce off a pile it already owns.
 */
function _pickupUnreserved(target: any, ownClaim: number): number {
    if (!target) return 0;
    let claimed = (_pickupClaims().get(target.id) || 0) - ownClaim;
    if (claimed < 0) claimed = 0;
    return _pickupEnergyOf(target) - claimed;
}

function _pickupBumpStat(field: string, n: number): void {
    if (!Memory.stats) Memory.stats = {};
    Memory.stats[field] = (Memory.stats[field] || 0) + n;
}

/**
 * Grab free energy from floor / ruins / tombstones / containers.
 * Used by carry, filler, upgrader, builder, etc. — including home room.
 */
Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquireEnergyWithContainersAndOrDroppedEnergy() {
    const free = this.store.getFreeCapacity();
    if (free <= 0) return;

    const room = this.room;
    if (!room.memory.Structures) room.memory.Structures = {};

    _pickupBumpStat("pickupTicks", 1);

    const go = (target: any) => {
        if (this.memory.role === "carry") this.MoveCostMatrixSwampPrio(target, 1);
        else this.MoveCostMatrixRoadPrio(target, 1);
    };

    /**
     * Issue the collect intent and book the throughput. `pickupGot / pickupTicks`
     * is energy collected per acquire call — the A/B throughput metric that is
     * immune to hauler-count swings between measurement windows.
     */
    const take = (target: any) => {
        _pickupBumpStat("pickupActs", 1);
        _pickupBumpStat("pickupGot", Math.min(free, _pickupEnergyOf(target)));
        return target.amount != null
            ? this.pickup(target)
            : this.withdraw(target, RESOURCE_ENERGY);
    };

    // Previous target, captured before any invalidation, so we can count
    // real switches (and undo this creep's stale claim) accurately.
    const prevLock: any = this.memory.pickup;
    const prevId: string | null = prevLock && prevLock.id ? prevLock.id : null;
    const prevClaim = _pickupClaimOf(this);

    const locking = _pickupLockEnabled();

    /** Unreserved energy, excluding this creep's own (possibly stale) claim. */
    const unreserved = (o: any) =>
        _pickupUnreserved(o, o && o.id === prevId ? prevClaim : 0);

    /** Commit a selection: instrument the switch, write the lock, book the claim. */
    const lockOn = (target: any, amount: number, queued?: boolean) => {
        if (!target || !target.id) return;
        if (target.id !== prevId) _pickupBumpStat("pickupSwitches", 1);
        const amt = Math.max(0, Math.min(free, amount));
        this.memory.pickup = { id: target.id, t: Game.time, amt: amt, q: queued ? 1 : 0 };
        if (!locking) return;
        // Keep the ledger honest for creeps that run later this tick.
        const claims = _pickupClaims();
        if (prevId && prevClaim > 0) {
            const left = (claims.get(prevId) || 0) - prevClaim;
            if (left > 0) claims.set(prevId, left);
            else claims.delete(prevId);
        }
        if (amt > 0) claims.set(target.id, (claims.get(target.id) || 0) + amt);
    };

    /*
     * The four candidate pools. Each is the room's raw find narrowed to
     * "holds energy" — no creep-dependent term in any of them — so they are
     * derived once per room per tick and shared by every hauler in the room
     * instead of being re-filtered per creep (and, for the adjacent rungs
     * below, three times per creep: once per category, every single call,
     * including the calls that go on to take the locked fast path).
     *
     * Reservations are NOT baked in: the pickup ledger stays strictly per
     * creep, applied over these lists exactly where it was applied before.
     */
    const dropsE:any[] = cachedDerived(room, "pickupDrops", () =>
        cachedDropped(room).filter((r:any) => r.resourceType === RESOURCE_ENERGY && r.amount > 0));
    const ruinsE:any[] = cachedDerived(room, "pickupRuins", () =>
        cachedRuins(room).filter((r:any) => r.store[RESOURCE_ENERGY] > 0));
    const tombsE:any[] = cachedDerived(room, "pickupTombs", () =>
        cachedTombstones(room).filter((t:any) => t.store[RESOURCE_ENERGY] > 0));

    /** first entry of a source-ordered list within one tile — same pick findInRange made */
    const adjacent = (list:any[]):any => {
        for (let i = 0; i < list.length; i++) {
            const p = list[i].pos;
            if (Math.abs(p.x - this.pos.x) <= 1 && Math.abs(p.y - this.pos.y) <= 1) return list[i];
        }
        return null;
    };

    // 1) Adjacent salvage first (instant tick, free profit, doesn't move us).
    //    Runs in both modes and does NOT disturb an existing lock.
    const adjDrop = adjacent(dropsE);
    if (adjDrop) return take(adjDrop);

    const adjRuin = adjacent(ruinsE);
    if (adjRuin) return take(adjRuin);

    const adjTomb = adjacent(tombsE);
    if (adjTomb) return take(adjTomb);

    /*
     * How much energy is worth walking for, scaled to the body.
     *
     * Measured: 32 of 67 live carriers held a `pickup` target with less than 50
     * energy in it, 20 of those <= 4, several at exactly amt:1 — including two
     * 300-capacity carriers in E1S4 each crossing the room for ONE energy while
     * 4,796 sat in a single pile at (44,10) in the same room. The bot's own
     * counters read pickupSwitches 155,046 / pickupActs 466,452, i.e. a third of
     * all pickup actions were a re-target.
     *
     * A crumb next to us is still free (the adjacent-salvage rungs above take it
     * without moving); what has to stop is TRAVELLING for one.
     */
    const minWorth = Math.max(50, Math.min(200, Math.floor(free * 0.25)));
    /** near piles may be smaller — the walk is short */
    const nearWorth = Math.max(25, Math.floor(minWorth / 2));

    // 2) Locked fast path — no scanning at all while the lock holds.
    if (locking && prevId) {
        const locked: any = Game.getObjectById(prevId);
        const expired = Game.time - (prevLock.t || 0) > PICKUP_LOCK_TTL;
        // Hysteresis: keep threshold is half the select threshold so a pile
        // shrinking a little doesn't bounce us straight back off it.
        // A queued lock (picked when everything was reserved) still needs a real
        // floor — `> 0` kept a lock alive on a single crumb for the creep's
        // whole life, which is the other half of the measurement above.
        const keepMin = Math.max(25, Math.min(nearWorth, Math.floor(free / 2)));
        const worthIt = prevLock.q
            ? _pickupEnergyOf(locked) >= Math.min(50, free)
            : unreserved(locked) >= keepMin;
        const stillGood =
            !!locked &&
            !expired &&
            locked.pos &&
            locked.pos.roomName === this.pos.roomName &&
            worthIt;

        if (stillGood) {
            if (this.pos.isNearTo(locked)) return take(locked);
            go(locked);
            return;
        }
        // Invalid (gone / other room / TTL / reserved away) → re-select below.
        delete this.memory.pickup;
    }

    // 3) Selection. Category order is unchanged (ruins → tombs → drops →
    //    containers); within a category we take the CLOSEST candidate that
    //    still has unreserved energy. Never sort by amount — amount is the
    //    thrash key.
    const selectMin = Math.min(nearWorth, free);
    /** strict = respect other creeps' reservations. */
    const hasRoom = (o: any, strict: boolean) =>
        !locking || !strict || unreserved(o) >= selectMin;
    const takeable = (o: any) =>
        locking ? Math.min(free, unreserved(o)) : Math.min(free, _pickupEnergyOf(o));

    const pick = (strict: boolean): any => {
        const ruins = ruinsE.filter((r:any) => hasRoom(r, strict));
        if (ruins.length) {
            if (!locking) ruins.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            return this.pos.findClosestByRange(ruins) || ruins[0];
        }

        const tombs = tombsE.filter((t:any) => hasRoom(t, strict));
        if (tombs.length) {
            if (!locking) tombs.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            return this.pos.findClosestByRange(tombs) || tombs[0];
        }

        // Nearby drops first (range 12, amount worth walking), then any pile.
        // The far fallback was `r.amount > 0` — no minimum at all — which is
        // what put 300-capacity carriers on cross-room walks for 1 energy.
        // dropsE is already "energy, amount > 0"; nearWorth/minWorth are both
        // >= 25, so the narrower amount tests below still decide everything.
        let drops = dropsE.filter((r:any) =>
            r.amount >= nearWorth &&
            this.pos.getRangeTo(r) <= 12 &&
            hasRoom(r, strict));
        if (!drops.length) {
            drops = dropsE.filter((r:any) =>
                r.amount >= minWorth &&
                hasRoom(r, strict));
        }
        if (drops.length) {
            if (!locking) drops.sort((a, b) => b.amount - a.amount);
            return this.pos.findClosestByRange(drops) || drops[0];
        }

        // Containers. Never read room.memory.Structures.container directly: the
        // raw id skips every exclusion (bin / hub storage / controller depot)
        // AND the fill floor, which is what locked carriers onto a near-empty
        // drop-off while the source containers spilled. findContainers() keeps
        // the same cache, but only hands it back once it passes the filter.
        let container: any = room.findContainers(free);
        // Retry at the low threshold whenever the first pass produced nothing
        // usable — including when it produced NOTHING AT ALL. The old guard was
        // `if (container && ...)`, so the fallback could never run in the exact
        // case it exists for: no container holds more than this creep's free
        // capacity, so the creep idled next to a half-full source container.
        if (!container || container.store[RESOURCE_ENERGY] <= 0 || !hasRoom(container, strict)) {
            container = room.findContainers(1);
        }
        if (container && container.store[RESOURCE_ENERGY] > 0 && hasRoom(container, strict)) {
            return container;
        }
        // findContainers is sticky-one: when that seat is fully claimed,
        // scan the other source containers instead of idling on the floor
        const st = (room.memory && room.memory.Structures) || {};
        // Structures.bin / storage / controllerLink are read fresh per creep —
        // findContainers() above can rewrite them mid-tick — so only the
        // "container with energy in it" half is the shared room/tick list.
        const containersE:any[] = cachedDerived(room, "pickupContainers", () =>
            cachedStructures(room).filter((s:any) =>
                s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0));
        const others = containersE.filter((s:any) =>
            s.id !== st.bin &&
            s.id !== st.storage &&
            s.id !== st.controllerLink &&
            (!container || s.id !== container.id) &&
            hasRoom(s, strict));
        if (others.length) {
            return this.pos.findClosestByRange(others) || others[0];
        }
        return null;
    };

    let queued = false;
    let target: any = pick(true);
    if (!target && locking) {
        // Everything within reach is already spoken for. Queueing behind
        // another hauler still beats standing still — piles regenerate, and
        // idling here is what leaves dropped energy on the floor. Take the
        // closest pile regardless of reservations (still locked, still no
        // thrash) and claim nothing.
        target = pick(false);
        if (target) {
            queued = true;
            _pickupBumpStat("pickupFallback", 1);
        }
    }
    if (!target) {
        _pickupBumpStat("pickupIdle", 1);
        return;
    }

    lockOn(target, queued ? 0 : takeable(target), queued);
    if (this.pos.isNearTo(target)) return take(target);
    go(target);
}

Creep.prototype.roadCheck = function roadCheck() {
    let creepBlock = this.pos;
    let answer = creepBlock.lookFor(LOOK_STRUCTURES, {filter: building => building.structureType == STRUCTURE_ROAD})
    if(answer.length > 0) {
        return true;
    }
    else {
        return false;
    }

}

Creep.prototype.fleeHomeIfInDanger = function fleeHomeIfInDanger(): void | string {
    if(this.memory.targetRoom && this.memory.homeRoom && this.memory.targetRoom !== this.memory.homeRoom && Memory.rooms[this.memory.targetRoom] && Memory.rooms[this.memory.targetRoom].roomData && Memory.rooms[this.memory.targetRoom].roomData.has_hostile_creeps) {
        if(this.room.name == this.memory.targetRoom) {
            this.memory.timeOut = 25;
            this.moveToRoom(this.memory.homeRoom);
            return "timeOut";
        }
        else if(this.memory.timeOut && this.room.name !== this.memory.targetRoom && this.memory.timeOut > 0) {
            this.memory.timeOut -= 1;
            if(this.pos.x == 49) {
                if(this.move(LEFT) !== 0) {
                    if(this.move(TOP_LEFT) !== 0) {
                        if(this.move(BOTTOM_LEFT) !== 0) {
                            if(this.move(TOP) !== 0) {
                                this.move(BOTTOM);
                            }
                        }
                    }
                }

            }
            else if(this.pos.x == 0) {
                if(this.move(RIGHT) !== 0) {
                    if(this.move(TOP_RIGHT) !== 0) {
                        if(this.move(BOTTOM_RIGHT) !== 0) {
                            if(this.move(TOP) !== 0) {
                                this.move(BOTTOM);
                            }
                        }
                    }
                }
            }
            else if(this.pos.y == 49) {
                if(this.move(TOP) !== 0) {
                    if(this.move(TOP_LEFT) !== 0) {
                        if(this.move(TOP_RIGHT) !== 0) {
                            if(this.move(LEFT) !== 0) {
                                this.move(RIGHT);
                            }
                        }
                    }
                }
            }
            else if(this.pos.y == 0) {
                if(this.move(BOTTOM) !== 0) {
                    if(this.move(BOTTOM_LEFT) !== 0) {
                        if(this.move(BOTTOM_RIGHT) !== 0) {
                            if(this.move(LEFT) !== 0) {
                                this.move(RIGHT);
                            }
                        }
                    }
                }
            }
            return "timeOut";
        }
    }
}

Creep.prototype.moveAwayIfNeedTo = function moveAwayIfNeedTo() {
    function findOpenBlocks(creep) {
        let positions = []
        // Check bounds before adding positions
        if(creep.pos.x > 0) {
            if(creep.pos.y > 0) positions.push([creep.pos.x -1, creep.pos.y -1, creep.room.name]);
            positions.push([creep.pos.x -1, creep.pos.y, creep.room.name]);
            if(creep.pos.y < 49) positions.push([creep.pos.x -1, creep.pos.y +1, creep.room.name]);
        }
        if(creep.pos.y > 0) positions.push([creep.pos.x, creep.pos.y -1, creep.room.name]);
        if(creep.pos.y < 49) positions.push([creep.pos.x, creep.pos.y +1, creep.room.name]);
        if(creep.pos.x < 49) {
            if(creep.pos.y > 0) positions.push([creep.pos.x +1, creep.pos.y -1, creep.room.name]);
            positions.push([creep.pos.x +1, creep.pos.y, creep.room.name]);
            if(creep.pos.y < 49) positions.push([creep.pos.x +1, creep.pos.y +1, creep.room.name]);
        }

        let creep_nearby = false;
        let empty_block = false;
        for (let position of positions) {
            if (!position || position.length !== 3 || typeof position[0] !== 'number' || typeof position[1] !== 'number' || typeof position[2] !== 'string' || position[0] < 0 || position[0] > 49 || position[1] < 0 || position[1] > 49) {
                continue;
            }
            let positioninroom = new RoomPosition(position[0], position[1], position[2]);

            let lookTerrain = positioninroom.lookFor(LOOK_TERRAIN);
            if(lookTerrain[0] != "wall") {
                let lookForCreeps = positioninroom.lookFor(LOOK_CREEPS);
                let lookForStructures = positioninroom.lookFor(LOOK_STRUCTURES);
                if(lookForCreeps.length > 0 && lookForCreeps[0].store.getFreeCapacity() == 0 && lookForCreeps[0].memory.role != "EnergyManager" && lookForCreeps[0].memory.role != "upgrader" && lookForCreeps[0].memory.role != "EnergyMiner" && lookForCreeps[0].memory.role != "upgrader" && lookForCreeps[0].memory.role != "repair" && lookForCreeps[0].memory.role != "filler") {
                    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
                    if(!storage || lookForCreeps[0].pos.getRangeTo(storage) >= creep.pos.getRangeTo(storage)) {
                        creep_nearby = true;
                    }
                }
                if(lookForCreeps.length == 0 && lookForStructures.length == 0 || lookForStructures.length == 1 && lookForStructures[0].structureType == STRUCTURE_ROAD) {
                    empty_block = position;
                    if(creep_nearby != false) {
                        return empty_block;
                    }
                }
            }
        }
        if(creep_nearby != false && empty_block != false) {
            return empty_block;
        }
        return false;
    }

    let position = findOpenBlocks(this)
    if(position !== false && Array.isArray(position) && position.length === 3 && typeof position[0] === 'number' && typeof position[1] === 'number' && typeof position[2] === 'string' && position[0] >= 0 && position[0] <= 49 && position[1] >= 0 && position[1] <= 49) {
        let LocationToMove =  new RoomPosition(position[0], position[1], position[2]);
        this.moveTo(LocationToMove);
        // console.log(this.room.name, "moving away now")
        return "i moved";
    }
    else {
        return position;
    }
}

Creep.prototype.Sweep = function Sweep() {
    if (!this.memory.lockedDropped || Game.getObjectById(this.memory.lockedDropped) == null) {
        const sources = this.room.find(FIND_SOURCES);
        if (!sources.length) return "nothing to sweep";

        // Drops: at low RCL ignore miner-side piles (miners drop by source on purpose)
        // .slice(): the tail of this function sorts the list IN PLACE, and
        // room.find() hands back the engine's own per-tick cache — the array
        // that everything else in this file (and RoomCache) reads. Sorting it
        // silently reordered every later drop scan in the room this tick.
        let droppedResources = cachedDropped(this.room).slice();
        if (this.room.controller && this.room.controller.level <= 3) {
            droppedResources = droppedResources.filter((resource) => {
                const src = resource.pos.findClosestByRange(sources);
                return !src || resource.pos.getRangeTo(src) > 1;
            });
        }

        const tombs = this.room.find(FIND_TOMBSTONES, {
            filter: (t) => _.sum(t.store) > 0,
        });
        const ruins = this.room.find(FIND_RUINS, {
            filter: (r) => _.sum(r.store) > 0,
        });

        if (!droppedResources.length && !tombs.length && !ruins.length) {
            return "nothing to sweep";
        }

        // Prefer nearby, then largest loot piles (including ruins from destroyed structures)
        const nearDrops = droppedResources.filter((r) => this.pos.getRangeTo(r) < 8);
        const nearTombs = tombs.filter((t) => this.pos.getRangeTo(t) < 8);
        const nearRuins = ruins.filter((r) => this.pos.getRangeTo(r) < 8);

        if (nearRuins.length) {
            nearRuins.sort((a, b) => _.sum(b.store) - _.sum(a.store));
            this.memory.lockedDropped = nearRuins[0].id;
        } else if (nearTombs.length) {
            nearTombs.sort((a, b) => _.sum(b.store) - _.sum(a.store));
            this.memory.lockedDropped = nearTombs[0].id;
        } else if (nearDrops.length) {
            nearDrops.sort((a, b) => b.amount - a.amount);
            this.memory.lockedDropped = nearDrops[0].id;
        } else if (ruins.length) {
            ruins.sort((a, b) => _.sum(b.store) - _.sum(a.store));
            this.memory.lockedDropped = ruins[0].id;
        } else if (tombs.length) {
            tombs.sort((a, b) => _.sum(b.store) - _.sum(a.store));
            this.memory.lockedDropped = tombs[0].id;
        } else {
            droppedResources.sort((a, b) => b.amount - a.amount);
            this.memory.lockedDropped = droppedResources[0].id;
        }
    }

    const target: any = Game.getObjectById(this.memory.lockedDropped);
    if (!target) {
        this.memory.lockedDropped = false;
        return "nothing to sweep";
    }

    // Dropped resource
    if (target.amount != null && target.resourceType) {
        const res = this.pickup(target);
        if (res === OK) return "picked up";
        if (res === ERR_NOT_IN_RANGE) {
            this.MoveCostMatrixSwampPrio(target, 1);
            return false;
        }
        this.memory.lockedDropped = false;
        return false;
    }

    // Ruin / tombstone — withdraw any resource (prefer energy)
    if (target.store) {
        const resType =
            target.store[RESOURCE_ENERGY] > 0
                ? RESOURCE_ENERGY
                : (Object.keys(target.store)[0] as ResourceConstant);
        if (!resType) {
            this.memory.lockedDropped = false;
            return "nothing to sweep";
        }
        const res = this.withdraw(target, resType);
        if (res === OK) return "picked up";
        if (res === ERR_NOT_IN_RANGE) {
            this.MoveCostMatrixSwampPrio(target, 1);
            return false;
        }
        this.memory.lockedDropped = false;
        return false;
    }

    this.memory.lockedDropped = false;
    return false;
}


/** spawn_list is a flat [body, name, opts] triple list. */
function _spawnQueueHasSweeper(room:any): boolean {
    const queue = room && room.memory && room.memory.spawn_list;
    if(!queue || !queue.length) return false;
    for(let i = 1; i + 1 < queue.length; i += 3) {
        if(typeof queue[i] === "string" && queue[i].indexOf("Sweeper-") === 0) return true;
        const opts = queue[i + 1];
        if(opts && opts.memory && opts.memory.role === "sweeper") return true;
    }
    return false;
}

Creep.prototype.recycle = function recycle() {
    // Every recycle prints ONCE: the 2026-08-19 VPS collapse was newborns
    // dying invisibly (verbose-gated logs + 30-tick tombstones). Cheap, and
    // it makes "who killed my creep" a console grep instead of a manhunt.
    if(!this.memory._recLogged) {
        this.memory._recLogged = 1;
        logAlways("[death] recycle " + this.name + " role=" + this.memory.role + " ttl=" + this.ticksToLive + " @" + this.room.name + " " + this.pos.x + "," + this.pos.y);
    }
    if(this.memory.homeRoom && this.memory.homeRoom !== this.room.name) {
        return this.moveToRoomAvoidEnemyRooms(this.memory.homeRoom);
    }

    let StructuresObject = this.room.memory.Structures;
    let bin;

    if(this.ticksToLive < 600 && this.room.memory.labs) {
        let boosted = false;
        let body = this.body;
        for(let part of body) {
            if(part.boost) {
                boosted= true;
                break;
            }
        }
        if(boosted) {
            let inputLab1;
            let inputLab2;
            let outputLab1;
            let outputLab2;
            let outputLab3;
            let outputLab4;
            let outputLab5;
            let outputLab6;
            let outputLab7;
            let outputLab8;
            let lab;
            if(this.room.memory.labs.inputLab1) {
                inputLab1 = Game.getObjectById(this.room.memory.labs.inputLab1)
            }
            if(this.room.memory.labs.inputLab2) {
                inputLab2 = Game.getObjectById(this.room.memory.labs.inputLab2)
            }
            if(this.room.memory.labs.outputLab1) {
                outputLab1 = Game.getObjectById(this.room.memory.labs.outputLab1)
            }
            if(this.room.memory.labs.outputLab2) {
                outputLab2 = Game.getObjectById(this.room.memory.labs.outputLab2)
            }
            if(this.room.memory.labs.outputLab3) {
                outputLab3 = Game.getObjectById(this.room.memory.labs.outputLab3)
            }
            if(this.room.memory.labs.outputLab4) {
                outputLab4 = Game.getObjectById(this.room.memory.labs.outputLab4)
            }
            if(this.room.memory.labs.outputLab5) {
                outputLab5 = Game.getObjectById(this.room.memory.labs.outputLab5)
            }
            if(this.room.memory.labs.outputLab6) {
                outputLab6 = Game.getObjectById(this.room.memory.labs.outputLab6)
            }
            if(this.room.memory.labs.outputLab7) {
                outputLab7 = Game.getObjectById(this.room.memory.labs.outputLab7)
            }
            if(this.room.memory.labs.outputLab8) {
                outputLab8 = Game.getObjectById(this.room.memory.labs.outputLab8)
            }

            if(inputLab1 && inputLab1.cooldown <= 20) {
                lab = inputLab1
            }
            else if(inputLab2 && inputLab2.cooldown <= 20) {
                lab = inputLab2
            }
            else if(outputLab1 && outputLab1.cooldown <= 20) {
                lab = outputLab1
            }
            else if(outputLab2 && outputLab2.cooldown <= 20) {
                lab = outputLab2
            }
            else if(outputLab3 && outputLab3.cooldown <= 20) {
                lab = outputLab3
            }
            else if(outputLab4 && outputLab4.cooldown <= 20) {
                lab = outputLab4
            }
            else if(outputLab5 && outputLab5.cooldown <= 20) {
                lab = outputLab5
            }
            else if(outputLab6 && outputLab6.cooldown <= 20) {
                lab = outputLab6
            }
            else if(outputLab7 && outputLab7.cooldown <= 20) {
                lab = outputLab7
            }
            else if(outputLab8 && outputLab8.cooldown <= 20) {
                lab = outputLab8
            }

            if(lab) {
                if (!this.room.memory.labs.paused) {
                    this.room.memory.labs.paused = [];
                }
                if (!this.room.memory.labs.paused.some((pausedLab) => pausedLab.id === lab.id)) {
                    this.room.memory.labs.paused.push({ timer: 21, id: lab.id });
                } else {
                    this.room.memory.labs.paused = this.room.memory.labs.paused.map((pausedLab) => {
                        if (pausedLab.id === lab.id) {
                            pausedLab.timer = 50;
                        }
                        return pausedLab;
                    });
                }

                if(this.pos.isNearTo(lab)) {


                    let result = lab.unboostCreep(this);
                    if(result === 0) {
                        // make the lab have timer of 1
                        this.room.memory.labs.paused = this.room.memory.labs.paused.map((pausedLab) => {
                            if (pausedLab.id === lab.id) {
                                pausedLab.timer = 1;
                            }
                            return pausedLab;
                        }
                        );

                    }
                }
                else {
                    let sweepers = this.room.find(FIND_MY_CREEPS, {filter: c => c.memory.role === 'sweeper'});
                    if(sweepers.length > 0) {
                        for(let sweeper of sweepers) {
                            if(!sweeper.memory.full) sweeper.MoveCostMatrixIgnoreRoads(lab, 3);
                        }
                    }
                    this.MoveCostMatrixRoadPrio(lab, 1)
                }
                // flag is set at queue; shred/drop never cleared it, so a
                // dead request left boosted minerals decaying on the floor
                if(!this.room.find(FIND_MY_CREEPS, {filter: c => c.memory.role === 'sweeper'}).length && !_spawnQueueHasSweeper(this.room)) {
                    this.memory.spawnedSweeper = false;
                }
                if(!this.memory.spawnedSweeper && this.room.find(FIND_MY_CREEPS, {filter: c => c.memory.role === 'sweeper'}).length < 1 && !_spawnQueueHasSweeper(this.room)) {
                    if(!this.room.memory.spawn_list) this.room.memory.spawn_list = [];
                    let newName = 'Sweeper-' + Math.floor(Math.random() * Game.time) + "-" + this.room.name;
                    this.room.memory.spawn_list.unshift([CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], newName, {memory: {role: 'sweeper'}});
                    console.log('Adding Sweeper to Spawn List: ' + newName);
                    this.memory.spawnedSweeper = true;
                }
                return;
            }

        }
    }


    if(StructuresObject) {
        if(StructuresObject.bin) {
            bin = this.room.find(FIND_STRUCTURES, {
                filter: (structure) => structure.id == StructuresObject.bin
            })[0];
            if(bin) {
                if(this.pos.isEqualTo(bin)) {
                    // findBin is any container within 2 of storage. Stamp-hub
                    // assumed spawn at bin.y+1; PlanV2 bins almost never have
                    // that (road/extension = silent no-op, empty = suicide).
                    let spawns = this.room.find(FIND_MY_SPAWNS);
                    let next = null;
                    for(let spawn of spawns) {
                        if(this.pos.isNearTo(spawn)) { next = spawn; break; }
                    }
                    if(next) {
                        next.recycleCreep(this);
                    } else if(spawns.length) {
                        this.MoveCostMatrixRoadPrio(spawns[0], 1);
                    } else {
                        this.suicide();
                    }
                }
                else {
                    this.MoveCostMatrixRoadPrio(bin, 0);
                }
            }
            else {
                delete this.room.memory.Structures.bin
                let spawns = this.room.find(FIND_MY_SPAWNS);
                if(spawns.length) {
                    let spawn = spawns[0];
                    if(spawn) {
                        if(this.pos.isNearTo(spawn)) {
                            spawn.recycleCreep(this);
                        }
                        else {
                            this.MoveCostMatrixRoadPrio(spawn, 1);
                        }
                    }

                }
                else {
                this.suicide();
                }
            }
        }
        else {
            if(StructuresObject.storage || this.room.storage) {
                let storage:any = Game.getObjectById(StructuresObject.storage) || this.room.storage;
                if(storage) {
                    let binPos = new RoomPosition(storage.pos.x, storage.pos.y+1, storage.room.name);
                    let lookForBin = binPos.lookFor(LOOK_STRUCTURES);
                    for(let s of lookForBin) {
                        if(s.structureType == STRUCTURE_CONTAINER) {
                            StructuresObject.bin = s.id;
                            break;
                        }
                    }
                }
            }
        }
    }
    else {
        this.room.memory.Structures = {};
    }
}

Creep.prototype.RangedAttackFleeFromMelee = function RangedAttackFleeFromMelee(fleeTarget) {
    let FleePath = PathFinder.search(this.pos,{pos:fleeTarget.pos, range:3}, {flee:true});
    if(!FleePath.path || FleePath.path.length == 0) {
        return;
    }
    let FirstPathGuy = FleePath.path[0];
    this.move(this.pos.getDirectionTo(FirstPathGuy));
    return;
}

Creep.prototype.fleeFromMelee = function(fleeTarget) {
    const room = this.room;
    const terrain = new Room.Terrain(room.name);
    let swampCost = 5;
    let plainsCost = 1;
    if(this.memory.role === "carry" || this.memory.role === "filler") {
        swampCost = 1;
        plainsCost = 2;
    }
    const costMatrix = new PathFinder.CostMatrix();

    // Consider terrain walls (walls and border edges of the room) as impassable
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            let terrainHere = terrain.get(x, y)
            if (terrainHere === TERRAIN_MASK_WALL) {
                costMatrix.set(x, y, 255);
            }
            else if(terrainHere === TERRAIN_MASK_SWAMP) {
                costMatrix.set(x, y, swampCost);
            }
            else {
                costMatrix.set(x, y, plainsCost);
            }
        }
    }

    // Create a CostMatrix considering walls and terrain walls as impassable
    room.find(FIND_STRUCTURES).forEach((structure) => {
        if(structure.structureType === STRUCTURE_RAMPART && structure.my && structure.pos.lookFor(LOOK_STRUCTURES).length === 1) {
            costMatrix.set(structure.pos.x, structure.pos.y, 2);
        }

        else if (structure.structureType !== STRUCTURE_ROAD && structure.structureType !== STRUCTURE_CONTAINER) {
            // Set other structures' tiles to a higher cost to discourage the pathfinder from using them
            costMatrix.set(structure.pos.x, structure.pos.y, 255);
        }
        else if(structure.structureType === STRUCTURE_ROAD) {
            costMatrix.set(structure.pos.x, structure.pos.y, 1);
        }
    });



    // this CostMatrix is only valid for this room; without maxRooms PathFinder
    // paints the same walls onto neighbouring rooms and near-exit flees die
    const FleePath = PathFinder.search(this.pos, { pos: fleeTarget.pos, range: 5 }, { flee: true, maxRooms: 1, roomCallback: (roomName) => costMatrix });

    if(!FleePath.path || FleePath.path.length == 0) {
        return;
    }

    // Get the next position to move to
    const FirstPathGuy = FleePath.path[0];

    // Move to the next position
    this.move(this.pos.getDirectionTo(FirstPathGuy));
};

Creep.prototype.fleeFromRanged = function(fleeTarget) {
    const room = this.room;
    const terrain = new Room.Terrain(room.name);
    let swampCost = 5;
    let plainsCost = 1;
    if(this.memory.role === "carry" || this.memory.role === "filler") {
        swampCost = 1;
        plainsCost = 2;
    }
    const costMatrix = new PathFinder.CostMatrix();

    // Consider terrain walls (walls and border edges of the room) as impassable
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            let terrainHere = terrain.get(x, y)
            if (terrainHere === TERRAIN_MASK_WALL) {
                costMatrix.set(x, y, 255);
            }
            else if(terrainHere === TERRAIN_MASK_SWAMP) {
                costMatrix.set(x, y, swampCost);
            }
            else {
                costMatrix.set(x, y, plainsCost);
            }
        }
    }
    // Create a CostMatrix considering walls and terrain walls as impassable
    room.find(FIND_STRUCTURES).forEach((structure) => {
 if(structure.structureType === STRUCTURE_RAMPART && structure.my && structure.pos.lookFor(LOOK_STRUCTURES).length === 1) {
            costMatrix.set(structure.pos.x, structure.pos.y, 2);
        }

        else if (structure.structureType !== STRUCTURE_ROAD && structure.structureType !== STRUCTURE_CONTAINER) {
            // Set other structures' tiles to a higher cost to discourage the pathfinder from using them
            costMatrix.set(structure.pos.x, structure.pos.y, 255);
        }
        else if(structure.structureType === STRUCTURE_ROAD) {
            costMatrix.set(structure.pos.x, structure.pos.y, 1);
        }
    });



    // this CostMatrix is only valid for this room; without maxRooms PathFinder
    // paints the same walls onto neighbouring rooms and near-exit flees die
    const FleePath = PathFinder.search(this.pos, { pos: fleeTarget.pos, range: 7 }, { flee: true, maxRooms: 1, roomCallback: (roomName) => costMatrix });

    if(!FleePath.path || FleePath.path.length == 0) {
        return;
    }

    // Get the next position to move to
    const FirstPathGuy = FleePath.path[0];

    // Move to the next position
    this.move(this.pos.getDirectionTo(FirstPathGuy));
};


/**
 * ---------------------------------------------------------------------------
 * Shove permission.
 *
 * The old rule was "never shove a creep whose memory.moving is set", read as
 * "it is about to walk off that tile by itself". But `moving` means TRYING to
 * move, not succeeding, and in a head-on jam EVERY creep in the knot is
 * trying: nobody may shove anybody and the knot is permanent. Live shard3
 * E37N59 from tick 82,284,073, 250+ ticks on one diagonal road, which starved
 * the room's spawn:
 *
 *   builder @33,28 -> 34,29 | Filler @34,29 -> 33,28 | filler @35,30 -> 34,29
 *
 * all three "moving", none shovable, none able to vacate.
 *
 * So: a neighbour that is trying to move but has not changed tile for
 * STILL_SHOVABLE_AFTER ticks is blocked rather than in transit, and blocked
 * creeps may be shoved. RunCreepManager.preRun keeps that counter (memory
 * ._still) for every creep it runs; power creeps never get one, so they keep
 * the old, stricter treatment.
 * ---------------------------------------------------------------------------
 */
const STILL_SHOVABLE_AFTER = 2;

const canShove = (other:any):boolean => {
    if(!other || !other.my || !other.memory) {
        return false;
    }
    if(!other.memory.moving) {
        return true;
    }
    return (other.memory._still || 0) >= STILL_SHOVABLE_AFTER;
}

// make walk random direction if certain creep!
Creep.prototype.SwapPositionWithCreep = function SwapPositionWithCreep(direction) {
    if(direction == 1) {
        if(this.pos.y != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x, this.pos.y - 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }
            if(lookCreep.length > 0 && canShove(lookCreep[0])) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(5);
                }
                else {
                    if(lookCreep[0].move(1) !== 0) {
                        lookCreep[0].move(5);
                    }
                }
            }
        }

    }
    else if(direction == 2) {
        if(this.pos.x != 49 && this.pos.y != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x + 1, this.pos.y - 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }
            if(lookCreep.length > 0 && canShove(lookCreep[0])) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(6);
                }
                else {
                    if(lookCreep[0].move(2) !== 0) {
                        lookCreep[0].move(6);
                    }
                }
            }
        }

    }
    else if(direction == 3) {
        if(this.pos.x != 49) {
            let targetRoomPosition = new RoomPosition(this.pos.x + 1, this.pos.y, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }

            if(lookCreep.length > 0 && canShove(lookCreep[0])) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(7);
                }
                else {
                    if(lookCreep[0].move(3) !== 0) {
                        lookCreep[0].move(7);
                    }
                }
            }
        }
    }
    else if(direction == 4) {
        if(this.pos.x != 49 && this.pos.y != 49) {
            let targetRoomPosition = new RoomPosition(this.pos.x + 1, this.pos.y + 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }

            if(lookCreep.length > 0 && canShove(lookCreep[0])) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(8);
                }
                else {
                    if(lookCreep[0].move(4) !== 0) {
                        lookCreep[0].move(8);
                    }
                }
            }
        }

    }
    else if(direction == 5) {
        if(this.pos.y != 49) {
            let targetRoomPosition = new RoomPosition(this.pos.x, this.pos.y + 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }
            if(lookCreep.length > 0 && canShove(lookCreep[0])) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(1);
                }
                else {
                    if(lookCreep[0].move(5) !== 0) {
                        lookCreep[0].move(1);
                    }
                }
            }
        }

    }
    else if(direction == 6) {
        if(this.pos.y != 49 && this.pos.x != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x - 1, this.pos.y + 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }
            if(lookCreep.length > 0 && canShove(lookCreep[0])) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(2);
                }
                else {
                    if(lookCreep[0].move(6) !== 0) {
                        lookCreep[0].move(2);
                    }
                }
            }
        }

    }
    else if(direction == 7) {
        if(this.pos.x != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x - 1, this.pos.y, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }

            if(lookCreep.length > 0 && canShove(lookCreep[0])) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(3);
                }
                else {
                    if(lookCreep[0].move(7) !== 0) {
                        lookCreep[0].move(3);
                    }
                }
            }
        }

    }
    else if(direction == 8) {
        if(this.pos.x != 0 && this.pos.y != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x - 1, this.pos.y - 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }

            if(lookCreep.length > 0 && canShove(lookCreep[0])) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(4);
                }
                else {
                    if(lookCreep[0].move(8) !== 0) {
                        lookCreep[0].move(4);
                    }
                }
            }
        }

    }
}



/**
 * ---------------------------------------------------------------------------
 * PathFinder stall-breaker, shared by every move primitive below.
 *
 * Every one of those primitives has the same shape: re-run PathFinder whenever
 * the cached path is missing/exhausted/for another target, store path.path,
 * then step onto path.path[0]. When the search comes back with NO first step -
 * PathFinder answers with an empty path both for "no route exists" and for
 * "maxOps ran out before I found one" - the old code stored the empty array,
 * called this.move(undefined), and then re-ran the identical failing search on
 * every following tick. The creep never moves, never times out, never
 * complains: live E14S9/E11S5 had loaded fillers parked at range 2 from
 * half-empty extensions with memory.path = [] for 650+ ticks. filler.ts grew a
 * local advanceTo() around it; every other role (carry, builder, upgrader,
 * EnergyMiner, RampartDefender...) still walked straight into it.
 *
 * The recovery mirrors filler.ts advanceTo() so both behave the same:
 *   1. throw the useless path away instead of caching it,
 *   2. hand this tick's step to the engine's own moveTo(), which has neither
 *      the maxOps 1000 budget nor the maxRooms 1 leash,
 *   3. and if the creep is STILL on the same tile after ~8 such ticks it is
 *      wedged, not merely jammed (two creeps in a hub pocket blocking each
 *      other's only exit - both pathfinders answer "no route" and neither
 *      yields), so take one greedy step by hand onto whichever legal
 *      neighbouring tile is closest to the target, shoving whoever stands
 *      there. Free tiles win; if every exit is held the pick ROTATES on the
 *      stuck counter, because SwapPositionWithCreep only shoves a neighbour
 *      that has not already moved this tick and retrying the same neighbour
 *      forever is a guaranteed livelock.
 *
 * A path that came back INCOMPLETE but with steps in it is still used as
 * before: it walks the creep as close as the search got, which is progress and
 * costs nothing extra. Once the creep stands on that closest reachable tile the
 * next search returns empty and the recovery above takes over from there.
 *
 * The counter lives on its own memory keys (pfStuckAt/pfStuckFor) so that it
 * cannot interfere with the stuckAt/stuckFor pair filler.ts advanceTo() keeps -
 * advanceTo() calls these primitives, and a shared counter would be
 * double-incremented on every stuck tick.
 * ---------------------------------------------------------------------------
 */
const PF_WEDGED_AFTER = 8;

/** true when the search gave us no first step to take - the stall case. */
const pathHasNoStep = (path:any):boolean => {
    return !path || !path.path || path.path.length == 0;
}

/**
 * The goal position of a Move* primitive, whatever shape the caller passed.
 *
 * Every one of them builds its PathFinder goal as `{pos: target.pos}`, which is
 * right for a game object and silently UNDEFINED for a bare RoomPosition - and
 * PathFinder then throws inside its own _.map over the goals ("Cannot read
 * properties of undefined (reading 'x')" at toWorldPosition), which kills the
 * creep's whole tick, every tick. planSitter() returns a RoomPosition and
 * filler.ts hands it straight to MoveCostMatrixRoadPrio(): live E7S2 and W1N2
 * lost their fillers on every trip home for exactly this. movePathFallback()
 * has always accepted both shapes, so both shapes are the contract - the
 * search sites just never got the same treatment.
 *
 * Returns null when there is nothing pathable in `target` at all, so the caller
 * can decline the search instead of feeding PathFinder a hole.
 */
const goalPos = (creep:any, target:any):any => {
    let pos = (target && target.pos) ? target.pos : target;
    // some callers keep a target position in memory, where it survives as a
    // plain {x,y,roomName} object with none of RoomPosition's methods on it
    if(pos && typeof pos.x === "number" && typeof pos.y === "number") {
        if(typeof pos.getRangeTo !== "function") {
            pos = new RoomPosition(pos.x, pos.y, pos.roomName || creep.room.name);
        }
        return pos;
    }
    return null;
}

/** one greedy step towards targetPos through a legal neighbouring tile. */
const stepTowardsByHand = (creep:any, targetPos:any, rotation:number):void => {
    let terrain = creep.room.getTerrain();
    let free:any[] = [];
    let occupied:any[] = [];
    for(let dx = -1; dx <= 1; dx++) {
        for(let dy = -1; dy <= 1; dy++) {
            if(dx == 0 && dy == 0) continue;
            let x = creep.pos.x + dx;
            let y = creep.pos.y + dy;
            if(x < 1 || x > 48 || y < 1 || y > 48) continue;
            if(terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            let blocked = false;
            for(let structure of creep.room.lookForAt(LOOK_STRUCTURES, x, y)) {
                if((OBSTACLE_OBJECT_TYPES as any).indexOf(structure.structureType) !== -1) {
                    blocked = true;
                    break;
                }
            }
            // my obstacle sites are impassable; ignoring them retried into
            // the same tile forever (PathFinder already treats them as 255)
            if(!blocked) {
                for(let site of creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y)) {
                    if(site.my && (OBSTACLE_OBJECT_TYPES as any).indexOf(site.structureType) !== -1) {
                        blocked = true;
                        break;
                    }
                }
            }
            if(blocked) continue;
            let step:any = {pos: new RoomPosition(x, y, creep.room.name), range: targetPos.getRangeTo(x, y)};
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
        step = occupied[rotation % occupied.length];
    }
    if(step) {
        let direction = creep.pos.getDirectionTo(step.pos);
        creep.SwapPositionWithCreep(direction);
        creep.move(direction);
        creep.memory.moving = true;
    }
}

/**
 * Called INSTEAD of caching a path that has no first step. Drops the cache,
 * ticks the per-creep stuck counter (reset as soon as the creep is on a
 * different tile than last time it failed) and moves for this tick.
 */
const movePathFallback = (creep:any, target:any, range:number):void => {
    creep.memory.path = false;
    delete creep.memory.MoveTargetId;

    let here = creep.pos.x + "," + creep.pos.y;
    if(creep.memory.pfStuckAt === here) {
        creep.memory.pfStuckFor = (creep.memory.pfStuckFor || 0) + 1;
    }
    else {
        creep.memory.pfStuckAt = here;
        creep.memory.pfStuckFor = 0;
    }

    let targetPos = goalPos(creep, target);
    if(!targetPos) {
        return;
    }

    if(creep.memory.pfStuckFor >= PF_WEDGED_AFTER && targetPos.roomName === creep.room.name) {
        // a wedge the greedy step below does NOT clear is worth a line: creeps
        // walled in by their own hub (live E11S5 26,23 - eight neighbours of
        // extension/lab/spawn, whatever spawns into that pocket never leaves)
        // are invisible otherwise
        if(creep.memory.pfStuckFor >= 50 && creep.memory.pfStuckFor % 50 == 8) {
            console.log(creep.memory.role, creep.name, "wedged at", creep.pos.x + "," + creep.pos.y, "for", creep.memory.pfStuckFor, "ticks in", creep.room.name);
        }
        stepTowardsByHand(creep, targetPos, creep.memory.pfStuckFor);
        return;
    }

    // MUST be the NATIVE moveTo. creep.moveTo is soft-replaced by goTo (see
    // ~:1016), which routes straight back into the same cost matrix and the
    // same maxOps-1000 search that just failed - so this "escape hatch"
    // re-entered itself up to ~9 deep in a single tick (one level per
    // pfStuckFor increment until PF_WEDGED_AFTER fired), and the intended
    // cross-tick 8-tick hysteresis collapsed into one tick of 9 searches.
    _nativeMoveTo.call(creep, targetPos, {range: range, reusePath: 5});
    creep.memory.moving = true;
}

/**
 * ---------------------------------------------------------------------------
 * Cached path stepping (resyncCachedPath + stepCachedPath)
 *
 * Every Move* primitive walks memory.path by taking path[0], move()ing at it
 * and shift()ing it off. The shift was UNCONDITIONAL, and `move()` returns OK
 * for an intent that never happens - the tile is taken by another creep, the
 * shove failed, two creeps swapped into the same square. The head of the path
 * was then one tile ahead of where the creep actually stands, the drift guard
 * at the top of every one of these methods measured >1 next tick and threw the
 * WHOLE path away, and the creep paid another maxOps-1000 search. That is
 * exactly the situation a jam produces, for every creep in the jam, every
 * tick: the cost grows with the size of the jam.
 *
 * So: only advance on OK, remember the tile we aimed at, and put it back next
 * tick if the creep is not standing on it. Bounded by PATH_RETRY_MAX - if the
 * same step is blocked that many ticks running we stop restoring it and let
 * the drift guard repath, which is what routes around a parked creep.
 * ---------------------------------------------------------------------------
 */
const PATH_RETRY_MAX = 2;
/**
 * How long the tile a creep could not step onto keeps steering its repaths
 * away from itself. Long enough to outlive the repath that follows the last
 * retry, short enough that a creep parked for one tick is not written off.
 * RunCreepManager mirrors this constant for its sidestep; neither file exports
 * to the other.
 */
const BLOCKED_FRESH_FOR = 5;

/** Undo last tick's step bookkeeping when the step did not actually happen. */
const resyncCachedPath = (creep:any):void => {
    const step = creep.memory.pathStep;
    if(!step) {
        return;
    }
    const stepTick = creep.memory.pathStepT;
    delete creep.memory.pathStep;
    delete creep.memory.pathStepT;
    // we moved (or the record is stale): nothing to undo
    if(stepTick !== Game.time - 1 || (creep.pos.x === step.x && creep.pos.y === step.y)) {
        delete creep.memory.pathRetry;
        delete creep.memory._blockedBy;
        return;
    }
    const tries = (creep.memory.pathRetry || 0) + 1;
    if(tries > PATH_RETRY_MAX || !Array.isArray(creep.memory.path)) {
        delete creep.memory.pathRetry;
        // Out of retries: the drift guard is about to throw the path away and
        // search again - and with the blocker still standing there the search
        // hands back the SAME path through the SAME tile, which is how a jam
        // outlives every retry budget. Remember the tile so the next search
        // prices it out (see MoveCostMatrixRoadPrio).
        creep.memory._blockedBy = {x: step.x, y: step.y, t: Game.time};
        return;
    }
    creep.memory.pathRetry = tries;
    creep.memory.path.unshift(step);
}

/** The tile this creep just failed to enter, while that memory is fresh. */
const freshBlockedTile = (creep:any):any => {
    const blocked = creep.memory._blockedBy;
    if(!blocked) {
        return null;
    }
    if(blocked.t < Game.time - BLOCKED_FRESH_FOR) {
        delete creep.memory._blockedBy;
        return null;
    }
    return blocked;
}

/** Take one step along memory.path. Advances the path only on a real intent. */
const stepCachedPath = (creep:any):void => {
    const path = creep.memory.path;
    if(!path || path.length == 0) {
        return;
    }
    const pos = path[0];
    const direction = creep.pos.getDirectionTo(pos);
    if(creep.move(direction) === OK) {
        path.shift();
        creep.memory.pathStep = pos;
        creep.memory.pathStepT = Game.time;
    }
    creep.memory.moving = true;
}


type PacRoomCB = (roomName: string, role?: string|null) => boolean | CostMatrix;
let roomCallbackRoadPrio: PacRoomCB;
let roomCallbackRoadPrioFlee: PacRoomCB;
let roomCallbackIgnoreRoads: PacRoomCB;
let roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierFull: PacRoomCB;
let roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierEmpty: PacRoomCB;
let roomCallbackRoadPrioAvoidEnemyCreepsMuchRam: PacRoomCB;
let roomCallbackRoadPrioAvoidEnemyCreepsMuch: PacRoomCB;

Creep.prototype.MoveCostMatrixRoadPrio = function MoveCostMatrixRoadPrio(target, range, role) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        resyncCachedPath(this);
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        const pathRole = role || this.memory.role || null;
        const moveStyle = (this.memory.fleeing || (this.room.memory && this.room.memory.danger)) ? "flee" : "road";
        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != moveKeyOf(target, moveStyle)) {
            let costMatrix = roomCallbackRoadPrio;
            if(this.memory.fleeing || this.room.memory.danger) {
                costMatrix = roomCallbackRoadPrioFlee;
            }
            let targetPos = goalPos(this, target);
            if(!targetPos) {
                return;
            }
            // A repath that reproduces the path we are already stuck on is not
            // a repath. While the tile we could not enter is fresh, price it
            // out of THIS search - on a clone, so the per-tick matrix every
            // other creep in the room shares is left exactly as it was.
            const blocked = freshBlockedTile(this);
            const localRoom = this.room.name;
            let path = PathFinder.search(
                this.pos, {pos:targetPos, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => {
                        const base = costMatrix(roomName, pathRole);
                        if(!blocked || roomName !== localRoom || !base || base === true) {
                            return base;
                        }
                        const detour = (base as CostMatrix).clone();
                        detour.set(blocked.x, blocked.y, 255);
                        return detour;
                    }
                }
            );

            if(pathHasNoStep(path)) {
                movePathFallback(this, target, range);
                return;
            }

            let pos = path.path[0];
            let direction = this.pos.getDirectionTo(pos);
            this.SwapPositionWithCreep(direction);
            this.memory.path = path.path;
            this.memory.MoveTargetId = moveKeyOf(target, moveStyle);
        }

        stepCachedPath(this);
     }

}


/** id still in memory after the object died: getObjectById then isNearTo threw. */
function overlayObj(id:any):any {
    return id ? Game.getObjectById(id) : null;
}

/**
 * ---------------------------------------------------------------------------
 * Cost matrix memo
 *
 * Every builder below is a pure function of the room: a terrain loop over 2304
 * tiles, a FIND_STRUCTURES, a FIND_MY_CONSTRUCTION_SITES, a FIND_HOSTILE_CREEPS
 * (twice, in one of them), a FIND_MY_CREEPS and a 2500-tile border loop. None
 * of them looks at the creep that is pathing, and nothing in a Screeps tick can
 * move a creep or a structure while the tick is running, so the answer is the
 * same for every caller in the same room on the same tick — it was simply
 * rebuilt from scratch on every repath of every creep, which is exactly the
 * spike that shows up under danger (four AvoidEnemyCreepsMuch variants, a whole
 * fleet repathing at once).
 *
 * `getCachedCostMatrix` keys the result on room.cache (utils/RoomCache), which
 * is a fresh object every tick, and honours the same Memory.bench A/B switch
 * roomCallbackRoadPrio already used. Matrices handed to PathFinder are never
 * mutated, so one instance is safely shared; a builder that overlays PER-CALLER
 * data (roomCallbackRoadPrio, whose creep overlay depends on `role`) must
 * memoise only its static part and clone() before overlaying — see there.
 * ---------------------------------------------------------------------------
 */
const memoMatrix = (key: string, build: (roomName: string) => boolean | CostMatrix) => {
    return (roomName: string): boolean | CostMatrix => {
        return getCachedCostMatrix(roomName, key, () => build(roomName) as CostMatrix | false);
    };
};

/** true when nothing but road/container shares this rampart's tile. */
const rampartIsBare = (rampart:any):boolean => {
    for(const s of rampart.pos.lookFor(LOOK_STRUCTURES)) {
        if(s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER) {
            return false;
        }
    }
    return true;
}

/**
 * One creep overlay for both the cached clone and the first-build path.
 * Cheap vs full used to disagree (RRD 255 / builder-repair / else-7 / role).
 */
function overlayRoadPrioCreeps(costs: CostMatrix, room: Room, role: string|null): void {
    const list:any[] = cachedMyCreeps(room);
    // was: list.filter(...).forEach(...) — one throwaway array per repath per
    // creep, on a path that already runs once per creep that repaths
    for(let i = 0; i < list.length; i++) {
        const creep:any = list[i];
        if(creep.spawning) continue;
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 61);
        }
        else if(role !== "EnergyMiner" && creep.memory.role == "EnergyMiner") {
            const source:any = overlayObj(creep.memory.source);
            costs.set(creep.pos.x, creep.pos.y, (source && creep.pos.isNearTo(source)) ? 21 : 12);
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            const locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 26);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 60);
        }
        else if(creep.memory.role == "repair" && creep.memory.repairing) {
            costs.set(creep.pos.x, creep.pos.y, 60);
        }
        else if(creep.memory.role == "reserve") {
            costs.set(creep.pos.x, creep.pos.y, 25);
        }
        else if(creep.memory.role == "Convoy" && creep.memory.repairing) {
            costs.set(creep.pos.x, creep.pos.y, 41);
        }
        else if(creep.memory.role == "ram" || creep.memory.role == "signifer" || creep.name.startsWith("SquadCreep")) {
            costs.set(creep.pos.x, creep.pos.y, 100);
        }
        else if(creep.memory.role == "PowerMelee") {
            costs.set(creep.pos.x, creep.pos.y, 20);
        }
        else if(creep.memory.role == "PowerHeal") {
            costs.set(creep.pos.x, creep.pos.y, 14);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 10);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "CCK" && creep.room.name === creep.memory.targetRoom) {
            costs.set(creep.pos.x, creep.pos.y, 60);
        }
        else if(creep.memory.role == "CCKparty" && creep.room.name === creep.memory.homeRoom) {
            costs.set(creep.pos.x, creep.pos.y, 60);
        }
        else if(creep.memory.role == "filler" || creep.memory.role == "EnergyManager" || creep.memory.moving) {
            // leave default
        }
        else {
            costs.set(creep.pos.x, creep.pos.y, 7);
        }
    }
}

roomCallbackRoadPrio = (roomName: string, role:string|null=null): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // Rebuild once per tick per room (was: full terrain loop every pathfind — huge CPU)
    const cacheKey = "roadPrio";
    const useMatrixCache = !(Memory.bench && Memory.bench.opts && Memory.bench.opts.matrixCache === false);
    if (useMatrixCache && room.cache && room.cache.tick === Game.time && room.cache.costMatrices[cacheKey]) {
        const base = room.cache.costMatrices[cacheKey];
        const costs = base.clone();
        overlayRoadPrioCreeps(costs, room, role);
        return costs;
    }

    // terrain base is immutable and cached across ticks; border ring stays at
    // the matrix default (0 = engine terrain cost), as the original loop left it
    let costs = terrainBaseMatrix(roomName, 255, 25, 5, "inner");

    _.forEach(cachedStructures(room), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 3);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });

    cachedSites(room).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    // after roads: a hostile on a road used to be overwritten back to 3
    cachedHostileCreeps(room).forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 255);
    });

    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                costs.set(x, y, 255);
            }
        }
    }

    // seal first: cache used to store exit rows at 0 (cheaper than roads)
    if (useMatrixCache && room.cache && room.cache.tick === Game.time) {
        room.cache.costMatrices[cacheKey] = costs.clone();
    }

    overlayRoadPrioCreeps(costs, room, role);

    return costs;
}



Creep.prototype.MoveToSourceSafely = function MoveToSourceSafely(target, range) {
    if(!target || this.fatigue > 0) {
        return;
    }
    // rampart sit used to live inside getRangeTo(source)>range, so once
    // adjacent we aborted and never stepped onto the harvest rampart
    //
    // Every miner in a room under attack re-derived this from scratch every
    // tick: a filter over all my structures (a walled base has dozens of
    // ramparts), a findInRange over the result, and a lookFor per hit. Which
    // rampart covers a given source is a room/tick constant, so both halves
    // are memoised — the list for the room, the seat for the target.
    const myRamparts:any[] = cachedDerived(this.room, "myRamparts", () =>
        cachedMyStructures(this.room).filter((s:any) => s.structureType == STRUCTURE_RAMPART));
    if(myRamparts.length > 0 && target.pos) {
        const seatKey = "harvestSeat:" + (target.id || (target.pos.x + "," + target.pos.y));
        const seat:any = cachedDerived(this.room, seatKey, () => {
            let rampartsInRange = target.pos.findInRange(myRamparts, 1);
            for(let rampart of rampartsInRange) {
                let lookForLink = rampart.pos.lookFor(LOOK_STRUCTURES);
                let found = false;
                for(let building of lookForLink) {
                    if(building.structureType == STRUCTURE_LINK || building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_TOWER) {
                        found = true;
                    }
                }
                if(!found) {
                    return rampart;
                }
            }
            return null;
        });
        if(seat) {
            target = seat;
            range = 0;
        }
    }

    if(this.pos.getRangeTo(target) > range) {
        resyncCachedPath(this);
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != moveKeyOf(target, "safe")) {
            let costMatrix = roomCallbackRoadPrio;

            let targetPos = goalPos(this, target);
            if(!targetPos) {
                return;
            }
            let path = PathFinder.search(
                this.pos, {pos:targetPos, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => costMatrix(roomName)
                }
                );

            if(pathHasNoStep(path)) {
                movePathFallback(this, target, range);
                return;
            }

            let pos = path.path[0];
            let direction = this.pos.getDirectionTo(pos);

            this.SwapPositionWithCreep(direction);
            this.memory.path = path.path;
            this.memory.MoveTargetId = moveKeyOf(target, "safe");
        }

        stepCachedPath(this);
     }

}


const buildSafeToSource = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks; border ring stays at
    // the matrix default (0 = engine terrain cost), as the original loop left it
    let costs = terrainBaseMatrix(roomName, 255, 15, 3, "inner");

    const hostiles = cachedHostileCreeps(room);

    hostiles.forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 255);
    });

    _.forEach(cachedStructures(room), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 2);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });

    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });


    // same list as the 255 pass above — this used to be a second identical find
    let EnemyCreeps = hostiles;
    for(let eCreep of EnemyCreeps) {
        for(let i=-7; i<=7; i++) {
            for(let o=-7; o<=7; o++) {
                // upper y bound tests `+ o`, not the literal `+ 0`: CostMatrix.set is
                // unchecked (_bits[x*50+y]), so a y of 50..56 wrote onto column x+1.
                if(eCreep && eCreep.pos.x + i >= 1 && eCreep.pos.x + i <= 48 && eCreep.pos.y + o >= 1 && eCreep.pos.y + o <= 48) {
                    // plains here are 3 (5 is never written). `== 5` was dead, and
                    // the else wrote 24/25 over 255 walls. Band only raises cost.
                    let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                    if(current < 255) {
                        let inner = (i >= -4 && i <= 4) || (o >= -4 && o <= 4);
                        let plains = current == 3 || current == 5;
                        let band = inner ? (plains ? 125 : 25) : (plains ? 120 : 24);
                        if(current < band) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, band);
                        }
                    }
                }
            }
        }
    }



    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 6);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = overlayObj(creep.memory.source)
            if(source && creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 21);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 6);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 6);
        }
        else if(creep.memory.role == "repair" && creep.memory.repairing) {
            costs.set(creep.pos.x, creep.pos.y, 6);
        }
        else if(creep.memory.role == "ram") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "signifer") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "PowerMelee") {
            costs.set(creep.pos.x, creep.pos.y, 20);
        }
        else if(creep.memory.role == "PowerHeal") {
            costs.set(creep.pos.x, creep.pos.y, 14);
        }
        else if(creep.name.startsWith("SquadCreep")) {
            costs.set(creep.pos.x, creep.pos.y, 100);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 10);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                costs.set(x, y, 255);
            }
        }
    }




    return costs;
}

const roomCallbackSafeToSource = memoMatrix("safeToSource", buildSafeToSource);




/*
 * NOTE THE NAME. This function expression used to be called
 * `roomCallbackRoadPrioUpgraderInPosition` — the same name as the cost-matrix
 * arrow function further down the file. A named function expression binds its
 * own name inside its own scope, so `let costMatrix = roomCallbackRoadPrio-
 * UpgraderInPosition` below resolved to THIS METHOD, not the matrix builder:
 * PathFinder then called it as `costMatrix(roomName)`, i.e. with `this`
 * undefined and a string for `target`, and it threw on `this.fatigue` every
 * single time.
 *
 * Live for the whole measurement window, once per upgrader per move attempt:
 *   Error running creep Upgrader-29130-E2S7 (role upgrader): TypeError:
 *   Cannot read properties of undefined (reading 'fatigue')
 *     at roomCallbackRoadPrioUpgraderInPosition
 * 974 of them in a ten-minute capture across all three users — which is a large
 * part of why upgraders delivered so little even when they existed.
 */
Creep.prototype.roomCallbackRoadPrioUpgraderInPosition = function moveRoadPrioUpgraderInPosition(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        resyncCachedPath(this);
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != moveKeyOf(target, "upg")) {
            let costMatrix:any = buildRoadPrioUpgraderInPosition;

            let targetPos = goalPos(this, target);
            if(!targetPos) {
                return;
            }
            let path = PathFinder.search(
                this.pos, {pos:targetPos, range:range},
                {
                    // roomCallbackRoadPrioUpgraderInPosition paints the whole
                    // border 255, so rooms 2 and 3 can never be entered — they
                    // were pure overhead in every search.
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => costMatrix(roomName)
                }
                );

            if(pathHasNoStep(path)) {
                movePathFallback(this, target, range);
                return;
            }

            let pos = path.path[0];
            let direction = this.pos.getDirectionTo(pos);

            this.SwapPositionWithCreep(direction);
            this.memory.path = path.path;
            this.memory.MoveTargetId = moveKeyOf(target, "upg");
        }

        // stepCachedPath sets memory.moving: SwapPositionWithCreep only shoves
        // neighbours that are not moving, and without that flag an in-position
        // upgrader is shoved mid-step.
        stepCachedPath(this);
     }

}


const buildRoadPrioUpgraderInPosition = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks; border ring stays at
    // the matrix default (0 = engine terrain cost), as the original loop left it
    let costs = terrainBaseMatrix(roomName, 255, 50, 10, "inner");

    room.find(FIND_HOSTILE_CREEPS).forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 255);
    });




    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 60);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });

    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });


    // memory.Structures is absent in a room we only just gained vision of
    const ctrlLinkId = room.memory.Structures && room.memory.Structures.controllerLink;
    _.forEach(ctrlLinkId ? room.find(FIND_STRUCTURES, {filter: s => s.id == ctrlLinkId}) : [], function(struct:any) {
        for(let i = -1; i<=1; i++) {
            for(let o = -1; o<=1; o++) {
                if(struct.pos.x + i >= 0 && struct.pos.x + i <= 49 && struct.pos.y + o >= 0 && struct.pos.y + o <= 49 && costs.get(struct.pos.x + i, struct.pos.y + o) !== 255) {
                    costs.set(struct.pos.x + i, struct.pos.y + o, 1);
                }
            }
        }
    });


    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 30);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = overlayObj(creep.memory.source)
            if(source && creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 20);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 10);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "ram") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "signifer") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 10);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                costs.set(x, y, 255);
            }
        }
    }


    return costs;
}

const roomCallbackRoadPrioUpgraderInPosition = memoMatrix("upgraderInPos", buildRoadPrioUpgraderInPosition);




Creep.prototype.MoveCostMatrixSwampPrio = function MoveCostMatrixSwampPrio(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        resyncCachedPath(this);
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != moveKeyOf(target, "swamp")) {
            let targetPos = goalPos(this, target);
            if(!targetPos) {
                return;
            }
            let path = PathFinder.search(
                this.pos, {pos:targetPos, range:range},
                {
                    // the callback seals the border at 255, so extra rooms are
                    // unreachable by construction — searching them is waste
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => roomCallbackRoadPrio(roomName)
                }
                );

            if(pathHasNoStep(path)) {
                movePathFallback(this, target, range);
                return;
            }

            let pos = path.path[0];
            let direction = this.pos.getDirectionTo(pos);

            this.SwapPositionWithCreep(direction);

            this.memory.path = path.path;
            this.memory.MoveTargetId = moveKeyOf(target, "swamp");
        }

        stepCachedPath(this);
    }

}

const buildSwampPrio = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks; border ring stays at
    // the matrix default (0 = engine terrain cost), as the original loop left it
    let costs = terrainBaseMatrix(roomName, 255, 2, 1, "inner");



    room.find(FIND_HOSTILE_CREEPS).forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 255);
    });

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 2);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else {
            if(struct.structureType !== STRUCTURE_RAMPART) {
                costs.set(struct.pos.x, struct.pos.y, 255);
            }
        }
    });

    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });
    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 6);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = overlayObj(creep.memory.source)
            if(source && creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 11);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 10);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                costs.set(x, y, 255);
            }
        }
    }


    return costs;
}

const roomCallbackSwampPrio = memoMatrix("swampPrio", buildSwampPrio);


Creep.prototype.MoveCostMatrixIgnoreRoads = function MoveCostMatrixIgnoreRoads(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        resyncCachedPath(this);
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }
        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != moveKeyOf(target, "ignore")) {
            let targetPos = goalPos(this, target);
            if(!targetPos) {
                return;
            }
            let path = PathFinder.search(
                this.pos, {pos:targetPos, range:range},
                {
                    // the callback seals the border at 255, so extra rooms are
                    // unreachable by construction — searching them is waste
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => roomCallbackIgnoreRoads(roomName)
                }
                );

            if(pathHasNoStep(path)) {
                movePathFallback(this, target, range);
                return;
            }

            let pos = path.path[0];
            let direction = this.pos.getDirectionTo(pos);
            this.SwapPositionWithCreep(direction);
            this.memory.path = path.path;
            this.memory.MoveTargetId = moveKeyOf(target, "ignore");
        }

        stepCachedPath(this);
    }

}

const buildIgnoreRoads = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks; border ring stays at
    // the matrix default (0 = engine terrain cost), as the original loop left it
    let costs = terrainBaseMatrix(roomName, 255, 10, 2, "inner");




    room.find(FIND_HOSTILE_CREEPS).forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 255);
    });

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 3);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else {
            if(struct.structureType !== STRUCTURE_RAMPART) {
                costs.set(struct.pos.x, struct.pos.y, 255);
            }
        }
    });
    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 6);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = overlayObj(creep.memory.source)
            if(source && creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 11);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 11);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "repair" && creep.memory.repairing) {
            costs.set(creep.pos.x, creep.pos.y, 21);
        }
    });

    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                costs.set(x, y, 255);
            }
        }
    }

    return costs;
}

roomCallbackIgnoreRoads = memoMatrix("ignoreRoads", buildIgnoreRoads);

const buildRoadPrioFlee = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks; border ring stays at
    // the matrix default (0 = engine terrain cost), as the original loop left it
    let costs = terrainBaseMatrix(roomName, 255, 25, 5, "inner");

    room.find(FIND_HOSTILE_CREEPS).forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 255);
    });




    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 3);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });

    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 61);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = overlayObj(creep.memory.source)
            if(source && creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 21);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 26);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 60);
        }
        else if(creep.memory.role == "repair" && creep.memory.repairing) {
            costs.set(creep.pos.x, creep.pos.y, 60);
        }
        else if(creep.memory.role == "Convoy" && creep.memory.repairing) {
            costs.set(creep.pos.x, creep.pos.y, 41);
        }
        else if(creep.memory.role == "ram") {
            costs.set(creep.pos.x, creep.pos.y, 200);
        }
        else if(creep.memory.role == "signifer") {
            costs.set(creep.pos.x, creep.pos.y, 200);
        }
        else if(creep.memory.role == "PowerMelee") {
            costs.set(creep.pos.x, creep.pos.y, 20);
        }
        else if(creep.memory.role == "PowerHeal") {
            costs.set(creep.pos.x, creep.pos.y, 14);
        }
        else if(creep.name.startsWith("SquadCreep")) {
            costs.set(creep.pos.x, creep.pos.y, 100);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 10);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });

    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<=5; i++) {
                    for(let o=-5; o<=5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            // aura may only raise cost; writing 30 over 255 punched
                            // walkable holes through walls/buildings into the bunker
                            if(current < 255 && current < 30) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                            }
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<=3; i++) {
                    for(let o=-3; o<=3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            if(current < 255 && current < 30) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                            }
                        }
                    }
                }
            }

        }
        else{
            costs.set(eCreep.pos.x, eCreep.pos.y, 255);
        }
    }

    // seal exits even with zero hostiles; this used to live inside the
    // hostile loop, so a lingering memory.fleeing creep walked into the next room
    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                costs.set(x, y, 255);
            }
        }
    }

    return costs;
}

roomCallbackRoadPrioFlee = memoMatrix("roadPrioFlee", buildRoadPrioFlee);




Creep.prototype.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch = function MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        resyncCachedPath(this);
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }
        // roomName lives on .pos (or the RoomPosition itself); target.roomName
        // is undefined and forced a repath every tick during alarms
        let avoidStyle = "avoid";
        if(this.memory.role == "carry" && this.memory.full == true || this.memory.suicide == true || this.memory.role == "EnergyMiner") {
            avoidStyle = "avoid-full";
        }
        else if(this.memory.role == "carry" && this.memory.full == false) {
            avoidStyle = "avoid-empty";
        }
        else if(this.memory.role == "ram" || this.memory.role === "Solomon") {
            avoidStyle = "avoid-ram";
        }
        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != moveKeyOf(target, avoidStyle) || ((target.pos && target.pos.roomName) || target.roomName) !== this.room.name) {
            let costMatrix;
            if(avoidStyle == "avoid-full") {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierFull;
            }
            else if(avoidStyle == "avoid-empty") {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierEmpty;
            }
            else if(avoidStyle == "avoid-ram") {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuchRam;
            }
            else {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuch;
            }


            let targetPos = goalPos(this, target);
            if(!targetPos) {
                return;
            }
            let path = PathFinder.search(
                this.pos, {pos:targetPos, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => costMatrix(roomName)
                }
            );
            if(pathHasNoStep(path)) {
                movePathFallback(this, target, range);
                return;
            }
            let pos = path.path[0];
            let direction = this.pos.getDirectionTo(pos);
            this.SwapPositionWithCreep(direction);
            this.memory.path = path.path;
            this.memory.MoveTargetId = moveKeyOf(target, avoidStyle);
        }

        stepCachedPath(this);
     }

}

const buildAvoidEnemyCreepsMuchRam = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks — see terrainBaseMatrix
    let costs = terrainBaseMatrix(roomName, 254, 10, 2);

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });

    // terrain+structures first (was: aura then a full-room terrain overwrite
    // that erased every hostile cost). Aura only raises, never punches 255.
    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<=5; i++) {
                    for(let o=-5; o<=5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            if(current < 255 && current < 30) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                            }
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<=3; i++) {
                    for(let o=-3; o<=3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            if(current < 255 && current < 30) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                            }
                        }
                    }
                }
            }

        }
        else{
            costs.set(eCreep.pos.x, eCreep.pos.y, 255);
        }

    }



    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 5);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = overlayObj(creep.memory.source)
            if(source && creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 7);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    return costs;
}

roomCallbackRoadPrioAvoidEnemyCreepsMuchRam = memoMatrix("avoidMuchRam", buildAvoidEnemyCreepsMuchRam);

const buildAvoidEnemyCreepsMuch = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks — see terrainBaseMatrix
    let costs = terrainBaseMatrix(roomName, 255, 10, 2);

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });

    // terrain+structures first so the hostile aura is not wiped by the
    // full-room terrain loop. Aura only raises, never punches 255.
    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<=5; i++) {
                    for(let o=-5; o<=5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            if(current < 255 && current < 30) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                            }
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<=3; i++) {
                    for(let o=-3; o<=3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            if(current < 255 && current < 30) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                            }
                        }
                    }
                }
            }

        }
        else{
            costs.set(eCreep.pos.x, eCreep.pos.y, 255);
        }

    }



    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 5);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = overlayObj(creep.memory.source)
            if(source && creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 7);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "repair" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 12);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    return costs;
}

roomCallbackRoadPrioAvoidEnemyCreepsMuch = memoMatrix("avoidMuch", buildAvoidEnemyCreepsMuch);


const buildAvoidEnemyCreepsMuchForCarrierFull = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks — see terrainBaseMatrix
    let costs = terrainBaseMatrix(roomName, 255, 30, 10);

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && (struct.my || struct.isPublic)) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART) {
            // foreign private ramparts used to stay walkable → livelock on the shell
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });

    // terrain+structures first so the hostile aura is not wiped by the
    // full-room terrain loop. Aura only raises, never punches 255.
    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<=5; i++) {
                    for(let o=-5; o<=5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            if(current < 255 && current < 100) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 100);
                            }
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<=3; i++) {
                    for(let o=-3; o<=3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            if(current < 255 && current < 100) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 100);
                            }
                        }
                    }
                }
            }

        }
        else{
            let current = costs.get(eCreep.pos.x, eCreep.pos.y);
            if(current < 255 && current < 100) {
                costs.set(eCreep.pos.x, eCreep.pos.y, 100);
            }
        }

    }






    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 5);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = overlayObj(creep.memory.source)
            if(source && creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 7);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    return costs;
}

roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierFull = memoMatrix("avoidMuchFull", buildAvoidEnemyCreepsMuchForCarrierFull);

const buildAvoidEnemyCreepsMuchForCarrierEmpty = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks — see terrainBaseMatrix
    let costs = terrainBaseMatrix(roomName, 255, 2, 2);

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 3);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && (struct.my || struct.isPublic)) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART) {
            // foreign private ramparts used to stay walkable → livelock on the shell
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });


    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<=5; i++) {
                    for(let o=-5; o<=5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            if(current < 255 && current < 100) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 100);
                            }
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<=3; i++) {
                    for(let o=-3; o<=3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                            let current = costs.get(eCreep.pos.x + i, eCreep.pos.y + o);
                            if(current < 255 && current < 100) {
                                costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 100);
                            }
                        }
                    }
                }
            }

        }
        else{
            let current = costs.get(eCreep.pos.x, eCreep.pos.y);
            if(current < 255 && current < 100) {
                costs.set(eCreep.pos.x, eCreep.pos.y, 100);
            }
        }

    }



    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });
    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 5);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = overlayObj(creep.memory.source)
            if(source && creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 7);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = overlayObj(creep.memory.locked);
            if(locked && creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "RampartDefender" || creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    return costs;
}

roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierEmpty = memoMatrix("avoidMuchEmpty", buildAvoidEnemyCreepsMuchForCarrierEmpty);

let roomCallbackAvoidInvaders: (roomName: string) => boolean | CostMatrix;
let roomCallbackForRangedRampartDefender: (roomName: string) => boolean | CostMatrix;
let roomCallbackForRampartDefender: (roomName: string) => boolean | CostMatrix;

Creep.prototype.moveToSafePositionToRepairRampart = function moveToSafePositionToRepairRampart(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        resyncCachedPath(this);
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        const rampStyle = this.memory.role == "RampartDefender" ? "rd" : (this.memory.role === "RRD" ? "rrd" : "avoidinv");
        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != moveKeyOf(target, rampStyle)) {

            let costMatrix;
            if(this.memory.role == "RampartDefender") {
                costMatrix = roomCallbackForRampartDefender;
            }
            else if(this.memory.role === "RRD") {
                costMatrix = roomCallbackForRangedRampartDefender;
            }
            else {
                costMatrix = roomCallbackAvoidInvaders;
            }

            let targetPos = goalPos(this, target);
            if(!targetPos) {
                return;
            }
            let path = PathFinder.search(
                this.pos, {pos:targetPos, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => costMatrix(roomName)
                }
                );

            if(pathHasNoStep(path)) {
                movePathFallback(this, target, range);
                return;
            }

            let pos = path.path[0];
            let direction = this.pos.getDirectionTo(pos);

            this.SwapPositionWithCreep(direction);
            this.memory.path = path.path;
            this.memory.MoveTargetId = moveKeyOf(target, rampStyle);
        }

        stepCachedPath(this);
    }

}

const buildAvoidInvaders = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks — see terrainBaseMatrix
    let costs = terrainBaseMatrix(roomName, 255, 25, 5);
    let myCreeps = room.find(FIND_MY_CREEPS);
    for(let creep of myCreeps) {
        if(creep.memory.role === "SpecialCarry") {
            costs.set(creep.pos.x, creep.pos.y, 25)
        }
    }


    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            if(costs.get(struct.pos.x, struct.pos.y) !== 255) {
                costs.set(struct.pos.x, struct.pos.y, 5);
            }
        }
        else if(struct.structureType == STRUCTURE_RAMPART) {
            if(rampartIsBare(struct)) {
                costs.set(struct.pos.x, struct.pos.y, 4);
            }
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });

    let EnemyCreeps = cachedHostileCreeps(room);
    for(let eCreep of EnemyCreeps) {
        // `i<3` made this a 6x6 box hanging off the top-left of the hostile,
        // not the 7x7 every sibling matrix paints. And, like them, the aura
        // only ever raises a tile's cost.
        for(let i=-3; i<=3; i++) {
            for(let o=-3; o<=3; o++) {
                if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + o <= 49) {
                    if(costs.get(eCreep.pos.x + i, eCreep.pos.y + o) < 255) {
                        costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 255);
                    }
                }
            }
        }
    }



    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "RampartDefender") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 100);
        }
        else if (creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    // memory.Structures is absent in a room we only just gained vision of
    let storage:any = room.memory.Structures && Game.getObjectById(room.memory.Structures.storage);
    if(storage) {
        // E41N58 used to widen this band to 26/27; that room is not ours any
        // more, so every room gets the generic band.
        for(let i=-13; i<=13; i++) {
            for(let o=-13; o<=13; o++) {
                if(i<=-11 || i >= 11 || o <= -11 || o >= 11) {
                    if(storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + o <= 49) {
                        costs.set(storage.pos.x + i, storage.pos.y + o, 255);
                    }
                }
            }
        }
    }




    return costs;
}

roomCallbackAvoidInvaders = memoMatrix("avoidInvaders", buildAvoidInvaders);

const buildRangedRampartDefender = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks — see terrainBaseMatrix
    let costs = terrainBaseMatrix(roomName, 255, 25, 5);



    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {

        if(struct.structureType === STRUCTURE_ROAD){
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART) {
            // was: a `return` out of the _.forEach iteratee on the first
            // non-rampart on the tile, which set NOTHING — so a rampart with
            // anything at all under it (a road counted!) never became a 4, and
            // the shell RRD is supposed to man stayed at terrain cost.
            if(rampartIsBare(struct)) {
                costs.set(struct.pos.x, struct.pos.y, 4);
            }
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });



    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });
    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "RampartDefender") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 100);
        }
        else if (creep.memory.role == "RRD") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    room.find(FIND_HOSTILE_CREEPS).forEach(function(c) {
        // melee and small-RA used to be invisible; any armed hostile gets the aura
        if (c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0) {
            for (let dx = -3; dx <= 3; dx++) {
                for (let dy = -3; dy <= 3; dy++) {
                    if(c.pos.x + dx > 0 && c.pos.x + dx < 49 && c.pos.y + dy > 0 && c.pos.y + dy < 49) {
                        let cost = costs.get(c.pos.x + dx, c.pos.y + dy);
                        // `cost - 25 <= 255` is always true; 255+25 wraps to 24
                        // and RRD walks through walls in the 7x7
                        if(cost < 255) {
                            costs.set(c.pos.x + dx, c.pos.y + dy, Math.min(254, cost + 25));
                        }
                    }

                }
            }
        }
    });

    // import-free perimeter set: frame 255 on the shell itself blocked
    // RRD from manning legacy 8-13 ramparts (fell through to native moveTo)
    const shellKeys: {[k:string]: boolean} = {};
    const plan = room.memory.basePlan;
    const perimTiles = (plan && plan.perimeter) || (room.memory.defence && room.memory.defence.perimeter) || [];
    for(let t of perimTiles) {
        if(t) shellKeys[t.x + "," + t.y] = true;
    }
    const loc = room.memory.construction && room.memory.construction.rampartLocations;
    if(loc) {
        for(let p of loc) {
            if(!p) continue;
            const px = Array.isArray(p) ? p[0] : p.x;
            const py = Array.isArray(p) ? p[1] : p.y;
            shellKeys[px + "," + py] = true;
        }
    }

    let storage:any = room.memory.Structures && Game.getObjectById(room.memory.Structures.storage);
    if(storage) {
        const paintFrame = (band:number, iMax:number) => {
            for(let i=-iMax; i<=iMax; i++) {
                for(let o=-iMax; o<=iMax; o++) {
                    if(i<=-band || i >= band || o <= -band || o >= band) {
                        let x = storage.pos.x + i;
                        let y = storage.pos.y + o;
                        if(x < 0 || x > 49 || y < 0 || y > 49) continue;
                        // leave the actual shell walkable. Hostile aura raises
                        // bare ramparts from 4 to 29, so cost===4 missed them.
                        if(shellKeys[x + "," + y]) continue;
                        const structs = room.lookForAt(LOOK_STRUCTURES, x, y);
                        let hasRampart = false;
                        for(let s of structs) {
                            if(s.structureType === STRUCTURE_RAMPART) {
                                hasRampart = true;
                                break;
                            }
                        }
                        if(hasRampart) continue;
                        costs.set(x, y, 255);
                    }
                }
            }
        };
        // E41N58 used to widen this band to 26/27; that room is not ours any
        // more, so every room gets the generic band.
        paintFrame(11, 13);
    }





    return costs;
}


roomCallbackForRangedRampartDefender = memoMatrix("rrd", buildRangedRampartDefender);


const buildRampartDefender = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // terrain base is immutable and cached across ticks — see terrainBaseMatrix
    let costs = terrainBaseMatrix(roomName, 255, 25, 5);



    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            if(costs.get(struct.pos.x, struct.pos.y) !== 255) {
                costs.set(struct.pos.x, struct.pos.y, 3);
            }
        }
        else if(struct.structureType == STRUCTURE_RAMPART) {
            // same broken early-return as the RRD matrix had: nothing was set
            // for any rampart sharing its tile, road included
            if(rampartIsBare(struct)) {
                costs.set(struct.pos.x, struct.pos.y, 4);
            }
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });



    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    let storage = <StructureStorage> room.storage;
    if(storage) {
        // E41N58 used to widen this band to 26/27; that room is not ours any
        // more, so every room gets the generic band.
        for(let i=-13; i<=13; i++) {
            for(let o=-13; o<=13; o++) {
                if(i<=-11 || i >= 11 || o <= -11 || o >= 11) {
                    if(storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + o <= 49) {
                        costs.set(storage.pos.x + i, storage.pos.y + o, 255);
                    }
                }
            }
        }
    }





    return costs;
}

roomCallbackForRampartDefender = memoMatrix("rd", buildRampartDefender);

// CREEP PROTOTYPES


