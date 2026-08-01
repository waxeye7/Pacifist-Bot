interface Creep {
    Boost: () => boolean | "done";
    Speak: () => void;
    evacuate:any;
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
    roadlessLocation:(RoomPosition:object) => RoomPosition | null;
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
const RESERVE_FILL_TTL = 25;

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
 * Managers/RunCreepManager writes room.memory.badFill. This file cannot import
 * either of them — it has no imports on purpose, so that its top-level
 * `interface Creep` still merges with the global one — so it reads the two
 * memory shapes directly. Keep in sync with utils/Reachability.isUndeliverable.
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
    let list = room.memory.reserveFill;
    if(!Array.isArray(list)) {
        room.memory.reserveFill = [];
        return room.memory.reserveFill;
    }
    let kept:any[] = [];
    for(let entry of list) {
        // bare-id entries from before this change carry neither an owner nor a
        // timestamp, so there is no way to tell a live one from a leaked one
        if(!entry || typeof entry !== "object" || !entry.id || !entry.creep) continue;
        if(!Game.creeps[entry.creep]) continue;
        if(Game.time - (entry.t || 0) >= RESERVE_FILL_TTL) continue;
        kept.push(entry);
    }
    if(kept.length !== list.length) {
        room.memory.reserveFill = kept;
    }
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

// CREEP PROTOTYPES
Creep.prototype.findFillerTarget = function findFillerTarget(opts?:any):any {

    // speculative/look-ahead callers pass {reserve:false} and claim nothing
    let reserve = !(opts && opts.reserve === false);
    let reserveFill = reserveFillIdsOfOthers(this);


    if(this.memory.role == "ControllerLinkFiller" && (!this.room.memory.Structures.controllerLink || Game.time % 10000 == 0) && this.room.controller && this.room.controller.level >= 2) {
        if(this.room.controller && this.room.controller.level < 7) {
            let containers = this.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER && building.id !== this.room.memory.Structures.bin && building.id !== this.room.memory.Structures.storage && building.pos.getRangeTo(this.room.controller) == 3});
            if(containers.length > 0) {
                let controllerLink = this.room.controller.pos.findClosestByRange(containers);
                if(containers.length > 1) {
                    let sources = this.room.find(FIND_SOURCES);
                    if(controllerLink.pos.findInRange(sources, 1).length > 0) {
                        containers = containers.filter(function(con) {return con.id !== controllerLink.id;});
                        let newControllerLink = this.room.controller.pos.findClosestByRange(containers);
                        this.room.memory.Structures.controllerLink = newControllerLink.id;
                    }
                }
                else {
                    this.room.memory.Structures.controllerLink = controllerLink.id;
                }

            }
        }
        else {
            let links = this.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK && building.pos.getRangeTo(this.room.controller) <= 3});
            if(links.length > 0) {
                let controllerLink = this.room.controller.pos.findClosestByRange(links);
                if(controllerLink.pos.getRangeTo(this.room.controller) <= 4)  {
                    this.room.memory.Structures.controllerLink = controllerLink.id;
                }
            }
        }
    }

    if(this.memory.role == "ControllerLinkFiller" && this.room.controller && this.room.memory.Structures.controllerLink) {
        let controllerLink:any = Game.getObjectById(this.room.memory.Structures.controllerLink);
        if(controllerLink) {
            if(controllerLink.structureType == STRUCTURE_CONTAINER && controllerLink.store.getFreeCapacity() >= 200) {
                if(this.room.controller.level >= 7) {
                    this.room.memory.Structures.controllerLink = false;
                }
                else {
                    this.memory.t = controllerLink.id;
                    return controllerLink;
                }
            }
            else if(controllerLink.structureType == STRUCTURE_LINK && controllerLink.store[RESOURCE_ENERGY] <= 600) {
                this.memory.t = controllerLink.id;
                return controllerLink;
            }
        }
        else {
            this.room.memory.Structures.controllerLink = false;
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
    if(this.room.energyAvailable < this.room.energyCapacityAvailable) {

        let spawnAndExtensions = this.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && !reserveFill.includes(building.id) && !fillTargetIsDead(this.room, building.id)});
        if(spawnAndExtensions.length > 0) {
            let t = this.pos.findClosestByRange(spawnAndExtensions);
            if(reserve) {
                takeReserveFill(this, t.id);
            }
            this.memory.t = t.id;
            return t;
        }

    }


    let towers2 = this.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store.getFreeCapacity(RESOURCE_ENERGY) >= 100 && !reserveFill.includes(building.id) && !fillTargetIsDead(this.room, building.id))});
    if(towers2.length > 0) {
        let t = this.pos.findClosestByRange(towers2);
        if(reserve) {
            takeReserveFill(this, t.id);
        }
        this.memory.t = t.id;
        return t;
    }

    let storage = Game.getObjectById(this.memory.storage) || this.findStorage() || this.room.storage;
    if(this.room.memory.Structures.factory) {
        let factory:any = Game.getObjectById(this.room.memory.Structures.factory);
        if(factory && factory.store[RESOURCE_ENERGY] < 20000 && storage && storage.store[RESOURCE_ENERGY] > 450000 && storage.store[RESOURCE_BATTERY] < 200 && !reserveFill.includes(factory.id)) {
            if(reserve) {
                takeReserveFill(this, factory.id);
            }
            this.memory.t = factory.id;
            return factory;
        }
    }

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
        if(this.room.controller.level < 7) {
            let containers = this.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER && building.id !== this.room.memory.Structures.bin && building.id !== this.room.memory.Structures.storage && building.pos.getRangeTo(this.room.controller) == 3});
            if(containers.length > 0) {
                let controllerLink = this.room.controller.pos.findClosestByRange(containers);
                if(containers.length > 1) {
                    let sources = this.room.find(FIND_SOURCES);
                    if(controllerLink.pos.findInRange(sources, 1).length > 0) {
                        containers = containers.filter(function(con) {return con.id !== controllerLink.id;});
                        let newControllerLink = this.room.controller.pos.findClosestByRange(containers);
                        this.room.memory.Structures.controllerLink = newControllerLink.id;
                    }
                }
                else {
                    this.room.memory.Structures.controllerLink = controllerLink.id;
                }

            }
        }
        else {
            let links = this.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK && building.pos.getRangeTo(this.room.controller) <= 3});
            if(links.length > 0) {
                let controllerLink = this.room.controller.pos.findClosestByRange(links);
                if(controllerLink.pos.getRangeTo(this.room.controller) <= 4)  {
                    this.room.memory.Structures.controllerLink = controllerLink.id;
                }
            }
        }
    }

    if(this.memory.role == "filler" && this.room.energyAvailable == this.room.energyCapacityAvailable && this.room.controller && this.room.memory.Structures.controllerLink) {
        let controllerLink:any = Game.getObjectById(this.room.memory.Structures.controllerLink);
        if(controllerLink) {
            if(controllerLink.structureType == STRUCTURE_CONTAINER && controllerLink.store.getFreeCapacity() > 1800) {
                if(this.room.controller.level >= 7) {
                    this.room.memory.Structures.controllerLink = false;
                }
                else {
                    this.memory.t = controllerLink.id;
                    return controllerLink;
                }
            }
            else if(controllerLink.structureType == STRUCTURE_LINK && controllerLink.store[RESOURCE_ENERGY] <= 400) {
                this.memory.t = controllerLink.id;
                return controllerLink;
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

        if(this.memory.nukeTimer > 0) {

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

Creep.prototype.Boost = function Boost():any {

    if(this.memory.boostlabs.length == 0) {
        return;
    }
    else {
        let labs = [];
        for(let labID of this.memory.boostlabs) {
            labs.push(Game.getObjectById(labID));
        }
        let closestLab = this.pos.findClosestByRange(labs);
        if(closestLab.mineralAmount <  30) {
            if(this.ticksToLive < 1100 && this.getActiveBodyparts(CLAIM)===0) {
                let idToRemove = closestLab.id;
                this.memory.boostlabs = this.memory.boostlabs.filter(labid => labid !== idToRemove);
            }
            this.MoveCostMatrixRoadPrio(closestLab, 3);
        }
        else {
            if(this.pos.isNearTo(closestLab)) {
                let result = closestLab.boostCreep(this);
                if(result == 0) {
                    if(this.room.memory.labs.outputLab1 && this.room.memory.labs.outputLab1 == closestLab.id && this.room.memory.labs.status.boost.lab1?.use) {
                        this.room.memory.labs.status.boost.lab1.use -= 1;
                    }
                    else if(this.room.memory.labs.outputLab2 && this.room.memory.labs.outputLab2 == closestLab.id && this.room.memory.labs.status.boost.lab2?.use) {
                        this.room.memory.labs.status.boost.lab2.use -= 1;
                    }
                    else if(this.room.memory.labs.outputLab3 && this.room.memory.labs.outputLab3 == closestLab.id && this.room.memory.labs.status.boost.lab3?.use) {
                        this.room.memory.labs.status.boost.lab3.use -= 1;
                    }
                    else if(this.room.memory.labs.outputLab4 && this.room.memory.labs.outputLab4 == closestLab.id && this.room.memory.labs.status.boost.lab4?.use) {
                        this.room.memory.labs.status.boost.lab4.use -= 1;
                    }
                    else if(this.room.memory.labs.outputLab5 && this.room.memory.labs.outputLab5 == closestLab.id && this.room.memory.labs.status.boost.lab5?.use) {
                        this.room.memory.labs.status.boost.lab5.use -= 1;
                    }
                    else if(this.room.memory.labs.outputLab6 && this.room.memory.labs.outputLab6 == closestLab.id && this.room.memory.labs.status.boost.lab6?.use) {
                        this.room.memory.labs.status.boost.lab6.use -= 1;
                    }
                    else if(this.room.memory.labs.outputLab7 && this.room.memory.labs.outputLab7 == closestLab.id && this.room.memory.labs.status.boost.lab7?.use) {
                        this.room.memory.labs.status.boost.lab7.use -= 1;
                    }
                    else if(this.room.memory.labs.outputLab8 && this.room.memory.labs.outputLab8 == closestLab.id && this.room.memory.labs.status.boost.lab8?.use) {
                        this.room.memory.labs.status.boost.lab8.use -= 1;
                        if(this.room.memory.labs.status.boost.lab8.use ===0 && this.memory.role === "EnergyMiner") {
                            this.room.memory.labs.lab8reserved = false;
                        }
                    }

                    let idToRemove = closestLab.id;
                    this.memory.boostlabs = this.memory.boostlabs.filter(labid => labid !== idToRemove);
                    return true;
                }
                else {
                    console.log(result)
                }
            }

            else {
                this.MoveCostMatrixRoadPrio(closestLab, 1);
                return false;
            }
        }

    }
}



Creep.prototype.Speak = function Speak() {
    if(this.saying == "AB42") {
        this.say("BBB4", true);
        return;
    }
    else if(this.saying == "BBB4") {
        this.say("33472A", true);
        return;
    }
    else if(this.saying == "BB14") {
        this.say("BBB4", true);
        return;
    }
    else if(this.saying == "My") {
        this.say("Time", true);
        return;
    }
    else if(this.saying == "Time") {
        this.say("Has", true);
        return;
    }
    else if(this.saying == "Has") {
        this.say("Come", true);
        return;
    }
    else if(this.saying == "Come") {
        this.say("I", true);
        return;
    }
    else if(this.saying == "I") {
        this.say("Must", true);
        return;
    }
    else if(this.saying == "Must") {
        this.say("Suicide", true);
        return;
    }
    else if(this.saying == "Knock") {
        this.say("knock", true);
    }
    else if(this.saying == "knock") {
        let closest = this.pos.findClosestByRange(this.room.find(FIND_MY_CREEPS, {filter: creep => creep.pos.getRangeTo(this) > 0}));
        closest.say("Who's", true);
    }
    else if(this.saying == "Who's") {
        this.say("there?", true);
    }
    else if(this.saying == "there?") {
        let closest = this.pos.findClosestByRange(this.room.find(FIND_MY_CREEPS, {filter: creep => creep.pos.getRangeTo(this) > 0}));
        closest.say("Hatch", true);
    }
    else if(this.saying == "Hatch") {
        let closest = this.pos.findClosestByRange(this.room.find(FIND_MY_CREEPS, {filter: creep => creep.pos.getRangeTo(this) > 0}));
        closest.say("hatch who?", true);
    }
    else if(this.saying == "hatch who?") {
        let closest = this.pos.findClosestByRange(this.room.find(FIND_MY_CREEPS, {filter: creep => creep.pos.getRangeTo(this) > 0}));
        closest.say("Bless you!", true);
    }
    else if(this.saying == "I Could") {
        this.say("Use A", true);
    }
    else if(this.saying == "Use A") {
        this.say("Cigarette", true);
    }

    let randomNum = Math.floor(Math.random() * 17004);

    if(randomNum == 0) {
        this.say("AB42", true);
    }
    else if(randomNum == 1) {
        this.say("BB14", true);
    }
    else if(randomNum == 2 && this.memory.suicide) {
        this.say("My", true);
    }
    else if(randomNum == 3 && this.room.find(FIND_MY_CREEPS).length > 1) {
        this.say("Knock", true);
    }
    else if(randomNum == 4 && (this.memory.role == "upgrader" || this.memory.role == "repair")) {
        this.say("I Could", true);
    }

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
    let spawns = this.room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_SPAWN);}});
    if(spawns.length) {
        this.memory.spawn = spawns[0].id;
        return spawns[0]
    }
}


Creep.prototype.findStorage = function() {
    if(this.room.controller && this.room.controller.level >= 4) {
        let storage = this.room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE);}});
        if(storage.length) {
            this.memory.storage = storage[0].id;
            return storage[0];
        }
    }
    else if(this.room.controller && this.room.controller.level < 4 && this.room.controller.level != 0) {
        let spawn:any = Game.getObjectById(this.memory.spawn) || this.findSpawn();
        if(spawn && spawn.pos.y >= 2) {
            let storagePosition = new RoomPosition(spawn.pos.x, spawn.pos.y - 2, this.room.name);
            let storagePositionStructures = storagePosition.lookFor(LOOK_STRUCTURES);
            if(storagePositionStructures.length > 0) {
                for(let building of storagePositionStructures) {
                    if(building.structureType == STRUCTURE_CONTAINER) {
                        this.memory.storage = building.id;
                        return building;
                    }
                }
            }
        }
    }
}

Creep.prototype.findClosestLink = function() {
    let links = this.room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_LINK}});
    if(links.length) {
        let closestLink = this.pos.findClosestByRange(links);
        this.memory.closestLink = closestLink.id;
        return closestLink;
    }
}

Creep.prototype.findClosestLinkToStorage = function():any {
    let storage = Game.getObjectById(this.memory.storage) || this.findStorage();
    if(storage) {
        // hub link: legacy stamps sit at storage.x-2 (range 2), the v2
        // planner glues it to the storage (range 1). Take the closest link
        // within range 2 rather than one hardcoded offset.
        let links = this.room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_LINK && storage.pos.getRangeTo(s) <= 2});
        if(links.length > 0) {
            links.sort((a, b) => storage.pos.getRangeTo(a) - storage.pos.getRangeTo(b));
            this.memory.closestLink = links[0].id;
            return links[0];
        }
    }

}




Creep.prototype.withdrawStorage = function withdrawStorage(storage) {
    if(storage) {
        let StructureType = storage.structureType;
        let StorageEnergyStore = storage.store[RESOURCE_ENERGY];
        let Role = this.memory.role;
        if(StorageEnergyStore < 2000 && Role != "filler" && StructureType == STRUCTURE_STORAGE) {
            if(Game.time % 50 == 1) {
                console.log("Storage requires 2000 energy to withdraw. Try again later.", this.room.name)
            }
            this.acquireEnergyWithContainersAndOrDroppedEnergy();
            return;
        }
        else if(StorageEnergyStore < 300 && Role != "filler" && StructureType == STRUCTURE_CONTAINER) {
            if(Game.time % 50 == 0) {
                console.log("Container Storage requires 300 energy to withdraw. Try again later.", this.room.name)
            }
            this.acquireEnergyWithContainersAndOrDroppedEnergy();
            return;
        }
        else {
            if(this.pos.isNearTo(storage)) {
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
        if (opts.ignoreRoads || (opts.swampCost != null && opts.swampCost <= 2)) style = "ignoreRoads";
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
    this.goTo(first, {
        range: opts.range != null ? opts.range : 1,
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
        let hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS);
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
        if (this.room.controller && !this.room.controller.my && this.room.controller.level > 2 && this.room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType === STRUCTURE_TOWER}).length > 0 && !_.includes(Memory.AvoidRooms, this.room.name, 0)) {
            Memory.AvoidRooms.push(this.room.name);
        }

        else if (isValidRoomName(this.room.name) && (Game.time % 2 === 0 || this.hitsMax <= 4500)) {

            let strongholds = this.room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType === STRUCTURE_INVADER_CORE && s.level > 0});
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

    if (!this.memory.route || this.memory.route === -2 || this.memory.route && this.memory.route.length === 0 || (this.memory.route.length === 1 && this.memory.route[0].room === this.room.name) || (this.memory.route && this.memory.route.length > 0 && this.memory.route[this.memory.route.length - 1].room !== targetRoom)) {
        this.memory.route = Game.map.findRoute(this.room.name, targetRoom, {
            routeCallback(roomName, fromRoomName) {
                if (Game.map.getRoomStatus(roomName).status !== "normal") {
                    return Infinity;
                }
                if ((Memory.AvoidRooms && Memory.AvoidRooms.includes(roomName)) || (Memory.AvoidRoomsTemp && Memory.AvoidRoomsTemp[roomName]) && roomName !== targetRoom) {
                    return 24;
                }

                if (this && this.memory) {
                    if (roomName.length === 6) {
                        if (parseInt(roomName[1] + roomName[2]) % 10 === 0) {
                            return 2;
                        }
                        if (parseInt(roomName[4] + roomName[5]) % 10 === 0) {
                            return 2;
                        }
                        if (parseInt(roomName[1]) >= 4 && parseInt(roomName[1]) <= 6 && parseInt(roomName[2]) >= 4 && parseInt(roomName[2]) <= 6 && parseInt(roomName[4]) >= 4 && parseInt(roomName[4]) <= 6 && parseInt(roomName[5]) >= 4 && parseInt(roomName[5]) <= 6) {
                            return 24;
                        }
                    } else if (roomName.length === 4) {
                        if (parseInt(roomName[1]) >= 4 && parseInt(roomName[1]) <= 6 && parseInt(roomName[3]) >= 4 && parseInt(roomName[3]) <= 6) {
                            return 24;
                        }
                    } else if (roomName.length === 5) {
                        const numberPart = roomName.substring(1, 3);
                        const lastNumberPart = roomName.substring(3);

                        if ((parseInt(numberPart) >= 4 && parseInt(numberPart) <= 6) || (parseInt(lastNumberPart) >= 4 && parseInt(lastNumberPart) <= 6)) {
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
            delete this.memory.exit;
            this.memory._exitStuck = 0;
        }

        if(!this.memory.exit || this.memory.exit.roomName !== this.room.name) {
            const routeData = this.memory.route[0];

            const exitPositions = this.room.find(routeData.exit);
            const exitsWithoutWalls = exitPositions.filter(position => {
              const structuresAtExit = position.lookFor(LOOK_STRUCTURES);
              const creepsHere = position.lookFor(LOOK_CREEPS);
              // skip blocked by walls; prefer emptier tiles later
              return !structuresAtExit.some(structure => structure.structureType === STRUCTURE_WALL);
            });

            if (exitsWithoutWalls.length > 0) {
                // Spread creeps across exit tiles (was: all findClosestByPath + ignoreCreeps → border line)
                const hash = this.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                // score: prefer closer, prefer fewer creeps on tile, slight hash offset for diversity
                let best = null;
                let bestScore = Infinity;
                for (let i = 0; i < exitsWithoutWalls.length; i++) {
                    const p = exitsWithoutWalls[i];
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
                this.memory.exit = best || exitsWithoutWalls[hash % exitsWithoutWalls.length];
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
        if (home && home.controller && home.controller.my && home.controller.level < 3) {
            this.memory.targetRoom = this.memory.homeRoom;
            delete this.memory.exit;
            delete this.memory.route;
        }
    }
    if(this.memory.targetRoom && this.memory.targetRoom !== this.room.name) {
        return this.moveToRoomAvoidEnemyRooms(this.memory.targetRoom)
    }

    let storedSource:any = Game.getObjectById(this.memory.source);
    if (!storedSource || (!storedSource.pos.getOpenPositions().length && !this.pos.isNearTo(storedSource) && !this.memory.sourceId)) {
        delete this.memory.source;
        storedSource = this.findSource();
    }

    if(storedSource) {

        if(this.pos.isNearTo(storedSource) &&
        (this.memory.checkAmIOnRampart && this.memory.role == "EnergyMiner" ||
           this.memory.role !== "EnergyMiner" || this.memory.targetRoom !== this.memory.homeRoom)) {
            return this.harvest(storedSource);
        }
        else {
            if(this.room.memory.danger) {
                this.MoveToSourceSafely(storedSource, 1);

            }
            else {
                this.MoveCostMatrixRoadPrio(storedSource, 1, this.memory.role);
            }

            if(this.memory.danger) {
                let HostileCreeps = this.room.find(FIND_HOSTILE_CREEPS);
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
 * NOTE: this file is an ambient script (no import/export — the global
 * `interface Creep` augmentation above depends on that), so the feature
 * flag is read straight off Memory.features instead of utils/Features.
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

    // 1) Adjacent salvage first (instant tick, free profit, doesn't move us).
    //    Runs in both modes and does NOT disturb an existing lock.
    const adjDrop = this.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
        filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 0,
    });
    if (adjDrop.length) return take(adjDrop[0]);

    const adjRuin = this.pos.findInRange(FIND_RUINS, 1, {
        filter: (r) => r.store[RESOURCE_ENERGY] > 0,
    });
    if (adjRuin.length) return take(adjRuin[0]);

    const adjTomb = this.pos.findInRange(FIND_TOMBSTONES, 1, {
        filter: (t) => t.store[RESOURCE_ENERGY] > 0,
    });
    if (adjTomb.length) return take(adjTomb[0]);

    // 2) Locked fast path — no scanning at all while the lock holds.
    if (locking && prevId) {
        const locked: any = Game.getObjectById(prevId);
        const expired = Game.time - (prevLock.t || 0) > PICKUP_LOCK_TTL;
        // Hysteresis: keep threshold is half the select threshold so a pile
        // shrinking a little doesn't bounce us straight back off it.
        // A queued lock (picked when everything was reserved) only needs the
        // pile to still exist — it never had a reservation to lose.
        const keepMin = Math.min(25, free / 2);
        const worthIt = prevLock.q
            ? _pickupEnergyOf(locked) > 0
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
    const selectMin = Math.min(25, free);
    /** strict = respect other creeps' reservations. */
    const hasRoom = (o: any, strict: boolean) =>
        !locking || !strict || unreserved(o) >= selectMin;
    const takeable = (o: any) =>
        locking ? Math.min(free, unreserved(o)) : Math.min(free, _pickupEnergyOf(o));

    const pick = (strict: boolean): any => {
        const ruins = room.find(FIND_RUINS, {
            filter: (r) => r.store[RESOURCE_ENERGY] > 0 && hasRoom(r, strict),
        });
        if (ruins.length) {
            if (!locking) ruins.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            return this.pos.findClosestByRange(ruins) || ruins[0];
        }

        const tombs = room.find(FIND_TOMBSTONES, {
            filter: (t) => t.store[RESOURCE_ENERGY] > 0 && hasRoom(t, strict),
        });
        if (tombs.length) {
            if (!locking) tombs.sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
            return this.pos.findClosestByRange(tombs) || tombs[0];
        }

        // Nearby drops first (range 12, amount worth walking), then any pile
        let drops = room.find(FIND_DROPPED_RESOURCES, {
            filter: (r) =>
                r.resourceType === RESOURCE_ENERGY &&
                r.amount >= 25 &&
                this.pos.getRangeTo(r) <= 12 &&
                hasRoom(r, strict),
        });
        if (!drops.length) {
            drops = room.find(FIND_DROPPED_RESOURCES, {
                filter: (r) =>
                    r.resourceType === RESOURCE_ENERGY && r.amount > 0 && hasRoom(r, strict),
            });
        }
        if (drops.length) {
            if (!locking) drops.sort((a, b) => b.amount - a.amount);
            return this.pos.findClosestByRange(drops) || drops[0];
        }

        // Containers
        let container: any =
            Game.getObjectById(room.memory.Structures.container) || room.findContainers(free);
        if (container && (container.store[RESOURCE_ENERGY] <= 0 || !hasRoom(container, strict))) {
            container = room.findContainers(1);
        }
        if (container && container.store[RESOURCE_ENERGY] > 0 && hasRoom(container, strict)) {
            return container;
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

Creep.prototype.roadlessLocation = function roadlessLocation(repairTarget) {
    let nearbyBlocks = this.pos.getNearbyPositions()
    let blockFound = [];
    _.forEach(nearbyBlocks, function(block) {
        if(block.getRangeTo(repairTarget) == 3) {
            let structures = block.lookFor(LOOK_STRUCTURES);
            let creeps = block.lookFor(LOOK_CREEPS);
            if(structures.length == 0 && creeps.length == 0) {
                blockFound.push(block);
                return;
            }
        }
    });
    if(blockFound.length > 0) {
        let closestBlock = 100;
        let currentClosest = null;
        if(this.room.memory.Structures && this.room.memory.Structures.storage) {
            let storage = Game.getObjectById(this.memory.storage) || this.findStorage();
            for(let block of blockFound) {
                let range = block.getRangeTo(storage);
                if(range < closestBlock) {
                    currentClosest = block;
                    closestBlock = range;
                }
            }
            return currentClosest;
        }
        else {
            return blockFound[0];
        }
    }
    else if(blockFound.length == 0 && !this.room.memory.danger) {
        let found;
        _.forEach(nearbyBlocks, function(block) {
            if(block.getRangeTo(repairTarget) <= 3) {
                let structures = block.lookFor(LOOK_STRUCTURES);
                let creeps = block.lookFor(LOOK_CREEPS);
                if(structures.length == 0 && creeps.length == 0) {
                    found = block;
                    return;
                }
            }
        });
        if(found != false) {
            return blockFound;
        }
    }


    return null;
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
        let droppedResources = this.room.find(FIND_DROPPED_RESOURCES);
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


Creep.prototype.recycle = function recycle() {
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
                if(!this.memory.spawnedSweeper && this.room.find(FIND_MY_CREEPS, {filter: c => c.memory.role === 'sweeper'}).length < 1) {
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
                    let spawnPosition = new RoomPosition(this.pos.x, this.pos.y + 1, this.room.name);
                    let StructuresOnSpawnLocation = spawnPosition.lookFor(LOOK_STRUCTURES);
                    if(StructuresOnSpawnLocation.length > 0) {
                        for(let building of StructuresOnSpawnLocation) {
                            if(building.structureType == STRUCTURE_SPAWN) {
                                let spawn:any = building;
                                if(spawn) {
                                    spawn.recycleCreep(this)

                                }
                            }
                        }
                    }
                    else {
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



    // Use PathFinder with the custom cost matrix and flee set to true
    const FleePath = PathFinder.search(this.pos, { pos: fleeTarget.pos, range: 5 }, { flee: true, roomCallback: (roomName) => costMatrix });

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



    // Use PathFinder with the custom cost matrix and flee set to true
    const FleePath = PathFinder.search(this.pos, { pos: fleeTarget.pos, range: 7 }, { flee: true, roomCallback: (roomName) => costMatrix });

    // Get the next position to move to
    const FirstPathGuy = FleePath.path[0];

    // Move to the next position
    this.move(this.pos.getDirectionTo(FirstPathGuy));
};


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
            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
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
            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
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

            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
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

            if(lookCreep.length > 0 && lookCreep[0].my && lookCreep[0] && !lookCreep[0].memory.moving) {
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
            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
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
            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
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

            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
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

            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
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

    let targetPos = (target && target.pos) ? target.pos : target;
    // some callers keep a target position in memory, where it survives as a
    // plain {x,y,roomName} object with none of RoomPosition's methods on it
    if(targetPos && typeof targetPos.getRangeTo !== "function" && typeof targetPos.x === "number") {
        targetPos = new RoomPosition(targetPos.x, targetPos.y, targetPos.roomName || creep.room.name);
    }

    if(creep.memory.pfStuckFor >= PF_WEDGED_AFTER && targetPos && targetPos.roomName === creep.room.name) {
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

    creep.moveTo(targetPos || target, {range: range, reusePath: 5});
    creep.memory.moving = true;
}


Creep.prototype.MoveCostMatrixRoadPrio = function MoveCostMatrixRoadPrio(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != target.id) {
            let costMatrix = roomCallbackRoadPrio;
            if(this.memory.fleeing || this.room.memory.danger) {
                costMatrix = roomCallbackRoadPrioFlee;
            }
            let path = PathFinder.search(
                this.pos, {pos:target.pos, range:range},
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
            this.memory.MoveTargetId = target.id;
        }

        let pos = this.memory.path[0];
        let direction = this.pos.getDirectionTo(pos);
        this.move(direction);
        this.memory.moving = true;
        this.memory.path.shift();
     }

}


const roomCallbackRoadPrio = (roomName: string, role:string|null=null): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    // Rebuild once per tick per room (was: full terrain loop every pathfind — huge CPU)
    const cacheKey = "roadPrio";
    const useMatrixCache = !(Memory.bench && Memory.bench.opts && Memory.bench.opts.matrixCache === false);
    if (useMatrixCache && room.cache && room.cache.tick === Game.time && room.cache.costMatrices[cacheKey]) {
        // clone not needed if we only set dynamic creep costs on a copy — PathFinder may mutate? docs say don't reuse if mutated. We only read after build; creeps change each call so bake creeps into matrix each search is correct...
        // Cache BASE terrain+structures once; overlay my creeps cheaply on a clone.
        const base = room.cache.costMatrices[cacheKey];
        const costs = base.clone();
        const myCreepsNotSpawning = (room.cache.myCreeps || room.find(FIND_MY_CREEPS)).filter((c) => !c.spawning);
        myCreepsNotSpawning.forEach(function(creep) {
            if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 61);
            }
            else if(role !== "EnergyMiner" && creep.memory.role == "EnergyMiner") {
                costs.set(creep.pos.x, creep.pos.y, 12);
            }
            else if(creep.memory.role == "filler" || creep.memory.role == "EnergyManager" || creep.memory.moving) {
                // leave default
            }
            else {
                costs.set(creep.pos.x, creep.pos.y, 7);
            }
        });
        return costs;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 1; y <= 48; y++) {
        for(let x = 1; x <= 48; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 25;
            }
            else if(tile == 0){
                weight = 5;
            }
            costs.set(x, y, weight);
        }
    }

    (room.cache && room.cache.hostileCreeps ? room.cache.hostileCreeps : room.find(FIND_HOSTILE_CREEPS)).forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 255);
    });




    _.forEach((room.cache && room.cache.structures) ? room.cache.structures : room.find(FIND_STRUCTURES), function(struct:any) {
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

    // store base (terrain+structures+hostiles) without my-creep overlay
    if (useMatrixCache && room.cache && room.cache.tick === Game.time) {
        room.cache.costMatrices[cacheKey] = costs.clone();
    }

    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 61);
        }
        else if(role !== "EnergyMiner" && creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 21);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
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
        else if(creep.memory.role == "ram") {
            costs.set(creep.pos.x, creep.pos.y, 100);
        }
        else if(creep.memory.role == "signifer") {
            costs.set(creep.pos.x, creep.pos.y, 100);
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
        else if(creep.memory.role == "RampartDefender") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "CCK" && creep.room.name === creep.memory.targetRoom) {
            costs.set(creep.pos.x, creep.pos.y, 60);
        }
        else if(creep.memory.role == "CCKparty" && creep.room.name === creep.memory.homeRoom) {
            costs.set(creep.pos.x, creep.pos.y, 60);
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



Creep.prototype.MoveToSourceSafely = function MoveToSourceSafely(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        let myRamparts = this.room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_RAMPART});
        if(myRamparts.length > 0) {
            let rampartsInRange = target.pos.findInRange(myRamparts, 1);

            if(rampartsInRange.length > 0) {
                for(let rampart of rampartsInRange) {
                    let lookForLink = rampart.pos.lookFor(LOOK_STRUCTURES);
                    let found = false;
                    for(let building of lookForLink) {
                        if(building.structureType == STRUCTURE_LINK || building.structureType == STRUCTURE_EXTENSION || building.structureType == STRUCTURE_TOWER) {
                            found = true;
                        }
                    }
                    if(!found) {
                        target = rampart;
                        range = 0;
                        break;
                    }
                }
            }
        }

        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != target.id) {
            let costMatrix = roomCallbackSafeToSource;

            let path = PathFinder.search(
                this.pos, {pos:target.pos, range:range},
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
            this.memory.MoveTargetId = target.id;
        }



        let pos = this.memory.path[0];
        let direction = this.pos.getDirectionTo(pos);

        this.move(direction);
        this.memory.moving = true;
        this.memory.path.shift();
     }

}


const roomCallbackSafeToSource = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 15;
            }
            else if(tile == 0){
                weight = 3;
            }
            costs.set(x, y, weight);
        }
    }

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



    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        for(let i=-7; i<=7; i++) {
            for(let o=-7; o<=7; o++) {
                if(eCreep && eCreep.pos.x + i >= 1 && eCreep.pos.x + i <= 48 && eCreep.pos.y + o >= 1 && eCreep.pos.y + 0 <= 48) {
                    if((i >= -4 && i <= 4) || (o >= -4 && o <= 4)) {
                        if(costs.get(eCreep.pos.x + i, eCreep.pos.y + o) == 5) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 125);
                        }
                        else {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 25);
                        }
                    }
                    else {
                        if(costs.get(eCreep.pos.x + i, eCreep.pos.y + o) == 5) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 120);
                        }
                        else {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 24);
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
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 21);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
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
        else if(creep.memory.role == "RampartDefender") {
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





Creep.prototype.roomCallbackRoadPrioUpgraderInPosition = function roomCallbackRoadPrioUpgraderInPosition(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != target.id) {
            let costMatrix:any = roomCallbackRoadPrioUpgraderInPosition;

            let path = PathFinder.search(
                this.pos, {pos:target.pos, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 3,
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
            this.memory.MoveTargetId = target.id;
        }



        let pos = this.memory.path[0];
        let direction = this.pos.getDirectionTo(pos);

        this.move(direction);
        // this.memory.moving = true;
        this.memory.path.shift();
        // this.moveByPath(this.memory.path);
     }

}


const roomCallbackRoadPrioUpgraderInPosition = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 50;
            }
            else if(tile == 0){
                weight = 10;
            }
            costs.set(x, y, weight);
        }
    }

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


    _.forEach(room.find(FIND_STRUCTURES, {filter: s => s.id == room.memory.Structures.controllerLink}), function(struct:any) {
        for(let i = -1; i<=1; i++) {
            for(let o = -1; o<=1; o++) {
                if(costs.get(struct.pos.i, struct.pos.o) !== 255) {
                    costs.set(struct.pos.i, struct.pos.o, 1);
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
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 20);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
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
        else if(creep.memory.role == "RampartDefender") {
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





Creep.prototype.MoveCostMatrixSwampPrio = function MoveCostMatrixSwampPrio(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {

        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != target.id) {
            let path = PathFinder.search(
                this.pos, {pos:target.pos, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 3,
                    roomCallback: (roomName) => roomCallbackSwampPrio(roomName)
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
            this.memory.MoveTargetId = target.id;
        }



        let pos = this.memory.path[0];
        let direction = this.pos.getDirectionTo(pos);

        this.move(direction);
        this.memory.moving = true;
        this.memory.path.shift();
    }

}

const roomCallbackSwampPrio = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 2;
            }
            else if(tile == 0){
                weight = 1;
            }
            costs.set(x, y, weight);
        }
    }



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
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 11);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 10);
        }
        else if(creep.memory.role == "RampartDefender") {
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


Creep.prototype.MoveCostMatrixIgnoreRoads = function MoveCostMatrixIgnoreRoads(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {

        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }
        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != target.id) {
            let path = PathFinder.search(
                this.pos, {pos:target.pos, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 3,
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
            this.memory.MoveTargetId = target.id;
        }


        let pos = this.memory.path[0];
        let direction = this.pos.getDirectionTo(pos);
        this.move(direction);
        this.memory.moving = true;
        this.memory.path.shift();
    }

}

const roomCallbackIgnoreRoads = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 10;
            }
            else if(tile == 0){
                weight = 2;
            }
            costs.set(x, y, weight);
        }
    }




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
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 11);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "SpecialRepair") {
            costs.set(creep.pos.x, creep.pos.y, 11);
        }
        else if(creep.memory.role == "RampartDefender") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "RRD") {
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

const roomCallbackRoadPrioFlee = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 25;
            }
            else if(tile == 0){
                weight = 5;
            }
            costs.set(x, y, weight);
        }
    }

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
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 21);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
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
        else if(creep.memory.role == "RampartDefender") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });

    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<5; i++) {
                    for(let o=-5; o<5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<3; i++) {
                    for(let o=-3; o<3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                        }
                    }
                }
            }

        }
        else{
            costs.set(eCreep.pos.x, eCreep.pos.y, 255);
        }


    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                costs.set(x, y, 255);
            }
        }
    }

    }
    return costs;
}





Creep.prototype.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch = function MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }
        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != target.id || target.roomName !== this.room.name) {
            let costMatrix;
            if(this.memory.role == "carry" && this.memory.full == true || this.memory.suicide == true || this.memory.role == "EnergyMiner") {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierFull;
            }
            else if(this.memory.role == "carry" && this.memory.full == false) {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierEmpty;
            }
            else if(this.memory.role == "ram" || this.memory.role === "Solomon") {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuchRam;
            }
            else {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuch;
            }


            let path = PathFinder.search(
                this.pos, {pos:target, range:range},
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
            this.memory.MoveTargetId = target.id;
        }


        let pos = this.memory.path[0];
        let direction = this.pos.getDirectionTo(pos);
        this.move(direction);
        this.memory.moving = true;
        this.memory.path.shift();
        // this.moveByPath(this.memory.path);
     }

}

const roomCallbackRoadPrioAvoidEnemyCreepsMuchRam = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<5; i++) {
                    for(let o=-5; o<5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<3; i++) {
                    for(let o=-3; o<3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                        }
                    }
                }
            }

        }
        else{
            costs.set(eCreep.pos.x, eCreep.pos.y, 255);
        }

    }

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 254
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 10;
            }
            else if(tile == 0){
                weight = 2;
            }
            costs.set(x, y, weight);
        }
    }

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
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 7);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "RampartDefender") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    return costs;
}

const roomCallbackRoadPrioAvoidEnemyCreepsMuch = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<5; i++) {
                    for(let o=-5; o<5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<3; i++) {
                    for(let o=-3; o<3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 30);
                        }
                    }
                }
            }

        }
        else{
            costs.set(eCreep.pos.x, eCreep.pos.y, 255);
        }

    }

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 10;
            }
            else if(tile == 0){
                weight = 2;
            }
            costs.set(x, y, weight);
        }
    }

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
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 7);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "repair" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 12);
        }
        else if(creep.memory.role == "RampartDefender") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    return costs;
}


const roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierFull = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;


    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<5; i++) {
                    for(let o=-5; o<5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 100);
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<3; i++) {
                    for(let o=-3; o<3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 100);
                        }
                    }
                }
            }

        }
        else{
            costs.set(eCreep.pos.x, eCreep.pos.y, 100);
        }

    }

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 30;
            }
            else if(tile == 0){
                weight = 10;
            }
            costs.set(x, y, weight);
        }
    }

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER || struct.structureType == STRUCTURE_RAMPART) {
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
            costs.set(creep.pos.x, creep.pos.y, 5);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 7);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "RampartDefender") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    return costs;
}

const roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierEmpty = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 2;
            }
            else if(tile == 0){
                weight = 2;
            }
            costs.set(x, y, weight);
        }
    }

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 3);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER || struct.structureType == STRUCTURE_RAMPART) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });


    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<5; i++) {
                    for(let o=-5; o<5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 100);
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<3; i++) {
                    for(let o=-3; o<3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 100);
                        }
                    }
                }
            }

        }
        else{
            costs.set(eCreep.pos.x, eCreep.pos.y, 100);
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
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 7);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "RampartDefender") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
    });


    return costs;
}


Creep.prototype.moveToSafePositionToRepairRampart = function moveToSafePositionToRepairRampart(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != target.id) {

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

            let path = PathFinder.search(
                this.pos, {pos:target.pos, range:range},
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
            this.memory.MoveTargetId = target.id;
        }



        let pos = this.memory.path[0];
        let direction = this.pos.getDirectionTo(pos);

        this.move(direction);
        this.memory.moving = true;
        this.memory.path.shift();
    }

}

const roomCallbackAvoidInvaders = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 25;
            }
            else if(tile == 0){
                weight = 5;
            }
            costs.set(x, y, weight);
        }
    }
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
            let lookForBuildingsHere = struct.pos.lookFor(LOOK_STRUCTURES);
            if(lookForBuildingsHere.length > 1) {
                let found = false;
                for(let building of lookForBuildingsHere) {
                    if(building.structureType !== STRUCTURE_RAMPART && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTAINER) {
                        found = true;
                    }
                }
                if(!found) {
                    costs.set(struct.pos.x, struct.pos.y, 4);
                }
            }
            else {
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

    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        for(let i=-3; i<3; i++) {
            for(let o=-3; o<3; o++) {
                if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                    costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 255);
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

    let storage:any = Game.getObjectById(Game.rooms[roomName].memory.Structures.storage);
    if(storage) {
        if(room.name === "E41N58") {
            for(let i=-27; i<=27; i++) {
                for(let o=-27; o<=27; o++) {
                    if(i<=-26 || i >= 26 || o <= -26 || o >= 26) {
                        if(storage && storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + 0 <= 49) {
                            costs.set(storage.pos.x + i, storage.pos.y + o, 255);
                        }
                    }
                }
            }
        }
        else {
            for(let i=-13; i<=13; i++) {
                for(let o=-13; o<=13; o++) {
                    if(i<=-11 || i >= 11 || o <= -11 || o >= 11) {
                        if(storage && storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + 0 <= 49) {
                            costs.set(storage.pos.x + i, storage.pos.y + o, 255);
                        }
                    }
                }
            }
        }

    }




    return costs;
}

const roomCallbackForRangedRampartDefender = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 25;
            }
            else if(tile == 0){
                weight = 5;
            }
            costs.set(x, y, weight);
        }
    }



    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {

        if(struct.structureType === STRUCTURE_ROAD){
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART) {
            let lookForBuildingsHere = struct.pos.lookFor(LOOK_STRUCTURES);
            if(lookForBuildingsHere.length > 1) {
                for(let building of lookForBuildingsHere) {
                    if(building.structureType !== STRUCTURE_RAMPART) {
                        return;
                    }
                }
            }
            else {
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
        if (c.getActiveBodyparts(RANGED_ATTACK) > 15) {
            for (let dx = -3; dx <= 3; dx++) {
                for (let dy = -3; dy <= 3; dy++) {
                    if(c.pos.x + dx > 0 && c.pos.x + dx < 49 && c.pos.y + dy > 0 && c.pos.y + dy < 49) {
                        let cost = costs.get(c.pos.x + dx, c.pos.y + dy);
                        if(cost - 25 <= 255) {
                            costs.set(c.pos.x + dx, c.pos.y + dy, cost + 25);
                        }
                    }

                }
            }
        }
    });

    let storage:any = Game.getObjectById(Game.rooms[roomName].memory.Structures.storage);
    if(storage) {
        if(room.name === "E41N58") {
            for(let i=-27; i<=27; i++) {
                for(let o=-27; o<=27; o++) {
                    if(i<=-26 || i >= 26 || o <= -26 || o >= 26) {
                        if(storage && storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + 0 <= 49) {
                            costs.set(storage.pos.x + i, storage.pos.y + o, 255);
                        }
                    }
                }
            }
        }
        else {
            for(let i=-13; i<=13; i++) {
                for(let o=-13; o<=13; o++) {
                    if(i<=-11 || i >= 11 || o <= -11 || o >= 11) {
                        if(storage && storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + 0 <= 49) {
                            costs.set(storage.pos.x + i, storage.pos.y + o, 255);
                        }
                    }
                    // if(i<=-9 || i >= 9 || o <= -9 || o >= 9) {
                    //     if(storage && storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + 0 <= 49) {
                    //         costs.set(storage.pos.x + i, storage.pos.y + o, 40);
                    //     }
                    // }
                }
            }
        }

    }





    return costs;
}


const roomCallbackForRampartDefender = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 25;
            }
            else if(tile == 0){
                weight = 5;
            }
            costs.set(x, y, weight);
        }
    }



    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            if(costs.get(struct.pos.x, struct.pos.y) !== 255) {
                costs.set(struct.pos.x, struct.pos.y, 3);
            }
        }
        else if(struct.structureType == STRUCTURE_RAMPART) {
            let lookForBuildingsHere = struct.pos.lookFor(LOOK_STRUCTURES);
            if(lookForBuildingsHere.length > 1) {
                for(let building of lookForBuildingsHere) {
                    if(building.structureType !== STRUCTURE_RAMPART) {
                        return
                    }
                }
            }
            else {
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
        if(room.name === "E41N58") {
            for(let i=-27; i<=27; i++) {
                for(let o=-27; o<=27; o++) {
                    if(i<=-26 || i >= 26 || o <= -26 || o >= 26) {
                        if(storage && storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + 0 <= 49) {
                            costs.set(storage.pos.x + i, storage.pos.y + o, 255);
                        }
                    }
                }
            }
        }
        else {
            for(let i=-13; i<=13; i++) {
                for(let o=-13; o<=13; o++) {
                    if(i<=-11 || i >= 11 || o <= -11 || o >= 11) {
                        if(storage && storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + 0 <= 49) {
                            costs.set(storage.pos.x + i, storage.pos.y + o, 255);
                        }
                    }
                    // if(i<=-9 || i >= 9 || o <= -9 || o >= 9) {
                    //     if(storage && storage.pos.x + i >= 0 && storage.pos.x + i <= 49 && storage.pos.y + o >= 0 && storage.pos.y + 0 <= 49) {
                    //         costs.set(storage.pos.x + i, storage.pos.y + o, 40);
                    //     }
                    // }
                }
            }
        }

    }





    return costs;
}

// CREEP PROTOTYPES


