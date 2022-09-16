Room.prototype.findStorage = function() {
    let storage = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE);}});
    if(storage.length) {
        this.memory.storage = storage[0].id;
        return storage[0];
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

Room.prototype.findContainers = function(capacity) {
    let containers = this.find(FIND_STRUCTURES, {filter: (i) => i.structureType == STRUCTURE_CONTAINER && i.store[RESOURCE_ENERGY] > capacity});
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
