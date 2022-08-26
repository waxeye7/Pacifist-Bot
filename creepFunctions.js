// CREEP PROTOTYPES
Creep.prototype.findSource = function() {
    let sources = this.room.find(FIND_SOURCES, {filter: s => s.energy > 0});
    if(sources.length) {
        let source = _.find(sources, function(s) {
        let open = s.pos.getOpenPositions();
        return open.length > 0;});

        if(source) {
            this.memory.source = source.id;
            return source;
        }
    }
}

Creep.prototype.findStorage = function() {
    let storage = this.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE);}});
    if(storage.length) {
        this.memory.storage = storage[0].id;
        return storage[0];
    }
}

Creep.prototype.harvestEnergy = function harvestEnergy() {
    let storedSource = Game.getObjectById(this.memory.source);
    if (!storedSource || (!storedSource.pos.getOpenPositions().length && !this.pos.isNearTo(storedSource))) {
        delete this.memory.source;
        storedSource = this.findSource();
    }
    if(storedSource) {
        if(this.pos.isNearTo(storedSource)) {
            this.harvest(storedSource);
        }
        else {
            this.moveTo(storedSource);
        }
    }
}


// CREEP PROTOTYPES

