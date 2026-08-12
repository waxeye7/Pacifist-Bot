// import {Room} from "../utils/Types";
interface Room {
    findStorage:() => object;
    findExtractor:() => object | void;
    findSpawn:() => object | void;
    findStorageContainer:() => object | void;
    findContainers:(capacity:number) => object | void;
    findMineral:() => object | void;
    findBin:(storage) => object | void;
    findStorageLink:() => object | void;
    findObserver:() => object | void;
    findNuker:() => object | void;
    roomTowersHealMe:any;
    roomTowersAttackEnemy:any;
    roomTowersRepairTarget:any;
}


Room.prototype.roomTowersHealMe = function(creep): object | void {
    if(creep) {
        let towerIDs = this.memory.Structures.towers;
        let towerObjs = [];
        for(let towerID of towerIDs) {
            let towerObj = Game.getObjectById(towerID);
            if(towerObj) {
                towerObjs.push(towerObj);
            }
        }
        if(towerObjs.length > 0) {
            for(let tower of towerObjs) {
                tower.heal(creep);
            }
        }
    }
}

Room.prototype.roomTowersAttackEnemy = function(enemyCreep) {
    if (enemyCreep) {
        let towerIDs = this.memory.Structures.towers || [];
        let towerObjs = [];
        for (let towerID of towerIDs) {
            let towerObj = Game.getObjectById(towerID);
            if (towerObj) {
                towerObjs.push(towerObj);
            }
        }
        if (towerObjs.length === 0) return; // No towers, exit the function

        if (enemyCreep.hits < enemyCreep.hitsMax / 1.5) {
            for (let tower of towerObjs) {
                tower.attack(enemyCreep);
            }
        }
        for (let tower of towerObjs) {
            if (tower.store[RESOURCE_ENERGY] < 100) return;
        }
        if (towerObjs.length > 0) {
            for (let tower of towerObjs) {
                tower.attack(enemyCreep);
            }
        }
    }
};


Room.prototype.roomTowersRepairTarget = function(target): object | void {
    if(target) {
        let towerIDs = this.memory.Structures.towers;
        let towerObjs = [];
        for(let towerID of towerIDs) {
            let towerObj = Game.getObjectById(towerID);
            if(towerObj) {
                towerObjs.push(towerObj);
            }
        }
        if(towerObjs.length > 0) {
            for(let tower of towerObjs) {
                tower.repair(target);
            }
        }
    }
}

Room.prototype.findNuker = function(): object | void {
    let nukers = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_NUKER);}});
    if(nukers.length > 0) {
        if(this.memory.Structures) {
            this.memory.Structures.nuker = nukers[0].id;
            return nukers[0];
        }
        else {
            this.memory.Structures = {};
        }
    }
}

Room.prototype.findObserver = function(): object | void {
    let observers = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_OBSERVER);}});
    if(observers.length > 0) {
        if(this.memory.Structures) {
            this.memory.Structures.observer = observers[0].id;
            return observers[0];
        }
        else {
            this.memory.Structures = {};
        }
    }
}


Room.prototype.findStorageLink = function(): object | void {
    let links = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LINK);}});
    if(links.length > 0) {
        let storage = Game.getObjectById(this.memory.Structures.storage) || this.findStorage();
        if(!storage) return;
        // The hub link is wherever the layout put it: legacy stamps use
        // storage.x-2 (chebyshev 2), the v2 planner glues it to the storage
        // (chebyshev 1). Search the neighbourhood and take the closest link
        // instead of hardcoding one offset — v2 wins at 1, legacy still
        // resolves at 2.
        let nearby = links.filter(function(link) {return storage.pos.getRangeTo(link) <= 2;});
        if(nearby.length > 0) {
            nearby.sort((a, b) => storage.pos.getRangeTo(a) - storage.pos.getRangeTo(b));
            this.memory.Structures.StorageLink = nearby[0].id;
            return nearby[0];
        }
        // Lowercase `storageLink` here for years — a key with no reader, while
        // every consumer reads `StorageLink`. So the "there is no link next to
        // the storage" case never actually invalidated anything, and a stale
        // id survived indefinitely. That id is used as an EXCLUSION filter in
        // half a dozen places (the hub link is deliberately not a donor), so
        // when it points at a source link that link can never forward, and it
        // is simultaneously the transfer TARGET — a link sending to itself,
        // answering ERR_INVALID_TARGET silently, forever.
        delete this.memory.Structures.StorageLink;
    }
}

Room.prototype.findStorage = function() {
    if(!this.memory.Structures) {
        this.memory.Structures = {};
    }
    // Structures.storage doubles as the PRE-storage hub container id, and every
    // reader is `getObjectById(Structures.storage) || room.findStorage()` — that
    // refreshes only when the cached object DIES. A hub container outlives the
    // storage build, so without this the cache stays pinned to a 2k container
    // and every `storage > 15000 / 50000 / 100000` gate reads <= 2000 forever.
    // The real storage always wins, and a repoint invalidates the bin so it gets
    // re-derived next to the storage instead of next to the old container
    // (same repoint rooms.ts does per tick — this is the version that also
    // covers rooms/ticks the room loop has not reached yet).
    if(this.storage && this.storage.my) {
        if(this.memory.Structures.storage !== this.storage.id) {
            this.memory.Structures.storage = this.storage.id;
            delete this.memory.Structures.bin;
        }
        return this.storage;
    }
    let storage = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_STORAGE);}});
    if(storage.length) {
        if(this.memory.Structures.storage !== storage[0].id) {
            this.memory.Structures.storage = storage[0].id;
            delete this.memory.Structures.bin;
        }
        return storage[0];
    }
    else {
        return this.findStorageContainer();
    }
}

Room.prototype.findExtractor = function() {
    let extractor = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_EXTRACTOR);}});
    if(extractor.length) {
        this.memory.Structures.extractor = extractor[0].id;
        return extractor[0];
    }

}

Room.prototype.findSpawn = function() {
    let spawns = this.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_SPAWN && !structure.spawning);}});
    if(spawns.length) {
        this.memory.Structures.spawn = spawns[0].id;
        return spawns[0]
    }
}


Room.prototype.findStorageContainer = function(): object | void {
    let spawn:any = Game.getObjectById(this.memory.Structures.spawn);
    if(!spawn) return;
    // Match construction hub offsets (legacy spawn.y-2 first, then fallbacks).
    const offsets = [[0, -2], [0, 2], [-2, 0], [2, 0], [-1, -2], [1, -2], [-2, -1], [2, -1]];
    for (let i = 0; i < offsets.length; i++) {
        const x = spawn.pos.x + offsets[i][0];
        const y = spawn.pos.y + offsets[i][1];
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        let storagePosition = new RoomPosition(x, y, this.name);
        let storagePositionStructures = storagePosition.lookFor(LOOK_STRUCTURES);
        if(storagePositionStructures.length > 0) {
            for(let building of storagePositionStructures) {
                if(building.structureType == STRUCTURE_CONTAINER) {
                    this.memory.Structures.storage = building.id;
                    return building;
                }
            }
        }
    }
}



Room.prototype.findContainers = function(capacity) {
    if(!this.memory.Structures) {
        this.memory.Structures = {};
    }
    // The bin / hub-storage container / controller depot are DROP-OFF points.
    // Withdrawing from them just moves energy in a circle, so they are excluded
    // in a room we own and have developed (a reserved remote has no hub).
    const excluded = !!(this.controller && this.controller.my && this.controller.level !== 0);
    // ONE predicate for both the scan and the sticky cache. They used to differ:
    // the cache branch checked only `store >= capacity` on the raw id, skipping
    // every exclusion above and using `>=` where the scan uses `>`. A cached hub
    // container the scan would never return therefore kept getting handed back,
    // which is how carriers ended up parked on a near-empty drop-off while the
    // source containers overflowed.
    const usable = (i:any) =>
        !!i &&
        i.structureType == STRUCTURE_CONTAINER &&
        i.room && i.room.name == this.name &&
        i.store[RESOURCE_ENERGY] > capacity &&
        (!excluded ||
            (i.id !== this.memory.Structures.bin &&
             i.id !== this.memory.Structures.storage &&
             i.id !== this.memory.Structures.controllerLink));

    let containers = this.find(FIND_STRUCTURES, {filter: usable});
    if(containers.length > 0) {
        // Sticky pick: keep the current container while it still passes the SAME
        // filter, so haulers don't thrash between two equally full containers.
        let CurrentContainer:any = Game.getObjectById(this.memory.Structures.container);
        if(usable(CurrentContainer)) {
            return CurrentContainer;
        }
        containers.sort((a,b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
        this.memory.Structures.container = containers[0].id;
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
    // Prefer plan-adjacent open container south/any of hub, not hard-coded only y+1.
    // Range 2, nearest ring first: a plan-v2 hub can place the bin one tile further
    // out than the old adjacent-only scan allowed, which left Structures.bin unset
    // and every bin-reading code path blind. Deliberately capped at 2 — a wider
    // scan starts picking up SOURCE containers, which are not bins.
    if (storage) {
        const offsets = [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
            [0, 2],
            [0, -2],
            [2, 0],
            [-2, 0],
            [1, 2],
            [-1, 2],
            [1, -2],
            [-1, -2],
            [2, 1],
            [2, -1],
            [-2, 1],
            [-2, -1],
            [2, 2],
            [-2, 2],
            [2, -2],
            [-2, -2],
        ];
        for (const [ox, oy] of offsets) {
            const x = storage.pos.x + ox;
            const y = storage.pos.y + oy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            const binPosition = new RoomPosition(x, y, this.name);
            const binPositionStructures = binPosition.lookFor(LOOK_STRUCTURES);
            for (const building of binPositionStructures) {
                if (building.structureType == STRUCTURE_CONTAINER) {
                    this.memory.Structures.bin = building.id;
                    return building;
                }
            }
        }
    }
}
