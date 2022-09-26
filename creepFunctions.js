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

Creep.prototype.findClosestLink = function() {
    let links = this.room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_LINK}});
    if(links.length) {
        let closestLink = this.pos.findClosestByRange(links);
        this.memory.closestLink = closestLink.id;
        return closestLink;
    }
}



Creep.prototype.withdrawStorage = function withdrawStorage(storage) {
    if(storage.store[RESOURCE_ENERGY] < 1000 && this.memory.role != "filler") {
        console.log("Storage requires 1000 energy to withdraw. Try again later.", this.room.name)
        return;
    }
    else {
        if(this.pos.isNearTo(storage)) {
            let result = this.withdraw(storage, RESOURCE_ENERGY);
            return result;
        }
        else {
            this.moveTo(storage, {reusePath:20});
        }
    }
}



Creep.prototype.moveToRoom = function moveToRoom(roomName) {
    this.moveTo(new RoomPosition(25,25, roomName), {range:23, reusePath:20});
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
        // let Containers = this.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_CONTAINER);}});
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
                    let containers = this.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_CONTAINER});
                    if(containers.length > 0) {
                        let closestContainer = this.pos.findClosestByRange(containers);
                        if(this.pos.getRangeTo(closestContainer) < 4) {
                            this.harvest(storedSource);
                            return;
                        }
                    }
                    this.room.createConstructionSite(this.pos, STRUCTURE_CONTAINER);
                }
            }
            let result;
            result = this.harvest(storedSource);
            return result;
        }
        // else if(this.pos.getRangeTo(storedSource) < 6 && Containers.length > 0) {
        //     let closestContainer = this.pos.findClosestByRange(Containers);
        //     this.moveTo(closestContainer, {reusePath:20});
        // }
        else {
            this.moveTo(storedSource, {reusePath:20});
        }
    }
}

Creep.prototype.acquireEnergyWithContainersAndOrDroppedEnergy = function acquireEnergyWithContainersAndOrDroppedEnergy() {
    // let Containers = this.room.find(FIND_STRUCTURES, {filter: (i) => i.structureType == STRUCTURE_CONTAINER && i.store[RESOURCE_ENERGY] > this.store.getFreeCapacity()});

    let room = this.room;
    let container;
    container = Game.getObjectById(room.memory.container) || room.findContainers(this.store.getFreeCapacity());


    if(this.pos.isNearTo(container)) {
        let dropped_resources = this.room.find(FIND_DROPPED_RESOURCES, {filter: (i) => this.pos.getRangeTo(i) < 4 && i.amount > this.store.getFreeCapacity() && i.resourceType == RESOURCE_ENERGY});

        if(dropped_resources.length > 0) {
            let closestDroppedEnergy = this.pos.findClosestByRange(dropped_resources);
            if(this.pos.isNearTo(closestDroppedEnergy)) {
                let result = this.pickup(closestDroppedEnergy, RESOURCE_ENERGY);
                return result;
            }
            else {
                this.moveTo(closestDroppedEnergy, {reusePath:20});
            }
            return;
        }
    }

    
    if(container) {
        if(container.store[RESOURCE_ENERGY] < this.store.getFreeCapacity()) {
            container = room.findContainers(this.store.getFreeCapacity());
        }
    }

    if(container) {
        if(this.pos.isNearTo(container)) {
            let result = this.withdraw(container, RESOURCE_ENERGY);
            return result;
        }
        else {
            this.moveTo(container, {reusePath:5});
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
            this.moveTo(dropped_resources_last_chance[0], {reusePath:5});
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
    let blockFound = false;
    _.forEach(nearbyBlocks, function(block) {
        if(blockFound == true) {
            return;
        }
        if(block.getRangeTo(repairTarget) <= 3) {
            let structures = block.lookFor(LOOK_STRUCTURES);
            let creeps = block.lookFor(LOOK_CREEPS);
            if(structures.length == 0 && creeps.length == 0) {
                blockFound = block;
                return;
            }
        }
    });
    if(blockFound != false) {
        return blockFound;
    }
}

// CREEP PROTOTYPES

