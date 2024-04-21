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
}
// CREEP PROTOTYPES
Creep.prototype.findFillerTarget = function findFillerTarget():any {

    let reserveFill = this.room.memory.reserveFill;


    if(this.memory.role == "ControllerLinkFiller" && (!this.room.memory.Structures.controllerLink || Game.time % 10000 == 0) && this.room.controller.level >= 2) {
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
            if(lab && (lab.store[RESOURCE_ENERGY] <= 2000 - this.memory.MaxStorage*2 || lab.store[RESOURCE_ENERGY] < 1200) && !reserveFill.includes(lab.id)) {
                if(!this.room.memory.reserveFill.includes(lab.id)) {
                    this.room.memory.reserveFill.push(lab.id);
                }
                this.memory.t = lab.id;
                return lab;
            }
        }
    }
    if(this.room.energyAvailable < this.room.energyCapacityAvailable) {

        let spawnAndExtensions = this.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_SPAWN || building.structureType == STRUCTURE_EXTENSION) && building.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && !reserveFill.includes(building.id)});
        if(spawnAndExtensions.length > 0) {
            let t = this.pos.findClosestByRange(spawnAndExtensions);
            if(!this.room.memory.reserveFill.includes(t.id)) {
                this.room.memory.reserveFill.push(t.id);
            }
            this.memory.t = t.id;
            return t;
        }

    }


    let towers2 = this.room.find(FIND_MY_STRUCTURES, {filter: building => (building.structureType == STRUCTURE_TOWER && building.store.getFreeCapacity(RESOURCE_ENERGY) >= 100 && !reserveFill.includes(building.id))});
    if(towers2.length > 0) {
        let t = this.pos.findClosestByRange(towers2);
        if(!this.room.memory.reserveFill.includes(t.id)) {
            this.room.memory.reserveFill.push(t.id);
        }        this.memory.t = t.id;
        return t;
    }

    let storage = Game.getObjectById(this.memory.storage) || this.findStorage() || this.room.storage;
    if(this.room.memory.Structures.factory) {
        let factory:any = Game.getObjectById(this.room.memory.Structures.factory);
        if(factory && factory.store[RESOURCE_ENERGY] < 20000 && storage && storage.store[RESOURCE_ENERGY] > 450000 && storage.store[RESOURCE_BATTERY] < 200 && !reserveFill.includes(factory.id)) {
            if(!this.room.memory.reserveFill.includes(factory.id)) {
                this.room.memory.reserveFill.push(factory.id);
            }            this.memory.t = factory.id;
            return factory;
        }
    }

    if(this.room.memory.Structures.extraLinks) {
        for(let linkID of this.room.memory.Structures.extraLinks) {
            let extraLink:any = Game.getObjectById(linkID);
            if(extraLink && extraLink.store[RESOURCE_ENERGY] < 800 && storage && storage.store[RESOURCE_ENERGY] > 100000 && !reserveFill.includes(extraLink.id)) {
                if(!this.room.memory.reserveFill.includes(extraLink.id)) {
                    this.room.memory.reserveFill.push(extraLink.id);
                }                this.memory.t = extraLink.id;
                return extraLink;
            }
        }
    }


    if(this.room.memory.Structures.powerSpawn) {
        let powerSpawn:any = Game.getObjectById(this.room.memory.Structures.powerSpawn);
        if(powerSpawn && powerSpawn.store[RESOURCE_ENERGY] < 2500 && storage && storage.store[RESOURCE_ENERGY] > 280000 && !reserveFill.includes(powerSpawn.id)) {
            if(!this.room.memory.reserveFill.includes(powerSpawn.id)) {
                this.room.memory.reserveFill.push(powerSpawn.id);
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
        if(spawn) {
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
        let storageLinkPosition = new RoomPosition(storage.pos.x - 2, storage.pos.y, this.room.name);
        let lookForBuildingsOnStorageLinkPosition = storageLinkPosition.lookFor(LOOK_STRUCTURES);
        if(lookForBuildingsOnStorageLinkPosition.length > 0) {
            for(let building of lookForBuildingsOnStorageLinkPosition) {
                if(building.structureType == STRUCTURE_LINK) {
                    this.memory.closestLink = building.id;
                    return building;
                }
            }
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

Creep.prototype.moveToRoom = function moveToRoom(roomName, travelTarget_x = 25, travelTarget_y = 25, ignoreRoadsBool = false, swampCostValue = 5, rangeValue = 20) {
    this.moveTo(new RoomPosition(travelTarget_x, travelTarget_y, roomName), {range:rangeValue, reusePath:200, ignoreRoads: ignoreRoadsBool, swampCost: swampCostValue});
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

                if (Memory.AvoidRoomsTemp && typeof Memory.AvoidRoomsTemp[this.room.name] === 'number') {
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
                if ((Memory.AvoidRooms.includes(roomName) || Memory.AvoidRoomsTemp[roomName]) && roomName !== targetRoom) {
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
        // console.log('Now heading to room '+route[0].room, "and I'm in" ,this.room.name, "and I'm a", this.memory.role);
        let exit;
        let position;


        if(!this.memory.exit || this.memory.exit.roomName !== this.room.name) {
            const routeData = this.memory.route[0];

            const exitPositions = this.room.find(routeData.exit);
            const exitsWithoutWalls = exitPositions.filter(position => {
              const structuresAtExit = position.lookFor(LOOK_STRUCTURES);
              return !structuresAtExit.some(structure => structure.structureType === STRUCTURE_WALL);
            });

            this.memory.exit = this.pos.findClosestByPath(exitsWithoutWalls, {ignoreCreeps:true});
        }
        exit = this.memory.exit;
        if(!exit) {
            exit = this.pos.findClosestByRange(this.memory.route[0].exit);
        }
        if(exit) {
            position = new RoomPosition(exit.x, exit.y, exit.roomName)
        }
        console.log(position);
        // exit = this.pos.findClosestByRange(this.memory.route[0].exit);

        this.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(position, 0);

        return;
    }

};



Creep.prototype.harvestEnergy = function harvestEnergy() {
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

Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquireEnergyWithContainersAndOrDroppedEnergy() {
    // let Containers = this.room.find(FIND_STRUCTURES, {filter: (i) => i.structureType == STRUCTURE_CONTAINER && i.store[RESOURCE_ENERGY] > this.store.getFreeCapacity()});

    let room = this.room;
    let container;

    if(!this.room.memory.Structures) {
        this.room.memory.Structures = {};
    }
    let spawn:any = Game.getObjectById(this.memory.spawn);
    container = Game.getObjectById(this.room.memory.Structures.container) || room.findContainers(this.store.getFreeCapacity());

    if(container && this.pos.isNearTo(container)) {
        this.withdraw(container, RESOURCE_ENERGY);
    }
    else if(!container) {
        container = room.findContainers(this.store.getFreeCapacity());
    }
    let dropped_resources
    if(spawn) {
        dropped_resources = this.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => this.pos.getRangeTo(i.pos) < 8 && i.amount > this.store.getFreeCapacity() + this.pos.findPathTo(i.pos).length + 1 && i.resourceType == RESOURCE_ENERGY && !i.pos.isNearTo(spawn)});
    }
    else {
        dropped_resources = this.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => this.pos.getRangeTo(i.pos) < 8 && i.amount > this.store.getFreeCapacity() + this.pos.findPathTo(i.pos).length + 1 && i.resourceType == RESOURCE_ENERGY});
    }

    if(dropped_resources.length > 0) {
        let closestDroppedEnergy = this.pos.findClosestByRange(dropped_resources);
        if(this.pos.isNearTo(closestDroppedEnergy)) {
            let result = this.pickup(closestDroppedEnergy, RESOURCE_ENERGY);
            return result;
        }
        else {
            if(this.memory.role == "carry") {
                this.MoveCostMatrixSwampPrio(closestDroppedEnergy, 1)
            }
            else {
                this.MoveCostMatrixRoadPrio(closestDroppedEnergy, 1)
            }
        }

        return;
    }


    if(container) {
        if(container.store[RESOURCE_ENERGY] <= this.store.getFreeCapacity()) {
            container = room.findContainers(this.store.getFreeCapacity());
        }
    }

    if(container) {
        if(this.pos.isNearTo(container)) {
            let result = this.withdraw(container, RESOURCE_ENERGY);
            return result;
        }
        else {
            if(this.memory.role == "carry") {
                this.MoveCostMatrixSwampPrio(container, 1)
            }
            else {
                this.MoveCostMatrixRoadPrio(container, 1)
            }
        }
        return;
    }

    let dropped_resources_last_chance = this.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => i.resourceType == RESOURCE_ENERGY});

    if(dropped_resources_last_chance.length > 0) {
        dropped_resources_last_chance.sort((a,b) => b.amount - a.amount);
        if(this.pos.isNearTo(dropped_resources_last_chance[0])) {
            let result = this.pickup(dropped_resources_last_chance[0], RESOURCE_ENERGY);
            return result;
        }
        else {
            if(this.memory.role == "carry") {
                this.MoveCostMatrixSwampPrio(dropped_resources_last_chance[0], 1)
            }
            else {
                this.MoveCostMatrixRoadPrio(dropped_resources_last_chance[0], 1);
            }
        }
        return;
    }
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
    if(this.memory.targetRoom && this.memory.homeRoom && Memory.rooms[this.memory.targetRoom] && Memory.rooms[this.memory.targetRoom].roomData && Memory.rooms[this.memory.targetRoom].roomData.has_hostile_creeps) {
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
        positions.push([creep.pos.x -1, creep.pos.y -1, creep.room.name]);
        positions.push([creep.pos.x -1, creep.pos.y, creep.room.name]);
        positions.push([creep.pos.x -1, creep.pos.y +1, creep.room.name]);
        positions.push([creep.pos.x, creep.pos.y -1, creep.room.name]);
        positions.push([creep.pos.x, creep.pos.y +1, creep.room.name]);
        positions.push([creep.pos.x +1, creep.pos.y -1, creep.room.name]);
        positions.push([creep.pos.x +1, creep.pos.y, creep.room.name]);
        positions.push([creep.pos.x +1, creep.pos.y +1, creep.room.name]);

        let creep_nearby = false;
        let empty_block = false;
        for (let position of positions) {
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
    if(position != false) {
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
    if(!this.memory.lockedDropped || Game.getObjectById(this.memory.lockedDropped) == null) {
        let sources=  this.room.find(FIND_SOURCES);
        if(!sources.length) return "nothing to sweep";
        let droppedResources = this.room.find(FIND_DROPPED_RESOURCES);
        if(this.room.controller && this.room.controller.level <= 3) droppedResources = droppedResources.filter(function(resource) {return resource.pos.getRangeTo(resource.pos.findClosestByRange(sources)) > 1;});
        let droppedResourcesTombstones = this.room.find(FIND_TOMBSTONES, {filter: tombstone => _.keys(tombstone.store).length > 0});

        let droppedResourcesNearby;
        let droppedResourcesTombstonesNearby;

        if(droppedResources.length > 0) {
            droppedResourcesNearby = droppedResources.filter(function(resource) {return resource.pos.getRangeTo(this) < 6;});
        }
        if(droppedResourcesTombstones.length > 0) {
            droppedResourcesTombstonesNearby = droppedResourcesTombstones.filter(function(tomb) {return tomb.pos.getRangeTo(this) < 6;});
        }

        if(droppedResources.length == 0 && droppedResourcesTombstones.length == 0) {
            return "nothing to sweep";
        }

        if(droppedResourcesNearby && droppedResourcesNearby.length > 0) {
            droppedResourcesNearby.sort((a,b) => a.amount - b.amount);
            this.memory.lockedDropped = droppedResourcesNearby[0].id;
        }
        else if(droppedResourcesTombstonesNearby && droppedResourcesTombstonesNearby.length > 0) {
            droppedResourcesTombstonesNearby.sort((a,b) => a.amount - b.amount);
            this.memory.lockedDropped = droppedResourcesTombstonesNearby[0].id;
        }
        else if(droppedResources.length > 0) {
            droppedResources.sort((a,b) => a.amount - b.amount);
            this.memory.lockedDropped = droppedResources[0].id;
        }
        else if(droppedResourcesTombstones.length > 0) {
            droppedResourcesTombstones = droppedResourcesTombstones.reverse();
            this.memory.lockedDropped = droppedResourcesTombstones[0].id;
        }
    }

    let target = Game.getObjectById(this.memory.lockedDropped);

    if(this.pickup(target) == 0) {
        return "picked up";
    }
    else if(this.pickup(target) == ERR_NOT_IN_RANGE) {
        this.moveTo(target, {reusePath:25, ignoreRoads:true, swampCost:1});
    }
    else if(this.withdraw(target, RESOURCE_ENERGY) == 0) {
        return "picked up";
    }
    else if(this.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        this.MoveCostMatrixSwampPrio(target, 1)
    }

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
                    let binPos = new RoomPosition(storage.pos.x, storage.pos.y+1, storage.pos.roomName);
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


