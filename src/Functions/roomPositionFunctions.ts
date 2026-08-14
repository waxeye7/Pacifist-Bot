interface RoomPosition {
    getNearbyPositions:() => Array<RoomPosition>;
    getOpenPositions:() => Array<RoomPosition>;
    getOpenPositionsIgnoreCreeps:() => Array<RoomPosition>;
    getOpenPositionsIgnoreCreepsCheckStructs:() => Array<RoomPosition>;
}

RoomPosition.prototype.getNearbyPositions = function getNearbyPositions() {
    let positions = [];

    // clamp to 1..48: `this.x - 1 || 1` only guarded x=1 — standing ON an
    // exit tile (x=0) produced startX=-1 and a constructor throw every tick
    let startX = Math.max(1, this.x - 1);
    let startY = Math.max(1, this.y - 1);

    for(let x = startX; x <= this.x + 1 && x < 49; x++) {

        for(let y = startY; y <= this.y + 1 && y < 49; y++) {

            if (x !== this.x || y !== this.y) {
                positions.push(new RoomPosition(x, y, this.roomName));
            }
        }
    }
    return positions;
}


RoomPosition.prototype.getOpenPositions = function getOpenPositions() {
    let nearbyPositions = this.getNearbyPositions();

    let terrain = Game.map.getRoomTerrain(this.roomName);
    let walkablePositions = _.filter(nearbyPositions, function(pos:any) {
        return terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL;});

    let freePositions = _.filter(walkablePositions, function(pos) {
        return !pos.lookFor(LOOK_CREEPS).length;});

    return freePositions;
}

RoomPosition.prototype.getOpenPositionsIgnoreCreeps = function getOpenPositionsIgnoreCreeps() {
    let nearbyPositions = this.getNearbyPositions();

    let terrain = Game.map.getRoomTerrain(this.roomName);
    let walkablePositions = _.filter(nearbyPositions, function(pos:any) {
        return terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL;});

    return walkablePositions;
}

RoomPosition.prototype.getOpenPositionsIgnoreCreepsCheckStructs = function getOpenPositionsIgnoreCreepsCheckStructs() {
    let nearbyPositions = this.getNearbyPositions();

    let terrain = Game.map.getRoomTerrain(this.roomName);
    let walkablePositions = _.filter(nearbyPositions, function(pos:any) {
        return terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL && pos.x >= 1 && pos.x <= 48 && pos.y >= 1 && pos.y <= 48;});

    let freePositions = _.filter(walkablePositions, function(pos) {
        let lookStructures = pos.lookFor(LOOK_STRUCTURES)
        // every structure must be walkable: road+container / road+rampart
        // stacks used to fail the length==1 test and block claimers/priests
        return lookStructures.every(function(s) {
            return s.structureType == STRUCTURE_ROAD
                || s.structureType == STRUCTURE_CONTAINER
                || (s.structureType == STRUCTURE_RAMPART && (s.my || s.isPublic));
        });
    });

    return freePositions;
}
