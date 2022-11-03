// import {Room} from "../utils/Types";
interface Room {
    findStorage:() => object;
    findExtractor:() => object | void;
    findSpawn:() => object | void;
    findStorageContainer:() => object | void;
    findContainers:(capacity:number) => object | void;
    findMineral:() => object | void;
    findBin:(storage) => object | void;
}

Room.prototype.findStorage = function() {
    let storage = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE);}});
    if(storage.length) {
        this.memory.storage = storage[0].id;
        return storage[0];
    }
    else {
        return this.findStorageContainer();
    }
}

Room.prototype.findExtractor = function() {
    let extractor = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_EXTRACTOR);}});
    if(extractor.length) {
        this.memory.extractor = extractor[0].id;
        return extractor[0];
    }

}

Room.prototype.findSpawn = function() {
    let spawns = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_SPAWN && !structure.spawning);}});
    if(spawns.length) {
        this.memory.spawn = spawns[0].id;
        return spawns[0]
    }
}


Room.prototype.findStorageContainer = function(): object | void {
    let spawn:any = Game.getObjectById(this.memory.spawn);
    if(spawn) {
        let storagePosition = new RoomPosition(spawn.pos.x, spawn.pos.y - 2, this.name);
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



Room.prototype.findContainers = function(capacity) {
    let spawn:any = Game.getObjectById(this.memory.spawn)
    let containers;
    if(this.controller && this.controller.my && this.controller.level != 0) {
        containers = this.find(FIND_STRUCTURES, {filter: (i) => i.structureType == STRUCTURE_CONTAINER && i.store[RESOURCE_ENERGY] > capacity && spawn && spawn.pos.getRangeTo(i) > 4});
    }
    else {
        containers = this.find(FIND_STRUCTURES, {filter: (i) => i.structureType == STRUCTURE_CONTAINER && i.store[RESOURCE_ENERGY] > capacity});
    }
    containers.sort((a,b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
    if(containers.length) {
        this.memory.container = containers[0].id;
        return containers[0];
    }
}

Room.prototype.findMineral = function() {
    let mineral = this.find(FIND_MINERALS);
    if(mineral.length) {
        this.memory.mineral = mineral[0].id;
        return mineral[0];
    }
}

Room.prototype.findBin = function(storage): object | void {
    if(storage) {
        let binPosition = new RoomPosition(storage.pos.x, storage.pos.y + 1, this.name);
        let binPositionStructures = binPosition.lookFor(LOOK_STRUCTURES);
        if(binPositionStructures.length > 0) {
            for(let building of binPositionStructures) {
                if(building.structureType == STRUCTURE_CONTAINER) {
                    this.memory.bin = building.id;
                    return building;
                }
            }
        }
    }
}
