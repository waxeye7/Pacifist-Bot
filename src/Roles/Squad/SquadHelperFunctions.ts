/**
 * One cost-matrix builder for all squad pathfinding. Every cost is written for the
 * 2x2 quad footprint anchored at the leader (top-left), which is why each blocker
 * also marks the three tiles up/left of itself.
 *
 * Variant differences are options:
 *  - swampCost / edgeCost: terrain weights
 *  - structuresFirst: SwampCostSame and GetReady apply structures before creeps,
 *    the combat matrix applies creeps first (order matters where both write a tile)
 *  - skipContainers: combat matrices ignore containers, GetReady does not
 *  - myStructCost: own structures block (255) in combat, cost 100 in GetReady
 *  - hostileStructCost: "stack" = 60, 120 if hit twice; otherwise a flat cost
 *  - controllerHits: combat-A prices a low-hits blocker at 100 instead of 255
 *  - creepCost: GetReady blocks creep tiles outright, combat softens to 10 when
 *    the surrounding footprint is cheap (creep likely to move)
 **/
const buildQuadCostMatrix = function (roomName: string, opts: any): boolean | CostMatrix {
    let room = Game.rooms[roomName];
    if (!room) {
        return false;
    }

    const single = opts.footprint == "single";
    let costs = new PathFinder.CostMatrix;
    const terrain = new Room.Terrain(roomName);

    // interior terrain: wall blocks, swamp costs, plain costs 0 unless the rest of
    // the footprint touches swamp; a wall anywhere in the footprint blocks the tile
    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255;
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = opts.swampCost;
            }
            else {
                weight = 0;
                if(!single &&
                   (terrain.get(x+1, y) == TERRAIN_MASK_SWAMP ||
                    terrain.get(x+1, y+1) == TERRAIN_MASK_SWAMP ||
                    terrain.get(x, y+1) == TERRAIN_MASK_SWAMP)) {
                    weight = opts.swampCost;
                }
            }
            if(!single && weight !== 255) {
                if(terrain.get(x+1, y) == TERRAIN_MASK_WALL ||
                   terrain.get(x, y+1) == TERRAIN_MASK_WALL ||
                   terrain.get(x+1, y+1) == TERRAIN_MASK_WALL) {
                    weight = 255;
                }
            }
            costs.set(x, y, weight);
        }
    }

    const footprintTiles = function (pos: any) {
        if(single) {
            return [[pos.x, pos.y]];
        }
        return [[pos.x, pos.y], [pos.x - 1, pos.y], [pos.x - 1, pos.y - 1], [pos.x, pos.y - 1]];
    };

    const applyStructures = function () {
        _.forEach(room.find(FIND_STRUCTURES), function(struct: any) {
            if(struct.structureType == STRUCTURE_RAMPART && struct.my ||
               struct.structureType == STRUCTURE_ROAD ||
               (opts.skipContainers && struct.structureType == STRUCTURE_CONTAINER)) {
                return;
            }

            const tiles = footprintTiles(struct.pos);
            if(struct.my) {
                for(const t of tiles) {
                    costs.set(t[0], t[1], opts.myStructCost);
                }
            }
            else if(struct.structureType !== STRUCTURE_CONTROLLER) {
                if(opts.hostileStructCost == "stack") {
                    for(const t of tiles) {
                        if(costs.get(t[0], t[1]) !== 255) {
                            costs.set(t[0], t[1], costs.get(t[0], t[1]) == 60 ? 120 : 60);
                        }
                    }
                }
                else {
                    // get-ready: the structure's own tile is always priced, the rest
                    // of the footprint only when not already blocked
                    costs.set(tiles[0][0], tiles[0][1], opts.hostileStructCost);
                    for(let i = 1; i < 4; i++) {
                        if(costs.get(tiles[i][0], tiles[i][1]) !== 255) {
                            costs.set(tiles[i][0], tiles[i][1], opts.hostileStructCost);
                        }
                    }
                }
            }
            else {
                const cost = (opts.controllerHits && struct.hits < 50000) ? 100 : 255;
                for(const t of tiles) {
                    costs.set(t[0], t[1], cost);
                }
            }
        });
    };

    const applyCreeps = function () {
        room.find(FIND_CREEPS).forEach(function(creep: any) {
            if(!creep.my || creep.memory.role == "carry" ||
               (creep.memory.role !== "SquadCreepA" && creep.memory.role !== "SquadCreepB" &&
                creep.memory.role !== "SquadCreepY" && creep.memory.role !== "SquadCreepZ")) {

                const tiles = footprintTiles(creep.pos);
                if(opts.creepCost == 255) {
                    for(const t of tiles) {
                        costs.set(t[0], t[1], 255);
                    }
                }
                else if(tiles.every(t => costs.get(t[0], t[1]) <= 5)) {
                    for(const t of tiles) {
                        costs.set(t[0], t[1], 10);
                    }
                }
                else {
                    for(const t of tiles) {
                        costs.set(t[0], t[1], 255);
                    }
                }
            }
        });
    };

    if(opts.structuresFirst) {
        applyStructures();
        applyCreeps();
    }
    else {
        applyCreeps();
        applyStructures();
    }

    // room border: walls block, exits get edgeCost, and an exit tile whose footprint
    // neighbor along the border is a wall blocks (the quad cannot straddle it)
    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                if(terrain.get(x, y) == TERRAIN_MASK_WALL) {
                    costs.set(x, y, 255);
                }
                else {
                    costs.set(x, y, opts.edgeCost);

                    if(!single && (y == 49 || y == 0) && terrain.get(x+1, y) == TERRAIN_MASK_WALL) {
                        costs.set(x, y, 255);
                    }
                    if(!single && (x == 49 || x == 0) && terrain.get(x, y+1) == TERRAIN_MASK_WALL) {
                        costs.set(x, y, 255);
                    }
                }
            }
        }
    }

    return costs;
};


const roomCallbackSquadA = (roomName: string): boolean | CostMatrix =>
    buildQuadCostMatrix(roomName, {swampCost: 5, edgeCost: 5, structuresFirst: false, skipContainers: true, myStructCost: 255, hostileStructCost: "stack", controllerHits: true});

const roomCallbackSquadASwampCostSame = (roomName: string): boolean | CostMatrix =>
    buildQuadCostMatrix(roomName, {swampCost: 1, edgeCost: 3, structuresFirst: true, skipContainers: true, myStructCost: 255, hostileStructCost: "stack", controllerHits: false});

const roomCallbackSquadGetReady = (roomName: string): boolean | CostMatrix =>
    buildQuadCostMatrix(roomName, {swampCost: 5, edgeCost: 15, structuresFirst: true, skipContainers: false, myStructCost: 100, hostileStructCost: 100, controllerHits: false, creepCost: 255});

// single-tile footprint for the 2-creep duo (the healer chases, so the leader
// paths like a lone creep but still prices hostile structures for kiting)
const roomCallbackDuo = (roomName: string): boolean | CostMatrix =>
    buildQuadCostMatrix(roomName, {swampCost: 5, edgeCost: 5, structuresFirst: false, skipContainers: true, myStructCost: 255, hostileStructCost: "stack", controllerHits: true, footprint: "single"});


export {roomCallbackSquadA, roomCallbackSquadASwampCostSame, roomCallbackSquadGetReady, roomCallbackDuo};
