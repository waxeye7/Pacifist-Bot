interface Creep {
    Boost: () => boolean | "done";
    Speak: () => void;
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
    moveAwayIfNeedTo:any;
    Sweep: () => string | number | false;
    recycle: () => void;
    RangedAttackFleeFromMelee:any;
    SwapPositionWithCreep:any;
    MoveCostMatrixRoadPrio:any;
    MoveCostMatrixSwampPrio:any;
    MoveCostMatrixIgnoreRoads:any;
    roomCallbackRoadPrioUpgraderInPosition:any;
    MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch:any;
}
// CREEP PROTOTYPES

Creep.prototype.Boost = function Boost():any {

    if(this.memory.boostlabs.length == 0 || this.ticksToLive < 800) {
        return;
    }
    else {
        let labs = [];
        for(let labID of this.memory.boostlabs) {
            labs.push(Game.getObjectById(labID));
        }
        let closestLab = this.pos.findClosestByRange(labs);
        if(this.pos.isNearTo(closestLab)) {
            let result = closestLab.boostCreep(this);
            if(result == 0) {
                if(this.room.memory.labs.outputLab1 && this.room.memory.labs.outputLab1 == closestLab.id) {
                    this.room.memory.labs.status.boost.lab1.use -= 1;
                }
                else if(this.room.memory.labs.outputLab2 && this.room.memory.labs.outputLab2 == closestLab.id) {
                    this.room.memory.labs.status.boost.lab2.use -= 1;
                }
                else if(this.room.memory.labs.outputLab3 && this.room.memory.labs.outputLab3 == closestLab.id) {
                    this.room.memory.labs.status.boost.lab3.use -= 1;
                }
                else if(this.room.memory.labs.outputLab4 && this.room.memory.labs.outputLab4 == closestLab.id) {
                    this.room.memory.labs.status.boost.lab4.use -= 1;
                }
                else if(this.room.memory.labs.outputLab5 && this.room.memory.labs.outputLab5 == closestLab.id) {
                    this.room.memory.labs.status.boost.lab5.use -= 1;
                }
                else if(this.room.memory.labs.outputLab6 && this.room.memory.labs.outputLab6 == closestLab.id) {
                    this.room.memory.labs.status.boost.lab6.use -= 1;
                }
                else if(this.room.memory.labs.outputLab7 && this.room.memory.labs.outputLab7 == closestLab.id) {
                    this.room.memory.labs.status.boost.lab7.use -= 1;
                }

                let idToRemove = closestLab.id;
                this.memory.boostlabs = this.memory.boostlabs.filter(labid => labid !== idToRemove);
                return;
            }
        }
        else {
            this.MoveCostMatrixRoadPrio(closestLab, 1);
            return false;
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

Creep.prototype.moveToRoomAvoidEnemyRooms = function moveToRoomAvoidEnemyRooms(targetRoom) {
    if(this.room.name != this.memory.homeRoom && this.ticksToLive % 15 == 0) {
        if(this.room.controller && !this.room.controller.my && this.room.controller.level > 2 && this.room.find(FIND_HOSTILE_STRUCTURES, {filter: s => s.structureType == STRUCTURE_TOWER}).length > 0 && !_.includes(Memory.AvoidRooms, this.room.name, 0)) {
            Memory.AvoidRooms.push(this.room.name);
        }
    }

    if(this.memory.route && this.memory.route.length > 0 && this.memory.route[0].room == this.room.name) {
        this.memory.route.shift();
    }

    if(!this.memory.route || this.memory.route == 2 || this.memory.route && this.memory.route.length == 0 || this.memory.route.length == 1 && this.memory.route[0].room == this.room.name || this.memory.route && this.memory.route.length > 0 && this.memory.route[this.memory.route.length - 1].room !== targetRoom) {
        this.memory.route = Game.map.findRoute(this.room.name, targetRoom, {
            routeCallback(roomName, fromRoomName) {
                // !_.includes(Memory.AvoidRooms, targetRoom, 0)
                if(Game.map.getRoomStatus(roomName).status !== "normal") {
                    return Infinity;
                }
                if(_.includes(Memory.AvoidRooms, roomName, 0) && roomName !== targetRoom) {
                    return 24;
                }


                if(roomName.length == 6) {
                    if(parseInt(roomName[1] + roomName[2]) % 10 == 0) {
                        return 2;
                    }
                    if(parseInt(roomName[4] + roomName[5]) % 10 == 0) {
                        return 2;
                    }
                }

                return 3;
        }});
    }

    if(this.memory.route != 2 && this.memory.route.length > 0) {
        // console.log('Now heading to room '+route[0].room, "and I'm in" ,this.room.name, "and I'm a", this.memory.role);
        let exit;

        if(this.memory.role == "carry") {
            if(this.memory.route[0].exit == FIND_EXIT_RIGHT) {
                let roadsAtX48 = this.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_ROAD && s.pos.x == 48});
                if(roadsAtX48.length > 0) {
                    exit = roadsAtX48[0].pos.findClosestByRange(this.memory.route[0].exit);
                }
                else {
                    exit = this.pos.findClosestByRange(this.memory.route[0].exit);
                }
            }
            else if(this.memory.route[0].exit == FIND_EXIT_BOTTOM) {
                let roadsAtY48 = this.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_ROAD && s.pos.y == 48});
                if(roadsAtY48.length > 0) {
                    exit = roadsAtY48[0].pos.findClosestByRange(this.memory.route[0].exit);
                }
                else {
                    exit = this.pos.findClosestByRange(this.memory.route[0].exit);
                }
            }
            else if(this.memory.route[0].exit == FIND_EXIT_LEFT) {
                let roadsAtX1 = this.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_ROAD && s.pos.x == 1});
                if(roadsAtX1.length > 0) {
                    exit = roadsAtX1[0].pos.findClosestByRange(this.memory.route[0].exit);
                }
                else {
                    exit = this.pos.findClosestByRange(this.memory.route[0].exit);
                }
            }
            else if(this.memory.route[0].exit == FIND_EXIT_TOP) {
                let roadsAtY1 = this.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_ROAD && s.pos.y == 1});
                if(roadsAtY1.length > 0) {
                    exit = roadsAtY1[0].pos.findClosestByRange(this.memory.route[0].exit);
                }
                else {
                    exit = this.pos.findClosestByRange(this.memory.route[0].exit);
                }
            }
        }
        else {
            exit = this.pos.findClosestByRange(this.memory.route[0].exit);
        }

        this.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(exit, 0)
        // this.moveTo(exit, {reusePath:200});



        return;
    }
}

Creep.prototype.harvestEnergy = function harvestEnergy() {
    // console.log(this, this.memory.targetRoom);


    if(this.memory.targetRoom && this.memory.targetRoom !== this.room.name) {
        let travelTarget:any = Game.getObjectById(this.memory.sourceId);
        if(!travelTarget) {
            // return this.moveToRoom(this.memory.targetRoom, 25, 25);
            return this.moveToRoomAvoidEnemyRooms(this.memory.targetRoom)
        }
        // return this.moveToRoom(this.memory.targetRoom, travelTarget.pos.x, travelTarget.pos.y, false, 5, 3);
        return this.moveToRoomAvoidEnemyRooms(this.memory.targetRoom)
    }

    let storedSource:any = Game.getObjectById(this.memory.source);
    if (!storedSource || (!storedSource.pos.getOpenPositions().length && !this.pos.isNearTo(storedSource))) {
        delete this.memory.source;
        storedSource = this.findSource();
    }

    if(storedSource) {
        if(this.pos.isNearTo(storedSource)) {
            // if(this.memory.role == "EnergyMiner" && this.room.controller && this.room.controller.level < 6) {
            //     let look = this.pos.lookFor(LOOK_STRUCTURES);
            //     let looked;
            //     if(look) {
            //         looked = look.filter(object => object.structureType == STRUCTURE_CONTAINER);
            //     }
            //     if(looked.length == 0) {
            //         let containers = this.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER});
            //         if(containers.length > 0) {
            //             let closestContainer = this.pos.findClosestByRange(containers);
            //             if(this.pos.getRangeTo(closestContainer) < 4) {
            //                 this.harvest(storedSource);
            //                 return;
            //             }
            //         }
            //         this.room.createConstructionSite(this.pos, STRUCTURE_CONTAINER);
            //     }
            // }
            let result;
            result = this.harvest(storedSource);
            return result;
        }
        else {
            if(!this.pos.isNearTo(storedSource)) {
                this.MoveCostMatrixRoadPrio(storedSource, 1);
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
        else if(this.room.name == this.memory.homeRoom && this.memory.timeOut > 0) {
            this.memory.timeOut -= 1;
            if(this.pos.x == 49) {
                this.move(LEFT);
                this.move(TOP_LEFT);
                this.move(BOTTOM_LEFT);
            }
            else if(this.pos.x == 0) {
                this.move(RIGHT);
                this.move(TOP_RIGHT);
                this.move(BOTTOM_RIGHT);
            }
            else if(this.pos.y == 49) {
                this.move(TOP);
                this.move(TOP_LEFT);
                this.move(TOP_RIGHT);
            }
            else if(this.pos.y == 0) {
                this.move(BOTTOM);
                this.move(BOTTOM_LEFT);
                this.move(BOTTOM_RIGHT);
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
        let droppedResources = this.room.find(FIND_DROPPED_RESOURCES);
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
    if(this.memory.homeRoom && this.memory.homeRoom != this.room.name) {
        return this.moveToRoomAvoidEnemyRooms(this.memory.homeRoom);
    }

    let StructuresObject = this.room.memory.Structures;
    let bin;

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
                                spawn.recycleCreep(this)
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
                this.suicide();
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
        this.memory.moving = true;
        this.memory.path.shift();
        // this.moveByPath(this.memory.path);
     }

}


const roomCallbackRoadPrio = (roomName: string): boolean | CostMatrix => {
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


    room.find(FIND_MY_CREEPS).forEach(function(creep) {
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
                costs.set(creep.pos.x, creep.pos.y, 3);
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
        else if(creep.memory.role == "PowerMelee") {
            costs.set(creep.pos.x, creep.pos.y, 20);
        }
        else if(creep.memory.role == "PowerHeal") {
            costs.set(creep.pos.x, creep.pos.y, 14);
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
        this.memory.moving = true;
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
            costs.set(struct.pos.x, struct.pos.y, 5);
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



    room.find(FIND_MY_CREEPS).forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 11);
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

    room.find(FIND_MY_CREEPS).forEach(function(creep) {
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


    room.find(FIND_MY_CREEPS).forEach(function(creep) {
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







Creep.prototype.MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch = function MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch(target, range) {
    if(target && this.fatigue == 0 && this.pos.getRangeTo(target) > range) {
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }
        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != target.id || target.roomName !== this.room.name) {
            let costMatrix;
            if(this.memory.role == "carry" && this.memory.full == true || this.memory.suicide == true) {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierFull;
            }
            else if(this.memory.role == "carry" && this.memory.full == false) {
                costMatrix = roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierEmpty;
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



const roomCallbackRoadPrioAvoidEnemyCreepsMuch = (roomName: string): boolean | CostMatrix => {
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
        else {
            if(struct.structureType !== STRUCTURE_RAMPART) {
                costs.set(struct.pos.x, struct.pos.y, 255);
            }
        }
    });


    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        if(eCreep.getActiveBodyparts(ATTACK)>0 || eCreep.getActiveBodyparts(RANGED_ATTACK)>0){
            if(eCreep.owner.username == "Invader" || eCreep.owner.username == "Source Keeper") {
                for(let i=-5; i<5; i++) {
                    for(let o=-5; o<5; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 255);
                        }
                    }
                }
            }
            else {
                for(let i=-3; i<3; i++) {
                    for(let o=-3; o<3; o++) {
                        if(eCreep && eCreep.pos.x + i >= 0 && eCreep.pos.x + i <= 49 && eCreep.pos.y + o >= 0 && eCreep.pos.y + 0 <= 49) {
                            costs.set(eCreep.pos.x + i, eCreep.pos.y + o, 255);
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
    room.find(FIND_MY_CREEPS).forEach(function(creep) {
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
    });


    return costs;
}


const roomCallbackRoadPrioAvoidEnemyCreepsMuchForCarrierFull = (roomName: string): boolean | CostMatrix => {
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
    room.find(FIND_MY_CREEPS).forEach(function(creep) {
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
    room.find(FIND_MY_CREEPS).forEach(function(creep) {
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
    });


    return costs;
}

// CREEP PROTOTYPES


