// CREEP PROTOTYPES
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

Creep.prototype.findStorage = function() {
    let storage = this.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE && structure.store[RESOURCE_ENERGY] > 0);}});
    if(storage.length) {
        this.memory.storage = storage[0].id;
        return storage[0];
    }
}


Room.prototype.findStorage = function() {
    let storage = this.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE);}});
    if(storage.length) {
        this.memory.storage = storage[0].id;
        return storage[0];
    }
}


Creep.prototype.moveToRoom = function moveToRoom(roomName) {
    this.moveTo(new RoomPosition(25,25, roomName));
}

Creep.prototype.harvestEnergy = function harvestEnergy() {
    // console.log(this, this.memory.targetRoom);
    if(this.memory.targetRoom && this.memory.targetRoom !== this.room.name) {
        return this.moveToRoom(this.memory.targetRoom);
    }

    let storedSource = Game.getObjectById(this.memory.source);
    if (!storedSource || (storedSource.energy == 0) || (!storedSource.pos.getOpenPositions().length && !this.pos.isNearTo(storedSource))) {
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

