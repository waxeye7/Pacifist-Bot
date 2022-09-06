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
    let storage = this.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE);}});
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
        let Containers = this.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_CONTAINER);}});
        // console.log(this.pos.getRangeTo(storedSource))
        // console.log(this.pos.isNearTo(storedSource), this.name)
        if(this.pos.isNearTo(storedSource)) {
            if(this.memory.role == "EnergyMiner") {
                let look = this.pos.lookFor(LOOK_STRUCTURES);
                let looked;
                if(look) {
                    looked = look.filter(object => object.structureType == STRUCTURE_CONTAINER);
                }
                if(looked.length == 0) {
                    this.room.createConstructionSite(this.pos, STRUCTURE_CONTAINER);
                }
            }
            this.harvest(storedSource);
        }
        else if(this.pos.getRangeTo(storedSource) < 6 && Containers.length > 0) {
            let closestContainer = this.pos.findClosestByRange(Containers);
            this.moveTo(closestContainer);
        }
        else {
            this.moveTo(storedSource);
        }
    }
}

Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquireEnergyWithContainersAndOrDroppedEnergy() {
    let Containers = this.room.find(FIND_STRUCTURES, {filter: (i) => i.structureType == STRUCTURE_CONTAINER && i.store[RESOURCE_ENERGY] > this.store.getFreeCapacity()});
    let dropped_resources = this.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => i.amount > this.store.getFreeCapacity() && this.pos.getRangeTo(i) < 4 && i.resourceType == RESOURCE_ENERGY});
    let dropped_resources_last_chance = this.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => i.resourceType == RESOURCE_ENERGY});

    if(dropped_resources.length > 0) {
        let closestDroppedEnergy = this.pos.findClosestByRange(dropped_resources);
        if(this.pickup(closestDroppedEnergy) == ERR_NOT_IN_RANGE) {
            this.moveTo(closestDroppedEnergy, {visualizePathStyle: {stroke: '#ffaa00'}});
        }
        return;
    }

    else if(Containers.length > 0) {
        Containers.sort((a, b) => b.store[RESOURCE_ENERGY]- a.store[RESOURCE_ENERGY]);
        if(this.withdraw(Containers[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            this.moveTo(Containers[0]);
        }
        return;
    }
    else if(dropped_resources_last_chance.length > 0) {
        dropped_resources_last_chance.sort((a,b) => b.amount - a.amount);
        if(this.pickup(dropped_resources_last_chance[0]) == ERR_NOT_IN_RANGE) {
            this.moveTo(dropped_resources_last_chance[0], {visualizePathStyle: {stroke: '#ffaa00'}});
        }
        return;
    }
}



// CREEP PROTOTYPES

