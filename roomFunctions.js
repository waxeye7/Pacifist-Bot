Room.prototype.findStorage = function() {
    let storage = this.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE);}});
    if(storage.length) {
        this.memory.storage = storage[0].id;
        return storage[0];
    }
}

Room.prototype.findExtractor = function() {
    let extractor = this.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_EXTRACTOR);}});
    if(extractor.length) {
        this.memory.extractor = extractor[0].id;
        return extractor[0];
    }

}