// import {Creep} from "../utils/Types";
interface Creep {
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
    fleeHomeIfInDanger: () => boolean | string;
    moveAwayIfNeedTo:any;
    Sweep: () => string | number | false;
    recycle: () => void;
    RangedAttackFleeFromMelee:any;
}
// CREEP PROTOTYPES
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
            source = _.find(sources, function(s) {
            let open = s.pos.getOpenPositions();
            return open.length > 0;});
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
    if(this.room.controller.level >= 4) {
        let storage = this.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE);}});
        if(storage.length) {
            this.memory.storage = storage[0].id;
            return storage[0];
        }
    }
    else if(this.room.controller.level < 4 && this.room.controller.level != 0) {
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

Creep.prototype.findClosestLinkToStorage = function() {
    let links = this.room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_LINK}});
    let storage = Game.getObjectById(this.memory.storage) || this.findStorage();
    if(links.length && storage) {
        let closestLink = storage.pos.findClosestByRange(links);
        this.memory.closestLink = closestLink.id;
        return closestLink;
    }
}




Creep.prototype.withdrawStorage = function withdrawStorage(storage) {
    if(storage) {
        if(storage.store[RESOURCE_ENERGY] < 2000 && this.memory.role != "filler" && storage.structureType == STRUCTURE_STORAGE) {
            if(Game.time % 10 == 1) {
                console.log("Storage requires 2000 energy to withdraw. Try again later.", this.room.name)
            }
            this.acquireEnergyWithContainersAndOrDroppedEnergy();
            return;
        }
        else if(storage.store[RESOURCE_ENERGY] < 300 && this.memory.role != "filler" && storage.structureType == STRUCTURE_CONTAINER) {
            if(Game.time % 10 == 0) {
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
                this.moveTo(storage, {reusePath:25, ignoreRoads:true});
            }
        }
    }
    else {
        this.room.findStorage();
    }
}

Creep.prototype.moveToRoom = function moveToRoom(roomName, travelTarget_x = 25, travelTarget_y = 25, ignoreRoadsBool = false, swampCostValue = 5, rangeValue = 20) {
    this.moveTo(new RoomPosition(travelTarget_x, travelTarget_y, roomName), {range:rangeValue, reusePath:25, ignoreRoads: ignoreRoadsBool, swampCost: swampCostValue});
}

Creep.prototype.moveToRoomAvoidEnemyRooms = function moveToRoomAvoidEnemyRooms(targetRoom) {
    if(this.room.name != this.memory.homeRoom) {
        if(this.room.controller && !this.room.controller.my && this.room.controller.level > 2 && !_.includes(Memory.AvoidRooms, this.room.name, 0)) {
            Memory.AvoidRooms.push(this.room.name);
        }
    }


    let route:any = Game.map.findRoute(this.room.name, targetRoom, {
        routeCallback(roomName, fromRoomName) {
            // !_.includes(Memory.AvoidRooms, targetRoom, 0)
            if(_.includes(Memory.AvoidRooms, roomName, 0) && roomName !== targetRoom) {
                return Infinity;
            }
            return 1;
    }});

    if(route.length > 0) {
        // console.log('Now heading to room '+route[0].room, "and I'm in" ,this.room.name, "and I'm a", this.memory.role);
        const exit = this.pos.findClosestByRange(route[0].exit);
        this.moveTo(exit, {reusePath:25});
        return;
    }
}

Creep.prototype.harvestEnergy = function harvestEnergy() {
    // console.log(this, this.memory.targetRoom);
    if(this.memory.targetRoom && this.memory.targetRoom !== this.room.name) {
        let travelTarget:any = Game.getObjectById(this.memory.sourceId);
        if(travelTarget == null) {
            return this.moveToRoom(this.memory.targetRoom, 25, 25);
        }
        return this.moveToRoom(this.memory.targetRoom, travelTarget.pos.x, travelTarget.pos.y, false, 5, 3);
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
            this.moveTo(storedSource, {reusePath: 25});
        }
    }
}

// try here to make ignore creeps on home path but not ignore creeps on the way there because then can stay on road when full energy for best movement but it could be risky hm

Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquireEnergyWithContainersAndOrDroppedEnergy() {
    // let Containers = this.room.find(FIND_STRUCTURES, {filter: (i) => i.structureType == STRUCTURE_CONTAINER && i.store[RESOURCE_ENERGY] > this.store.getFreeCapacity()});

    let room = this.room;
    let container;
    container = Game.getObjectById(room.memory.container) || room.findContainers(this.store.getFreeCapacity());


    let dropped_resources = this.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => this.pos.findPathTo(i.pos).length < 6 && i.amount > this.store.getFreeCapacity() + this.pos.findPathTo(i.pos).length + 1 && i.resourceType == RESOURCE_ENERGY});

    if(dropped_resources.length > 0) {
        let closestDroppedEnergy = this.pos.findClosestByRange(dropped_resources);
        if(this.pos.isNearTo(closestDroppedEnergy)) {
            let result = this.pickup(closestDroppedEnergy, RESOURCE_ENERGY);
            return result;
        }
        else {
            if(this.memory.role == "carry") {
                this.moveTo(closestDroppedEnergy, {reusePath:25, ignoreRoads:true, swampCost:1});
            }
            else {
                this.moveTo(closestDroppedEnergy, {reusePath:25});
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
                this.moveTo(container, {reusePath:25, ignoreRoads:true, swampCost:1});
            }
            else {
                this.moveTo(container, {reusePath:25});
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
                this.moveTo(dropped_resources_last_chance[0], {reusePath:25, ignoreRoads:true, swampCost:1});
            }
            else {
                this.moveTo(dropped_resources_last_chance[0], {reusePath:25});
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
        if(this.room.memory.storage) {
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


Creep.prototype.fleeHomeIfInDanger = function fleeHomeIfInDanger() {
    if(Memory.tasks.wipeRooms.killCreeps.includes(this.room.name) && this.memory.targetRoom != this.memory.homeRoom) {
        this.moveToRoom(this.memory.homeRoom);
        return true;
    }
    if(Memory.tasks.wipeRooms.killCreeps.includes(this.memory.targetRoom) && this.memory.targetRoom != this.memory.homeRoom) {
        if(this.pos.x > 0 && this.pos.y > 0 && this.pos.y < 49 && this.pos.x < 49) {
            if(this.roadCheck()) {
                let roadlessLocation = this.roadlessLocation(this.pos);
                this.moveTo(roadlessLocation);
            }
            return "in position";
        }
        else {
            this.moveTo(25, 25, {range:20});
            return "in position";
        }
    }
    return false;
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
        this.moveTo(target, {reusePath:25, ignoreRoads:true, swampCost:1});
    }

    return false;
}


Creep.prototype.recycle = function recycle() {
    if(this.memory.homeRoom && this.room.name != this.memory.homeRoom) {
        return this.moveToRoom(this.memory.homeRoom);
    }

    if(this.room.memory.bin) {
        let bin:any = Game.getObjectById(this.room.memory.bin)
        if(bin && bin.store[RESOURCE_ENERGY] < 2000) {
            if(this.pos.x == bin.pos.x && this.pos.y == bin.pos.y) {
                let spawnPosition = new RoomPosition(this.pos.x, this.pos.y + 1, this.room.name);
                // creepBlock.lookFor(LOOK_STRUCTURES, {filter: building => building.structureType == STRUCTURE_ROAD})
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
                this.moveTo(bin, {reusePath:25, ignoreCreeps:false});
            }
        }
        else if(this.room.memory.storage) {
            let storage:any = Game.getObjectById(this.room.memory.storage);
            if(storage) {
                if(this.pos.isNearTo(storage)) {
                    this.suicide();
                }
                else {
                    this.moveTo(storage, {reusePath:25, ignoreCreeps:false});
                }
            }
        }
        else if(this.room.memory.spawn) {
            let spawn:any = Game.getObjectById(this.room.memory.spawn);
            if(spawn) {
                if(this.pos.isNearTo(spawn)) {
                    this.suicide();
                }
                else {
                    this.moveTo(spawn, {reusePath:25, ignoreCreeps:false});
                }
            }
        }
    }
    else {
        let storage = Game.getObjectById(this.room.memory.storage) || this.room.findStorage();
        this.room.findBin(storage);
    }
}

Creep.prototype.RangedAttackFleeFromMelee = function RangedAttackFleeFromMelee(fleeTarget) {
    let FleePath = PathFinder.search(this.pos,{pos:fleeTarget.pos, range:3}, {flee:true});
    let FirstPathGuy = FleePath.path[0];
    this.move(this.pos.getDirectionTo(FirstPathGuy));
    return;
}

// CREEP PROTOTYPES
