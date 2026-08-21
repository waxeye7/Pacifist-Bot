import { getBasePlan, placeFromBasePlan, visualizeBasePlan, haulRoadTiles, haulRoadsIncomplete } from "utils/BasePlan";
import { syncPerimeterToConstructionMemory, SHELL_MIN_RCL } from "utils/Perimeter";
import { placeFromPlanV2, extensionTake, clearPlanSpawnTile, plannedSpawnTile } from "utils/PlanV2";
import { getFeatures, minCutWallsEnabled } from "utils/Features";
import { isExteriorPos } from "utils/Interior";
import { logAlways } from "utils/Logger";

/** Debug build markers only when Memory.verbose (kills yellow/orange circles) */
function vizCircle(roomName: string, x: number, y: number, style: any) {
    if (!Memory.verbose) return;
    new RoomVisual(roomName).circle(x, y, style);
}

/** RoomPosition throws outside 0..49. Returns null instead of constructing. */
function safePos(x, y, roomName) {
    if (x < 0 || x > 49 || y < 0 || y > 49) return null;
    return new RoomPosition(x, y, roomName);
}

let checkerboard =
[[-2,-2], [2,-2], [2,0],
[-3,-3], [-1,-3],[-1,3], [1,-3], [3,-3], [-3,-1],[-3,1], [-3,3], [1,3], [3,3],
[-4,-4],[-2,-4],[0,-4],[2,-4],[4,-4],[-4,-2],[-4,2],[-4,0],[4,0],[-4,4],[-2,4],[0,4],[2,4],[4,4],
[-5,-5],[-5,3],[-3,-5],[-1,-5],[1,-5],[3,-5],[5,-5],[-5,-3],[5,-3],[-5,1],[-5,-1],[5,3],[-5,5],[-3,5],[-1,5],[1,5],[3,5],[5,5],
[-6,-6],[-4,-6],[-2,-6],[0,-6],[2,-6],[4,-6],[6,-6],[-6,-4],[6,-4],[-6,-2],[-6,0],[-6,2],[6,-2],[6,0],[6,2],[-6,4],[6,4],[-6,6],[-4,6],[-2,6],[0,6],[2,6],[4,6],[6,6],
[-5,-7],[-3,-7],[-1,-7],[1,-7],[3,-7],[5,-7],[-7,-5],[-7,-3],[-7,-1],[-7,1],[-7,3],[-7,5],[-5,7],[-3,7],[-1,7],[1,7],[3,7],[5,7],[7,5],[7,3],[7,1],[7,-1],[7,-3],[7,-5],
[0,7],[7,0],[0,-7],[-7,0],[4,7],[-4,7],[7,4],[7,-4],[4,-7],[-4,-7],[-7,4],[-7,-4]];

function getNeighbours(tile, listOfLocations) {
    let neighbours = [];
    listOfLocations.forEach(function(delta) {
        neighbours.push({x: tile.x + delta[0], y: tile.y + delta[1]});
    });
    return neighbours;
}

/**
 * ---------------------------------------------------------------------------
 * LEGACY ROADS — ONE LINE PER DESTINATION, AND NOTHING PARALLEL TO IT.
 *
 * MEASURED, VPS W1N1 @ tick 87k, RCL4, legacy planning (no plan segment):
 *   roads on the ground          128
 *   basePlan road set            105   (anchored on basePlan.hub 30,34)
 *   built roads ON that set       58
 *   built roads OFF it            70   (anchored on storage 33,29)
 * i.e. the room is carrying TWO complete road networks between the same three
 * endpoints, laid from two anchors five tiles apart. That is the hatched
 * lattice in the owner's screenshot.
 *
 * Three independent generators fed it, and all three are closed here:
 *
 * 1. TWO OWNERS AT ONCE. construction() calls placeFromBasePlan(room, 8) while
 *    the room is `young` (RCL < 4 or no storage) — that placer paves
 *    hub -> spawn / controller / sources from basePlan.hub from RCL3. The
 *    legacy pathBuilder lines below pave storage -> sources / controller from
 *    RCL3 as well. The windows OVERLAP for the whole of RCL3-with-a-hub-
 *    container, so every legacy room lays both. `basePlanRoadsActive` in
 *    construction() now hands road duty to exactly one of them at a time.
 *
 * 2. NO ROAD PREFERENCE IN THE SEARCH. makeStructuresCostMatrix marks every
 *    non-road structure 255 and leaves roads at the terrain default — the
 *    `costs.set(..., 0)` for them is commented out (see that function). So a
 *    road already on the ground is worth exactly as much as bare plain, and
 *    every time an extension lands on a checkerboard tile the matrix changes
 *    and PathFinder is free to return a different equal-cost route. pathBuilder
 *    then paves THAT one too, and nothing ever removes the old one — it is in
 *    keepTheseRoads (62 entries in W1N1), so maintainers keep repairing it.
 *    makeRoadCostMatrix below prices an existing road at 1 against plain 2 and
 *    swamp 6, so the line snaps onto the network that is already there and
 *    stops drifting. It is used ONLY for road placement: container / link /
 *    rampart seats keep deriving from the original matrix, because moving those
 *    would move real structures.
 *
 * 3. NO SITE BUDGET. Each pathBuilder call paves its WHOLE path, and the only
 *    cap was `find(FIND_MY_CONSTRUCTION_SITES).length >= 12` on one of the four
 *    placement branches. claimRoadTile below gives the room ONE road-site
 *    budget for the whole pass, shared across every destination, and refuses a
 *    tile a sibling call already claimed this tick (createConstructionSite is
 *    not visible to lookFor until the tick ends, so sibling calls could
 *    otherwise stack intents on the same tile).
 * ---------------------------------------------------------------------------
 */
/** Road construction sites one legacy room may hold at once. */
const LEGACY_ROAD_SITE_CAP = 6;

let roadPassTick = -1;
let roadPassBudget: { [roomName: string]: number } = {};
let roadPassTiles: { [key: string]: boolean } = {};

function roadBudgetFor(room): number {
    if (roadPassTick !== Game.time) {
        roadPassTick = Game.time;
        roadPassBudget = {};
        roadPassTiles = {};
    }
    if (roadPassBudget[room.name] === undefined) {
        const open = room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: (s: any) => s.structureType == STRUCTURE_ROAD,
        }).length;
        roadPassBudget[room.name] = Math.max(0, LEGACY_ROAD_SITE_CAP - open);
    }
    return roadPassBudget[room.name];
}

/**
 * Claim one tile out of `room`'s road-site budget for this pass. Returns false
 * when the budget is spent or when another call in the same pass already took
 * this tile — the caller must then NOT create the site.
 */
function claimRoadTile(room, roomName: string, x: number, y: number): boolean {
    if (roadBudgetFor(room) <= 0) return false;
    const key = `${roomName}:${x + y * 50}`;
    if (roadPassTiles[key]) return false;
    roadPassTiles[key] = true;
    roadPassBudget[room.name]--;
    return true;
}

/**
 * The road-placement matrix: everything makeStructuresCostMatrix blocks, plus
 * an explicit price on what is already walkable. A road (built or sited) costs
 * 1, bare plain 2, swamp 6 — so a line will happily detour to reuse the
 * network rather than lay a second one beside it, and will not re-route the
 * moment an extension changes the cost landscape. Containers conduct at 1 as
 * well (a hauler walks them and they are never destroyed by a road site).
 */
const makeRoadCostMatrix = (roomName: string): boolean | CostMatrix => {
    const currentRoom = Game.rooms[roomName];
    if (!currentRoom) return false;
    const terrain = new Room.Terrain(roomName);
    const costs = new PathFinder.CostMatrix;
    for (let y = 0; y <= 49; y++) {
        for (let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            if (tile == TERRAIN_MASK_WALL) costs.set(x, y, 255);
            else if (tile == TERRAIN_MASK_SWAMP) costs.set(x, y, 6);
            else costs.set(x, y, 2);
        }
    }
    for (const building of currentRoom.find(FIND_STRUCTURES)) {
        if (building.structureType == STRUCTURE_ROAD || building.structureType == STRUCTURE_CONTAINER) {
            costs.set(building.pos.x, building.pos.y, 1);
        }
        else if (building.structureType != STRUCTURE_RAMPART) {
            costs.set(building.pos.x, building.pos.y, 255);
        }
    }
    for (const site of currentRoom.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (site.structureType == STRUCTURE_ROAD) costs.set(site.pos.x, site.pos.y, 1);
    }
    return costs;
};

/**
 * The one road line to `goal`. Separate from the container/link searches on
 * purpose — those must keep using makeStructuresCostMatrix so their seats do
 * not move (see the note above).
 */
function legacyRoadLine(room, from: RoomPosition, goal: RoomPosition, range: number) {
    return PathFinder.search(from, {pos: goal, range: range}, {
        plainCost: 2,
        swampCost: 6,
        maxRooms: 1,
        roomCallback: (roomName) => makeRoadCostMatrix(roomName),
    });
}

function pathBuilder(neighbors, structure, room, usingPathfinder=true) {
    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
    // Early RCL often has no storage/container yet — fall back to spawn as layout anchor.
    let spawn: any = Game.getObjectById(room.memory.Structures.spawn) || room.findSpawn();
    let anchor: any = storage || spawn;
    let buldingAlreadyHereCount = 0;
    let constructionSitesPlaced = 0;

    let keepTheseRoads = [];

    if (!anchor && structure == STRUCTURE_EXTENSION) {
        return 0;
    }

    if(structure == STRUCTURE_RAMPART && !usingPathfinder) {

        let listOfRampartPositions = []

        let positionArray = [];
        _.forEach(neighbors, function(block) {
            positionArray.push(new RoomPosition(block.x, block.y, room.name))
        });
        positionArray.sort((a,b) => a.findPathTo(storage, {ignoreCreeps:true}).length - b.findPathTo(storage, {ignoreCreeps:true}).length);
        _.forEach(positionArray, function(blockSpot) {
            vizCircle(blockSpot.roomName, blockSpot.x, blockSpot.y, {fill: 'transparent', radius: 0.25, stroke: '#000000'});
            let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);
            let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
            let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);

            for(let building of lookForExistingStructures) {
                if(building.structureType == STRUCTURE_RAMPART && building.hits > 5000000) {
                    return;
                }
            }

            if(lookForExistingConstructionSites.length > 0) {
                return;
            }

            if(lookForTerrain[0] != "swamp" && lookForTerrain[0] != "plain") {
                return;
            }


            let pathFromRampartToStorage = PathFinder.search(blockSpot, {pos:storage.pos, range:1}, {plainCost: 1, swampCost: 2, maxCost:50, roomCallback: () => RampartBorderCallbackFunction(room.name)});


            if(pathFromRampartToStorage.incomplete) {
                return;
            }



            let exits = Game.map.describeExits(room.name);
            let incomplete = true;
            if(exits[1] && incomplete) {

                let positionInRoom = new RoomPosition(25, 25, exits[1]);
                let pathFromRampartToOtherRoom = PathFinder.search(blockSpot, {pos:positionInRoom, range:22}, {plainCost: 1, swampCost: 1, maxCost:100, roomCallback: () => RampartBorderCallbackFunction(room.name)});


                if(!pathFromRampartToOtherRoom.incomplete) {
                    incomplete = false;
                }
            }


            if(exits[3] && incomplete) {

                let positionInRoom = new RoomPosition(25, 25, exits[3]);
                let pathFromRampartToOtherRoom = PathFinder.search(blockSpot, {pos:positionInRoom, range:22}, {plainCost: 1, swampCost: 1, maxCost:100, roomCallback: () => RampartBorderCallbackFunction(room.name)});


                if(!pathFromRampartToOtherRoom.incomplete) {
                    incomplete = false;
                }
            }

            if(exits[5] && incomplete) {

                let positionInRoom = new RoomPosition(25, 25, exits[5]);
                let pathFromRampartToOtherRoom = PathFinder.search(blockSpot, {pos:positionInRoom, range:22}, {plainCost: 1, swampCost: 1, maxCost:100, roomCallback: () => RampartBorderCallbackFunction(room.name)});


                if(!pathFromRampartToOtherRoom.incomplete) {
                    incomplete = false;
                }
            }
            if(exits[7] && incomplete) {

                let positionInRoom = new RoomPosition(25, 25, exits[7]);
                let pathFromRampartToOtherRoom = PathFinder.search(blockSpot, {pos:positionInRoom, range:22}, {plainCost: 1, swampCost: 1, maxCost:100, roomCallback: () => RampartBorderCallbackFunction(room.name)});


                if(!pathFromRampartToOtherRoom.incomplete) {
                    incomplete = false;
                }
            }


            if(incomplete) {
                if(lookForExistingStructures.length > 0) {
                    for(let i=0; i<lookForExistingStructures.length; i++) {
                        if(lookForExistingStructures[i].structureType == STRUCTURE_RAMPART) {
                            lookForExistingStructures[i].destroy();
                        }
                    }
                }
                return;
            }



            if(lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_RAMPART) {
                return;
            }




            if(lookForExistingStructures.length == 0) {
                listOfRampartPositions.push([blockSpot.x, blockSpot.y])
                // blockSpot.createConstructionSite(structure);
                return;
            }
            if(lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType != STRUCTURE_RAMPART && blockSpot.findPathTo(storage, {ignoreCreeps:true}).length <= 14) {
                // blockSpot.createConstructionSite(structure);
                listOfRampartPositions.push([blockSpot.x, blockSpot.y])
                return;
            }
            if(lookForExistingStructures.length == 2 && lookForExistingStructures[0].structureType != STRUCTURE_RAMPART && lookForExistingStructures[1].structureType != STRUCTURE_RAMPART) {
                // blockSpot.createConstructionSite(structure);
                listOfRampartPositions.push([blockSpot.x, blockSpot.y])
                return;
            }
        });
        room.memory.construction.rampartLocations = listOfRampartPositions;
    }


    if (structure == STRUCTURE_EXTENSION) {
        // Checkerboard used to fire createConstructionSite until the engine
        // refused (10 at RCL3). Race rooms have no planV2, so leftover-5
        // only holds if this path uses the same take as placeFromPlanV2.
        const extLvl = (room.controller && room.controller.level) || 0;
        const extEngine = ((CONTROLLER_STRUCTURES as any)[STRUCTURE_EXTENSION] || {})[extLvl] || 0;
        const extTake = extensionTake(extLvl, extEngine, room);
        const extHave =
            room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_EXTENSION }).length +
            room.find(FIND_MY_CONSTRUCTION_SITES, { filter: (s) => s.structureType == STRUCTURE_EXTENSION }).length;
        if (extHave >= extTake) return 0;
        let extLeft = extTake - extHave;
        let rampartsInRoomRange10FromStorage = room.find(FIND_MY_STRUCTURES).filter(function(s) {return s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(anchor) >= 8 && s.pos.getRangeTo(anchor) <= 10;});
        _.forEach(neighbors, function(block) {
            if (extLeft <= 0) return;
            if(block.x < 1 || block.x > 48 || block.y < 1 || block.y > 48) {
                return;
            }
            let blockSpot = new RoomPosition(block.x, block.y, room.name);
            let lookForExistingConstructionSites = blockSpot.lookFor(LOOK_CONSTRUCTION_SITES);
            let lookForExistingStructures = blockSpot.lookFor(LOOK_STRUCTURES);
            let lookForTerrain = blockSpot.lookFor(LOOK_TERRAIN);

            let sources = room.find(FIND_SOURCES);



            if(blockSpot.x <= 4 || blockSpot.x >= 45 || blockSpot.y <= 4 || blockSpot.y >= 45) {
                let closestRampart = blockSpot.findClosestByRange(rampartsInRoomRange10FromStorage)
                if(closestRampart && blockSpot.getRangeTo(closestRampart) < 3) {
                    return;
                }
            }

            for(let source of sources) {
                if(blockSpot.getRangeTo(source) <= 2) {
                    return;
                }
            }

            if(blockSpot.getRangeTo(anchor) > 10) {
                return;
            }

            let Mineral:any = Game.getObjectById(room.memory.mineral) || room.findMineral();

            if(blockSpot.getRangeTo(room.controller) <= 3 || (Mineral && blockSpot.getRangeTo(Mineral) <= 1)) {
                buldingAlreadyHereCount ++;
                return;
            }

            if(blockSpot.getRangeTo(anchor) > 10) {
                return;
            }

            if(anchor && PathFinder.search(blockSpot, anchor.pos).path.length > 11) {
                return;
            }

            if(anchor && anchor.pos.getRangeTo(blockSpot) == 7) {
                if(blockSpot.x >= anchor.pos.x) {
                    let lookForTerrainToLeft = new RoomPosition(blockSpot.x - 1,blockSpot.y, room.name).lookFor(LOOK_TERRAIN);
                    if(lookForTerrainToLeft[0] == "wall") {
                        return;
                    }
                }
                if(blockSpot.x <= anchor.pos.x) {
                    let lookForTerrainToRight = new RoomPosition(blockSpot.x + 1,blockSpot.y, room.name).lookFor(LOOK_TERRAIN);
                    if(lookForTerrainToRight[0] == "wall") {
                        return;
                    }
                }
                if(blockSpot.y >= anchor.pos.y) {
                    let lookForTerrainToTop = new RoomPosition(blockSpot.x,blockSpot.y - 1, room.name).lookFor(LOOK_TERRAIN);
                    if(lookForTerrainToTop[0] == "wall") {
                        return;
                    }
                }
                if(blockSpot.y <= anchor.pos.y) {
                    let lookForTerrainToBottom = new RoomPosition(blockSpot.x,blockSpot.y + 1, room.name).lookFor(LOOK_TERRAIN);
                    if(lookForTerrainToBottom[0] == "wall") {
                        return;
                    }
                }
            }


            vizCircle(blockSpot.roomName, blockSpot.x, blockSpot.y, {fill: '#000000', radius: 0.25, stroke: '#FABFAB'});

            if(lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_ROAD) {
                if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                    if (extLeft <= 0) return;
                    let result = blockSpot.createConstructionSite(structure);
                    if (result == OK) {
                        constructionSitesPlaced ++;
                        extLeft--;
                    }
                    // if(result == 0) {
                    // if(result !== -8 && result !== -14) {
                        // lookForExistingStructures[0].destroy();
                    // }
                }
            }



            if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
                buldingAlreadyHereCount ++;
                return;
            }


            if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                if (extLeft <= 0) return;
                const placed = blockSpot.createConstructionSite(structure);
                if (placed == OK) {
                    constructionSitesPlaced ++;
                    extLeft--;
                }
                return;
            }
        });
    }
    else if(!usingPathfinder && structure == STRUCTURE_ROAD) {
        _.forEach(neighbors, function(block) {
            if(block.x < 1 || block.x > 48 || block.y < 1 || block.y > 48) {
                return;
            }
            let lookForExistingConstructionSites = block.lookFor(LOOK_CONSTRUCTION_SITES);
            let lookForExistingStructures = block.lookFor(LOOK_STRUCTURES);
            let lookForTerrain = block.lookFor(LOOK_TERRAIN);

            if(structure == STRUCTURE_ROAD) {
                vizCircle(block.roomName, block.x, block.y, {fill: 'transparent', radius: 0.25, stroke: 'orange'});
            }

            _.forEach(lookForExistingStructures, function(building) {
                if(building.structureType == STRUCTURE_ROAD || building.structureType == STRUCTURE_CONTAINER) {
                    keepTheseRoads.push(building.id);
                }
            });

            _.forEach(keepTheseRoads, function(road) {
                if(Game.rooms[block.roomName] && Game.rooms[block.roomName].memory && Game.rooms[block.roomName].memory.keepTheseRoads && !_.includes(Game.rooms[block.roomName].memory.keepTheseRoads, road, 0)) {
                    Game.rooms[block.roomName].memory.keepTheseRoads.push(road);
                }
            });




            if(structure == STRUCTURE_ROAD && lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_RAMPART && lookForExistingConstructionSites.length == 0) {
                if(!claimRoadTile(room, block.roomName, block.x, block.y)) return;
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }

            if(structure == STRUCTURE_ROAD && lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_CONTAINER && lookForExistingConstructionSites.length == 0) {
                if(!claimRoadTile(room, block.roomName, block.x, block.y)) return;
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }



            if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
                buldingAlreadyHereCount ++;
                return;
            }


            if(lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                if(!claimRoadTile(room, block.roomName, block.x, block.y)) return;
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }
        });
    }
    else {
        _.forEach(neighbors.path, function(block) {
            if(block.x < 1 || block.x > 48 || block.y < 1 || block.y > 48) {
                return;
            }

            let lookForExistingConstructionSites = block.lookFor(LOOK_CONSTRUCTION_SITES);
            let lookForExistingStructures = block.lookFor(LOOK_STRUCTURES);
            let lookForTerrain = block.lookFor(LOOK_TERRAIN);

            if(structure == STRUCTURE_ROAD) {
                vizCircle(block.roomName, block.x, block.y, {fill: 'transparent', radius: 0.45, stroke: 'orange'});
            }

            _.forEach(lookForExistingStructures, function(building) {
                if(building.structureType == STRUCTURE_ROAD || building.structureType == STRUCTURE_CONTAINER) {
                    keepTheseRoads.push(building.id);
                }
            });

            _.forEach(keepTheseRoads, function(road) {
                if(Game.rooms[block.roomName] && Game.rooms[block.roomName].memory && Game.rooms[block.roomName].memory.keepTheseRoads && !_.includes(Game.rooms[block.roomName].memory.keepTheseRoads, road, 0)) {
                    Game.rooms[block.roomName].memory.keepTheseRoads.push(road);
                }
            });




            if(structure == STRUCTURE_ROAD && lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_RAMPART && lookForExistingConstructionSites.length == 0) {
                if(!claimRoadTile(room, block.roomName, block.x, block.y)) return;
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }

            if(structure == STRUCTURE_ROAD && lookForExistingStructures.length == 1 && lookForExistingStructures[0].structureType == STRUCTURE_CONTAINER && lookForExistingConstructionSites.length == 0) {
                if(!claimRoadTile(room, block.roomName, block.x, block.y)) return;
                constructionSitesPlaced ++;
                Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                return;
            }

            if(lookForExistingStructures.length != 0 || lookForExistingConstructionSites.length != 0) {
                buldingAlreadyHereCount ++;
                return;
            }

            if (lookForTerrain[0] == "swamp" || lookForTerrain[0] == "plain") {
                if(structure == STRUCTURE_ROAD && !claimRoadTile(room, block.roomName, block.x, block.y)) {
                    buldingAlreadyHereCount ++;
                    return;
                }
                else {
                    constructionSitesPlaced ++;
                    Game.rooms[block.roomName].createConstructionSite(block.x, block.y, structure);
                    return;
                }
            }
        });
    }

    console.log(room.name , structure, "[", buldingAlreadyHereCount, "buildings here already ]", "[", constructionSitesPlaced, "construction sites placed ]");
    return (buldingAlreadyHereCount + constructionSitesPlaced);
}



function rampartPerimeter(tile) {
    const perimeter =
    [[0,-12],[1,-12],[2,-12],[3,-12],[4,-12],[5,-12],[6,-12],[7,-12],[8,-12],[9,-12],[10,-12],[11,-12],[12,-12],
    [12,-11],[12,-10],[12,-9],[12,-8],[12,-7],[12,-6],[12,-5],[12,-4],[12,-3],[12,-2],[12,-1],[12,0],[12,1],[12,2],[12,3],[12,4],[12,5],[12,6],[12,7],[12,8],[12,9],[12,10],[12,11],[12,12],
    [11,12],[10,12],[9,12],[8,12],[7,12],[6,12],[5,12],[4,12],[3,12],[2,12],[1,12],[0,12],[-1,12],[-2,12],[-3,12],[-4,12],[-5,12],[-6,12],[-7,12],[-8,12],[-9,12],[-10,12],[-11,12],[-12,12],
    [-12,11],[-12,10],[-12,9],[-12,8],[-12,7],[-12,6],[-12,5],[-12,4],[-12,3],[-12,2],[-12,1],[-12,0],[-12,-1],[-12,-2],[-12,-3],[-12,-4],[-12,-5],[-12,-6],[-12,-7],[-12,-8],[-12,-9],[-12,-10],[-12,-11],[-12,-12],
    [-11,-12],[-10,-12],[-9,-12],[-8,-12],[-7,-12],[-6,-12],[-5,-12],[-4,-12],[-3,-12],[-2,-12],[-1,-12]];


    let neighbours = [];
    perimeter.forEach(function(delta) {
        neighbours.push({x: tile.x + delta[0], y: tile.y + delta[1]});
    });
    return neighbours;
}



/**
 * Where the legacy (non-planV2) bot thinks this room's spawn goes.
 * Colonisation target first, then the dynamic base plan. Null = we do not know,
 * which is worth a log line rather than silence.
 */
function legacySpawnTile(room): {x: number, y: number} | null {
    const tc: any = Memory.target_colonise;
    if (tc && tc.room == room.name && tc.spawn_pos &&
        typeof tc.spawn_pos.x == 'number' && typeof tc.spawn_pos.y == 'number' &&
        tc.spawn_pos.x >= 1 && tc.spawn_pos.x <= 48 &&
        tc.spawn_pos.y >= 1 && tc.spawn_pos.y <= 48) {
        return { x: tc.spawn_pos.x, y: tc.spawn_pos.y };
    }
    const bp: any = room.memory.basePlan;
    const planned = bp && bp.structures && bp.structures[STRUCTURE_SPAWN];
    if (planned && planned.length) return { x: planned[0].x, y: planned[0].y };
    return null;
}

/**
 * ---------------------------------------------------------------------------
 * SPAWN FIRST — the legacy half of the rule in utils/PlanV2 spawnFirstLockdown.
 *
 * A room with no spawn standing may hold exactly one kind of construction site:
 * a spawn. The legacy paths had the identical hole the plan path did, in two
 * places, and between them they meant a spawnless room could build extensions
 * for as long as it liked and never site a spawn at all:
 *
 *   · placeFromBasePlan (utils/BasePlan) orders STORAGE, CONTAINER, EXTENSION,
 *     TOWER, SPAWN and then gates the spawn with `rcl < 7 -> continue`
 *     ("extra spawns only"). So for a spawnless RCL1-3 room it happily sites
 *     containers and extensions and NEVER a spawn. This is where E15S6's four
 *     stray extension sites came from (35,22 / 35,24 / 35,26 / 36,27 — not one
 *     of them on the v2 plan the room later adopted).
 *
 *   · the one block that DID site a spawn (the target_colonise block further
 *     down) is gated on `controller.level == 1`. A fresh claim is upgraded to
 *     RCL2 by its own colonisation builder within a few hundred ticks, and from
 *     that moment the legacy bot has no spawn-site path whatsoever.
 *
 * Keyed on "no spawn structure", not on RCL: a room that loses its last spawn
 * at RCL7 is in exactly the same position as a fresh claim, and the same answer
 * is the right one.
 * ---------------------------------------------------------------------------
 */
function ensureSpawnFirst(room): void {
    let spawnSites = 0;
    let removed = 0;
    for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (site.structureType == STRUCTURE_SPAWN) { spawnSites++; continue; }
        site.remove();
        removed++;
    }
    if (removed) {
        console.log(`${room.name}: SPAWN FIRST — removed ${removed} non-spawn construction site(s); ` +
            `a room with no spawn standing builds nothing else`);
    }
    if (spawnSites) return;

    // The dynamic planner may still have to run once so we know WHERE the spawn
    // goes — but nothing is placed from it beyond that one tile.
    if (!room.memory.basePlan) getBasePlan(room);
    const tile = legacySpawnTile(room);
    if (!tile) {
        if (Game.time % 100 < 5) {
            console.log(`${room.name}: SPAWN FIRST — no spawn position known ` +
                `(no target_colonise entry, no basePlan spawn slot)`);
        }
        return;
    }
    const planned = plannedSpawnTile(room);
    const x = planned ? planned.x : tile.x;
    const y = planned ? planned.y : tile.y;
    clearPlanSpawnTile(room, x, y);
    const res = room.createConstructionSite(x, y, STRUCTURE_SPAWN);
    if (res !== OK && res !== ERR_FULL) {
        console.log(`${room.name}: SPAWN FIRST — spawn site ${x},${y} err ${res}`);
    }
}

/**
 * Legacy rooms never get planV2's controller bin. The 4W park only pays once a
 * live container sits range ≤4 of the controller and not on a source. Site one
 * at RCL3 (prefer chebyshev 3, plains, nearer the spawn). No source boxes.
 * RCL2 far-ctrl (slam-5 + Cheby>10) reverted — dest cargo on cycle-19;
 * next isolated seed must not site a depot on the 45k.
 */
function siteLegacyControllerDepot(room, spawn) {
    const ctrl = room.controller;
    if (!ctrl) return;
    if (ctrl.level !== 3) return;
    const sources = room.find(FIND_SOURCES);
    const isDepot = function (pos) {
        return pos.getRangeTo(ctrl) <= 4 && pos.findInRange(sources, 1).length === 0;
    };
    const standing = room.find(FIND_STRUCTURES, {
        filter: (s: any) => s.structureType == STRUCTURE_CONTAINER && isDepot(s.pos),
    });
    if (standing.length) return;
    const queued = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: (s: any) => s.structureType == STRUCTURE_CONTAINER && isDepot(s.pos),
    });
    if (queued.length) return;

    let best = null;
    let bestScore = -Infinity;
    for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
            const cheb = Math.max(Math.abs(dx), Math.abs(dy));
            if (cheb < 2 || cheb > 4) continue;
            const x = ctrl.pos.x + dx;
            const y = ctrl.pos.y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            const pos = new RoomPosition(x, y, room.name);
            if (!isDepot(pos)) continue;
            const terrain = pos.lookFor(LOOK_TERRAIN)[0];
            if (terrain === "wall") continue;
            const structs = pos.lookFor(LOOK_STRUCTURES);
            if (structs.some((s) => s.structureType != STRUCTURE_ROAD && s.structureType != STRUCTURE_RAMPART)) continue;
            if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length) continue;
            let score = cheb === 3 ? 30 : cheb === 2 ? 12 : 6;
            if (terrain !== "swamp") score += 20;
            if (spawn) score -= pos.getRangeTo(spawn);
            if (score > bestScore) {
                bestScore = score;
                best = pos;
            }
        }
    }
    if (best) room.createConstructionSite(best.x, best.y, STRUCTURE_CONTAINER);
}

function construction(room) {
    if(!room.memory.construction) {
        room.memory.construction = {};
    }

    // v2-planned rooms build ONLY from the adopted plan — legacy stamps,
    // basePlan and perimeter logic must never touch them. A far live spawn
    // is a hub-migrate job, not a reason to throw the pack away.
    if (room.memory.planV2) {
        // findExtractor — the ONLY writer of Structures.extractor, which gates
        // the MineralMiner rung — lives on the legacy path below this return,
        // so no planV2 room ever mined its mineral even with the extractor
        // standing (audit 2026-08-21: W1N1/W3N1/E37N59 all built, all idle).
        if (Game.time % 50 === 0 && room.controller && room.controller.level >= 6) {
            const st = room.memory.Structures || (room.memory.Structures = {});
            if (!(st.extractor && Game.getObjectById(st.extractor))) {
                delete st.extractor;
                room.findExtractor();
            }
        }
        placeFromPlanV2(room);
        return;
    }

    // SPAWN FIRST — legacy rooms. See ensureSpawnFirst. Nothing below this
    // point may run for a room that has no spawn: every placer down there
    // (placeFromBasePlan, the checkerboard extensions, the hub container, the
    // road pathBuilders) sites something that is not a spawn, and several of
    // them dereference the room's spawn and would throw anyway.
    if (room.controller && room.controller.my && room.find(FIND_MY_SPAWNS).length == 0) {
        ensureSpawnFirst(room);
        return;
    }

    relocateStrayTowers(room);

    // Leftover sites from a stripped/mismatched bunker (E37N59 x=47 roads).
    for (const s of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (s.pos.x <= 1 || s.pos.x >= 47 || s.pos.y <= 1 || s.pos.y >= 47) s.remove();
    }

    // ONE ROAD OWNER AT A TIME — see the note above pathBuilder. placeFromBasePlan
    // paves basePlan.hub -> spawn / controller / sources from RCL3; the legacy
    // pathBuilder lines further down pave storage -> sources / controller from
    // RCL3 too. While the basePlan placer is the one running, the legacy lines
    // stand down: two anchors paving the same three journeys is what put 128
    // roads and two complete networks into VPS W1N1.
    let basePlanRoadsActive = false;

    // Dynamic plan: always compute/visualize. Only AUTO-PLACE sites on young rooms.
    // Rooms that already have storage keep legacy construction (avoids dual-stamp site flood).
    if (room.controller && room.controller.my && !room.memory.danger) {
        getBasePlan(room);
        syncPerimeterToConstructionMemory(room);
        const hasStorage = !!room.storage;
        const young = room.controller.level < 4 || !hasStorage;
        if (young) {
            placeFromBasePlan(room, 8);
            // placeFromBasePlan paves the haul line after slam-5 (RCL2+).
            // Legacy pathBuilder stands down for the whole young window.
            basePlanRoadsActive = true;
        }
        if (Memory.verbose || Memory.showPlan) {
            visualizeBasePlan(room);
        }
    }

    // Clear stray road sites along exits / remote corridors until base is mature
    if (room.controller && room.controller.level < SHELL_MIN_RCL) {
        // Roads on the planned wall are shell infrastructure and must not be
        // built before the shell exists (see placeFromBasePlan). Sweep any that
        // an older plan version already queued — the shell can sit 12+ tiles
        // out, so the "far from spawn" rule below does not catch all of them.
        const shellTiles = new Set<string>();
        const bp: any = room.memory.basePlan;
        if (bp) {
            for (const t of (bp.perimeter || []).concat(bp.ramps || [])) {
                shellTiles.add(`${t.x},${t.y}`);
            }
        }
        const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: (s) => s.structureType == STRUCTURE_ROAD,
        });
        const haulKeys = new Set<string>();
        if (bp) {
            for (const t of haulRoadTiles(room, bp)) haulKeys.add(`${t.x},${t.y}`);
            const n = bp.arterialN || 0;
            for (const t of ((bp.structures && bp.structures.road) || []).slice(0, n)) {
                haulKeys.add(`${t.x},${t.y}`);
            }
        }
        for (const site of sites) {
            // edge tiles (pathing to remotes) or far from spawn
            const onEdge = site.pos.x <= 1 || site.pos.x >= 48 || site.pos.y <= 1 || site.pos.y >= 48;
            let far = false;
            const spawn: any = Game.getObjectById(room.memory.Structures && room.memory.Structures.spawn);
            if (spawn && site.pos.getRangeTo(spawn) > 12) far = true;
            const onShell = shellTiles.has(`${site.pos.x},${site.pos.y}`);
            const haul = haulKeys.has(`${site.pos.x},${site.pos.y}`);
            // RCL2 pave stole the 45k (E16S9 L3 31858 / 62 roads). Drop
            // leftover road sites so builders stand down until RCL3.
            if (room.controller.level < 3) {
                site.remove();
                continue;
            }
            // Cycle-17: far>12 deleted the hub→ctrl line (E12S3 spawn→ctrl 14).
            if (haul) continue;
            if (onEdge || far || onShell) site.remove();
            else if (haulKeys.size) site.remove();
        }
        // Source boxes wait until the haul line is standing — 5k each
        // vs 300e/road. Keep the hub tile and the controller depot.
        if (room.controller.level === 3 && room.energyCapacityAvailable >= 550 && haulRoadsIncomplete(room, bp)) {
            const sources = room.find(FIND_SOURCES);
            for (const site of room.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: (s) => s.structureType == STRUCTURE_CONTAINER,
            })) {
                const nearSource = sources.some((s) => site.pos.getRangeTo(s) <= 1);
                const depot = site.pos.getRangeTo(room.controller) <= 4 && !nearSource;
                const hubTile = bp && bp.hub && site.pos.x === bp.hub.x && site.pos.y === bp.hub.y;
                if (nearSource && !depot && !hubTile) site.remove();
            }
        }
    }

    // leftover-5 at L4: take stays 5 until storage STANDS. Pre-queued
    // ext sites (E13S7 15, live E36N57 10) hog builders off the 30k box.
    // Strip them; they re-site after room.storage.my.
    if (room.controller && room.controller.my && room.controller.level === 4
        && !(room.storage && room.storage.my)) {
        const extSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: (s) => s.structureType === STRUCTURE_EXTENSION,
        });
        for (const site of extSites) site.remove();
    }

    // Perimeter always from basePlan (min-cut) — square shell removed
    if (room.memory.basePlan && room.memory.basePlan.perimeter) {
        syncPerimeterToConstructionMemory(room);
    }


    if(room.controller.level == 1 && room.find(FIND_MY_SPAWNS).length == 0 && room.find(FIND_MY_CONSTRUCTION_SITES).length == 0 && Memory.target_colonise.room == room.name) {
        let position = Memory.target_colonise.spawn_pos
        Game.rooms[Memory.target_colonise.room].createConstructionSite(position.x, position.y, STRUCTURE_SPAWN);
        return;
    }

    if(room.controller.level === 1 || room.controller.level === 2) {
        let walls = room.find(FIND_STRUCTURES, {filter: (s) => s.structureType == STRUCTURE_WALL});
        for(let wall of walls) {
            wall.destroy();
        }
    }



    if(room.memory.danger) {
        return;
    }

    let myConstructionSites = room.find(FIND_MY_CONSTRUCTION_SITES).length





    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

    if(room.controller.level >= 5) {
        let nukes = room.find(FIND_NUKES);
        if(nukes.length > 4) {
            for(let nuke of nukes) {
                if(nuke.pos.getRangeTo(storage) > 7 && nuke.pos.getRangeTo(storage) < 13 && nuke.pos.x <= 44 && nuke.pos.y <= 44 && nuke.pos.x >= 5 && nuke.pos.y >= 5) {
                    let perimeter = [
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y - 1, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y + 1, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y - 2, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y + 2, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x + 3, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x + 2, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x + 2, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x + 1, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x + 1, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y - 1, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y + 1, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y - 2, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y + 2, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x - 3, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x - 2, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x - 2, nuke.pos.y + 3, room.name),
                        new RoomPosition(nuke.pos.x - 1, nuke.pos.y - 3, room.name),
                        new RoomPosition(nuke.pos.x - 1, nuke.pos.y + 3, room.name)
                    ];
                    for(let position of perimeter) {
                        if(position.getRangeTo(storage) > 10) {
                            position.createConstructionSite(STRUCTURE_RAMPART);
                        }
                    }
                }
            }
        }
    }


    // LEGACY square shell: a +/-10 band of ramparts around storage. Superseded
    // by the min-cut / plan perimeter and gated off by default
    // (Memory.features.squareWalls, DEFAULTS false).
    //
    // It was not merely redundant, it was destructive: pathBuilder(...,
    // STRUCTURE_RAMPART, ...) ends with `room.memory.construction
    // .rampartLocations = listOfRampartPositions` (see the STRUCTURE_RAMPART
    // branch above), so every run OVERWROTE the perimeter list that
    // syncPerimeterToConstructionMemory had just written — usually with [],
    // because the band tiles already have structures/complete paths. An empty
    // rampartLocations silently disables the RampartErector spawn gate, so the
    // shell was never erected or maintained as a set; only the stray sites that
    // placeFromBasePlan managed to squeeze in got built, and then decayed.
    if (!minCutWallsEnabled() && getFeatures().squareWalls &&
        room.controller.level >= 3 && storage && myConstructionSites == 0) {

        let rampartLocations = [];
        for (let i = -10; i <= 10; i++) {
            for (let o = -10; o <= 10; o++) {
                let combinedX = storage.pos.x + i;
                let combinedY = storage.pos.y + o;

                // Ensure combinedX is within the boundaries
                if (combinedX < 2) combinedX = 2;
                if (combinedX > 47) combinedX = 47;

                // Ensure combinedY is within the boundaries
                if (combinedY < 2) combinedY = 2;
                if (combinedY > 47) combinedY = 47;

                if (Math.abs(i) == 10 || Math.abs(o) == 10) {
                    // Adjust to ensure they remain as close to 10 away as possible within bounds
                    let adjustedX = storage.pos.x + (i < 0 ? -10 : 10);
                    let adjustedY = storage.pos.y + (o < 0 ? -10 : 10);

                    // Ensure the adjusted positions are within bounds
                    if (adjustedX < 2) adjustedX = 2;
                    if (adjustedX > 47) adjustedX = 47;

                    if (adjustedY < 2) adjustedY = 2;
                    if (adjustedY > 47) adjustedY = 47;

                    rampartLocations.push([adjustedX, adjustedY]);
                }
            }
        }

        let storageRampartNeighbors = getNeighbours(storage.pos, rampartLocations);
        let filteredStorageRampartNeighbors = storageRampartNeighbors.filter(position => position.x > 0 && position.x < 49 && position.y > 0 && position.y < 49);
        pathBuilder(filteredStorageRampartNeighbors, STRUCTURE_RAMPART, room, false);
    }




    if(room.controller.level >= 1 && room.memory.Structures.spawn) {
        let spawn = Game.getObjectById(room.memory.Structures.spawn) || room.findSpawn();

        // if(room.controller.level >= 3) {
        //     if(spawn) {
        //         let spawnlocationlook = spawn.pos.lookFor(LOOK_STRUCTURES);
        //         if(spawnlocationlook.length == 1) {
        //             spawn.pos.createConstructionSite(STRUCTURE_RAMPART);
        //         }
        //     }
        //     if(storage) {
        //         let storagelocationlook = storage.pos.lookFor(LOOK_STRUCTURES);
        //         if(storagelocationlook.length == 1) {
        //             storage.pos.createConstructionSite(STRUCTURE_RAMPART);
        //         }
        //     }
        // }

            // var index = array.indexOf(item);
            // if (index !== -1) {
            //   array.splice(index, 1);
            // }

            // Spawn-tile rampart: same RCL gate as the shell. Below RCL4 this
            // was the one rampart in the room anything bothered to repair
            // (maintainer/SpecialRepair pick the lowest-hits rampart), so a
            // young room poured its repair budget into a single 1M-hit tile
            // while every wall tile decayed at 300/100t.
            if(spawn && room.controller.level >= SHELL_MIN_RCL) {
                let spawnlocationlook = spawn.pos.lookFor(LOOK_STRUCTURES);
                if(spawnlocationlook.length == 1) {
                    spawn.pos.createConstructionSite(STRUCTURE_RAMPART);
                }
            }

            if(storage ) {
                let LabLocations = [];

                let first_location_good = true;
                let testLabLocations = [];
                // Check if storage is far enough from edges
                if(storage.pos.x >= 5 && storage.pos.y <= 46) {
                    testLabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 1, room.name));
                    testLabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 2, room.name));
                    testLabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y, room.name));
                    testLabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 1, room.name));
                    testLabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 2, room.name));
                    testLabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 3, room.name));
                    testLabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 3, room.name));
                    testLabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 2, room.name));
                    testLabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 1, room.name));
                    testLabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y, room.name));
                } else {
                    first_location_good = false;
                }
                for(let location of testLabLocations) {
                    let lookForWall = location.lookFor(LOOK_TERRAIN);
                    if(lookForWall.length > 0) {
                        if(lookForWall[0] == "wall") {
                            first_location_good = false;
                        }
                    }
                }


                if(first_location_good) {
                    LabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 1, room.name));

                    LabLocations.push(new RoomPosition(storage.pos.x - 4, storage.pos.y + 2, room.name));

                    LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y, room.name));

                    if(room.controller.level >= 7) {
                        LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 1, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 2, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 3, storage.pos.y + 3, room.name));
                    }
                    if(room.controller.level == 8) {
                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 3, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 2, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y + 1, room.name));

                        LabLocations.push(new RoomPosition(storage.pos.x - 5, storage.pos.y, room.name));
                    }

                }
                else if(!first_location_good) {
                    LabLocations = [];

                    // This arm runs when storage is too close to the left/bottom
                    // edge for the primary cluster. Offsets +4..+6 then land
                    // outside 0..49 and RoomPosition throws — skip those tiles.
                    const addLab = function(dx, dy) {
                        const p = safePos(storage.pos.x + dx, storage.pos.y + dy, room.name);
                        if(p) LabLocations.push(p);
                    };

                    addLab(4, 4);

                    addLab(4, 5);

                    addLab(3, 3);

                    if(room.controller.level >= 7) {
                        addLab(3, 4);

                        addLab(3, 5);

                        addLab(3, 6);
                    }
                    if(room.controller.level == 8) {
                        addLab(5, 3);

                        addLab(5, 4);

                        addLab(5, 5);

                        addLab(5, 6);
                    }
                }


                if(!first_location_good) {

                    checkerboard = [
                        [-2,-2], [2,-2], [2,0],
                        [-3,-3], [-1,-3],[-1,3], [1,-3], [3,-3], [-3,-1],[-3,1], [-3,3], [1,3],[-3,-2],[-3,2],[3,-2],[3,1],[3,-1],
                        [-4,-4],[-2,-4],[0,-4],[2,-4],[4,-4],[-4,-2],[-4,2],[-4,0],[-4,4],[-2,4],[0,4],[4,2],[4,-2],
                        [-5,-5],[-5,3],[-3,-5],[-1,-5],[1,-5],[3,-5],[5,-5],[-5,-3],[5,-3],[-5,1],[-5,-1],[-5,5],[-3,5],[-1,5],[1,5],[0,5],[0,-5],[-5,0],[5,1],[5,-1],
                        [-6,-6],[-4,-6],[-2,-6],[0,-6],[2,-6],[4,-6],[6,-6],[-6,-4],[6,-4],[-6,-2],[-6,0],[-6,2],[6,-2],[6,0],[6,2],[-6,4],[-6,6],[-4,6],[-2,6],[0,6],[2,6],[4,6],[6,6],
                        [-5,-7],[-3,-7],[-1,-7],[1,-7],[3,-7],[5,-7],[-7,-5],[-7,-3],[-7,-1],[-7,1],[-7,3],[-7,5],[-5,7],[-3,7],[-1,7],[1,7],[3,7],[5,7],[7,5],[7,3],[7,1],[7,-1],[7,-3],[7,-5],
                        [0,7],[7,0],[0,-7],[-7,0],[4,7],[-4,7],[7,4],[7,-4],[4,-7],[-4,-7],[-7,4],[-7,-4]
                    ];

                }
                else {
                    checkerboard = [
                        [-2,-2], [2,-2], [2,0],
                        [-3,-3], [-1,-3],[-1,3], [1,-3], [3,-3], [1,3], [3,3],[-3,-2],[3,-2],[3,-1],[3,1],
                        [-4,-4],[-2,-4],[0,-4],[2,-4],[4,-4],[-4,-2],[-4,4],[-2,4],[0,4],[2,4],[4,4],[4,-2],[4,2],
                        [-5,-5],[-3,-5],[-1,-5],[1,-5],[3,-5],[5,-5],[-5,-3],[5,-3],[-5,-1],[5,3],[-5,5],[-3,5],[-1,5],[1,5],[3,5],[5,5],[0,5],[0,-5],[5,1],[5,-1],
                        [-6,-6],[-4,-6],[-2,-6],[0,-6],[2,-6],[4,-6],[6,-6],[-6,-4],[6,-4],[-6,-2],[6,-2],[6,0],[6,2],[-6,4],[6,4],[-6,6],[-4,6],[-2,6],[0,6],[2,6],[4,6],[6,6],
                        [-5,-7],[-3,-7],[-1,-7],[1,-7],[3,-7],[5,-7],[-7,-5],[-7,-3],[-7,-1],[-7,5],[-5,7],[-3,7],[-1,7],[1,7],[3,7],[5,7],[7,5],[7,3],[7,1],[7,-1],[7,-3],[7,-5],
                        [0,7],[7,0],[0,-7],[4,7],[-4,7],[7,4],[7,-4],[4,-7],[-4,-7],[-7,4],[-7,-4]
                    ];

                }

                if(room.controller.level >= 6 && room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LAB);}}).length <= 10) {

                    DestroyAndBuild(room, LabLocations, STRUCTURE_LAB);

                }
                let labsInRoom = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LAB);}})
                if(labsInRoom.length > 0) {
                    for(let lab of labsInRoom) {
                        if(lab.pos.lookFor(LOOK_STRUCTURES).length == 1) {
                            lab.pos.createConstructionSite(STRUCTURE_RAMPART);
                        }
                    }
                }
            }





        if(storage) {
            // storage.y+1 is out of 0..49 when the hub sits on y=49 (legacy
            // spawn can be y=48). RoomPosition would throw and abort the room loop.
            let binLocation = safePos(storage.pos.x, storage.pos.y + 1, room.name);
            if(binLocation) {
            let lookForExistingStructuresOnBinLocation = binLocation.lookFor(LOOK_STRUCTURES);
            if(lookForExistingStructuresOnBinLocation.length > 0) {
                for(let existingStructure of lookForExistingStructuresOnBinLocation) {
                    if(existingStructure.structureType == STRUCTURE_ROAD) {
                        if(room.memory.keepTheseRoads && !_.includes(room.memory.keepTheseRoads, existingStructure.id, 0)) {
                            room.memory.keepTheseRoads.push(existingStructure.id);
                        }
                    }
                    if(existingStructure.structureType != STRUCTURE_CONTAINER && existingStructure.structureType != STRUCTURE_ROAD && existingStructure.structureType != STRUCTURE_SPAWN && existingStructure.structureType != STRUCTURE_STORAGE) {
                        existingStructure.destroy();
                    }
                }
            }
            else if(room.energyCapacityAvailable > 500) {
                binLocation.createConstructionSite(STRUCTURE_CONTAINER);
            }
            if(lookForExistingStructuresOnBinLocation.length == 1 && lookForExistingStructuresOnBinLocation[0].structureType == STRUCTURE_ROAD) {
                binLocation.createConstructionSite(STRUCTURE_CONTAINER);
            }

            if(room.controller.level > 4 && lookForExistingStructuresOnBinLocation.length == 1 && lookForExistingStructuresOnBinLocation[0].structureType == STRUCTURE_CONTAINER) {
                binLocation.createConstructionSite(STRUCTURE_ROAD);
            }
            }
        }


        // ONE hub container. This block used to walk a ring of spawn+/-2
        // offsets and place a container at the first free tile, with no memory
        // of the ones it had already placed and no awareness of the hub
        // container the base plan puts on the storage tile. A room could end up
        // with two or three "hub" sinks within 4 tiles of the spawn; fillers and
        // carriers then shuttle between them across untraded tiles, which is the
        // clump the owner is seeing at the spawn. Skip entirely once any
        // container already serves the spawn area.
        const hubContainers = room.find(FIND_STRUCTURES, {
            filter: (s: any) =>
                s.structureType == STRUCTURE_CONTAINER && s.pos.getRangeTo(spawn) <= 4
        });
        // placeFromBasePlan's hub site is invisible to FIND_STRUCTURES; count
        // it or we drop a second sink next to spawn.
        const hubContainerSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: (s: any) =>
                s.structureType == STRUCTURE_CONTAINER && s.pos.getRangeTo(spawn) <= 4
        });
        if ((room.controller.level == 2 || room.controller.level == 3) && hubContainers.length == 0 && hubContainerSites.length == 0) {
            // Preferred hub container is spawn.y-2 (legacy layout). If that tile is blocked
            // (controller, wall, other structure), try nearby offsets instead of stalling forever.
            const containerOffsets = [
                [0, -2], [0, 2], [-2, 0], [2, 0], [-1, -2], [1, -2], [-2, -1], [2, -1],
            ];
            let placedOrPresent = false;
            for (let i = 0; i < containerOffsets.length; i++) {
                const ox = containerOffsets[i][0];
                const oy = containerOffsets[i][1];
                const x = spawn.pos.x + ox;
                const y = spawn.pos.y + oy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                const storageLocation = new RoomPosition(x, y, room.name);
                if (room.controller && storageLocation.isEqualTo(room.controller.pos)) continue;
                const terrain = storageLocation.lookFor(LOOK_TERRAIN)[0];
                if (terrain === "wall") continue;
                const lookForExistingStructures = storageLocation.lookFor(LOOK_STRUCTURES);
                const hasContainer = lookForExistingStructures.some(function (s) {
                    return s.structureType == STRUCTURE_CONTAINER;
                });
                if (hasContainer) {
                    placedOrPresent = true;
                    break;
                }
                const sites = storageLocation.lookFor(LOOK_CONSTRUCTION_SITES);
                // A road/extension site is not a hub. Breaking here skipped
                // later offsets and either dual-sited or placed nothing.
                if (sites.some(function (s) { return s.structureType == STRUCTURE_CONTAINER; })) {
                    placedOrPresent = true;
                    break;
                }
                if (sites.length > 0) continue;
                // Don't destroy critical structures; only skip occupied tiles.
                const blocking = lookForExistingStructures.filter(function (s) {
                    return s.structureType != STRUCTURE_ROAD && s.structureType != STRUCTURE_RAMPART;
                });
                if (blocking.length > 0) continue;
                const result = room.createConstructionSite(x, y, STRUCTURE_CONTAINER);
                if (result == OK) {
                    placedOrPresent = true;
                    break;
                }
            }
        }
        if (spawn) siteLegacyControllerDepot(room, spawn);
        // spawn.y-2 is the legacy storage seat. legacySpawnTile allows y>=1,
        // so y-2 can be -1 and RoomPosition throws.
        let storageLocation = safePos(spawn.pos.x, spawn.pos.y -2, room.name);
        if(storageLocation) {
            let lookForExistingStructures = storageLocation.lookFor(LOOK_STRUCTURES);
            // placeFromBasePlan already queued storage at the hub; a second
            // site at spawn.y-2 dual-stamps and lookFor[0] is often the road.
            const storageAlreadyQueued = room.find(FIND_MY_CONSTRUCTION_SITES, {
                filter: (s: any) => s.structureType == STRUCTURE_STORAGE
            }).length > 0;
            if(!storageAlreadyQueued && (room.controller.level >= 4 && !storage || room.controller.level == 4 && storage.structureType == STRUCTURE_CONTAINER)) {
                let destroyedContainer = false;
                for(let building of lookForExistingStructures) {
                    if(building.structureType == STRUCTURE_CONTAINER) {
                        building.destroy();
                        destroyedContainer = true;
                    }
                }
                if(!destroyedContainer) {
                    const blocking = lookForExistingStructures.filter(function(s) {
                        return s.structureType != STRUCTURE_ROAD && s.structureType != STRUCTURE_RAMPART;
                    });
                    if(blocking.length == 0) {
                        room.createConstructionSite(spawn.pos.x, spawn.pos.y -2, STRUCTURE_STORAGE);
                    }
                }
            }
        }


        if(room.controller.level >= 1) {
            let sources = room.find(FIND_SOURCES);
            if(storage) {
                // Nearest source first (chebyshev to hub / storage). Still gated
                // level >= 3. Does not site a source at RCL2.
                const origin = storage.pos;
                sources = sources.slice().sort((a, b) => {
                    const da = Math.max(Math.abs(a.pos.x - origin.x), Math.abs(a.pos.y - origin.y));
                    const db = Math.max(Math.abs(b.pos.x - origin.x), Math.abs(b.pos.y - origin.y));
                    return da - db;
                });
                let container1;
                if(sources.length > 0) {
                    // Re-pathing every pass moves the seat when the matrix
                    // changes; pin to an existing source container/site first.
                    const pinned1 = sources[0].pos.findInRange(FIND_STRUCTURES, 1, {filter: (s: any) => s.structureType == STRUCTURE_CONTAINER});
                    const pinned1Site = sources[0].pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {filter: (s: any) => s.structureType == STRUCTURE_CONTAINER});
                    if(pinned1.length > 0) {
                        container1 = pinned1[0].pos;
                    } else if(pinned1Site.length > 0) {
                        container1 = pinned1Site[0].pos;
                    } else {
                    let pathFromStorageToSource1 = PathFinder.search(storage.pos, {pos:sources[0].pos, range:1}, {plainCost: 1, swampCost: 3, maxRooms:1, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});
                    // empty path when storage is already adjacent to the source
                    container1 = pathFromStorageToSource1.path.length > 0 ? pathFromStorageToSource1.path[pathFromStorageToSource1.path.length - 1] : undefined;
                    }
                    // if(room.controller.level >= 6) {
                    //     pathFromStorageToSource1.path.pop();
                    // }
                    if(container1 && storage.pos.getRangeTo(container1) > 7 && room.controller.level >= 6) {
                        container1.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }

                // 1-source rooms have no sources[1]; unguarded access throws and
                // aborts the rest of construction() plus later rooms that tick.
                let container2;
                if(sources.length > 1) {
                    const pinned2 = sources[1].pos.findInRange(FIND_STRUCTURES, 1, {filter: (s: any) => s.structureType == STRUCTURE_CONTAINER});
                    const pinned2Site = sources[1].pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {filter: (s: any) => s.structureType == STRUCTURE_CONTAINER});
                    if(pinned2.length > 0) {
                        container2 = pinned2[0].pos;
                    } else if(pinned2Site.length > 0) {
                        container2 = pinned2Site[0].pos;
                    } else {
                    let pathFromStorageToSource2 = PathFinder.search(storage.pos, {pos:sources[1].pos, range:1}, {plainCost: 1, swampCost: 3, maxRooms:1, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});
                    container2 = pathFromStorageToSource2.path.length > 0 ? pathFromStorageToSource2.path[pathFromStorageToSource2.path.length - 1] : undefined;
                    }
                    // if(room.controller.level >= 6) {
                    //     pathFromStorageToSource2.path.pop();
                    // }
                    if(container2 && storage.pos.getRangeTo(container2) > 7 && room.controller.level >= 6) {
                        container2.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }

                let pathFromStorageToController = PathFinder.search(storage.pos, {pos:room.controller.pos, range:2}, {plainCost: 1, swampCost: 3, maxRooms:1, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});

                // range:2 then pop: storage already within 3 of the controller
                // leaves the path empty and linkLocation undefined → lookFor throws.
                if(pathFromStorageToController.path.length > 0) {
                    pathFromStorageToController.path.pop();
                }

                let linkLocation = pathFromStorageToController.path.length > 0 ? pathFromStorageToController.path[pathFromStorageToController.path.length - 1] : undefined;


                let mySpawns = room.find(FIND_MY_SPAWNS);

                if(linkLocation && room.controller.level <= 6 && room.controller.level >= 3) {
                    // Path flip sites a second controller depot; keep one
                    // within 3 that is not a source container.
                    const nearbyCtrlBox = room.controller.pos.findInRange(FIND_STRUCTURES, 3, {
                        filter: (s: any) => s.structureType == STRUCTURE_CONTAINER && s.pos.findInRange(FIND_SOURCES, 1).length == 0
                    });
                    const nearbyCtrlBoxSite = room.controller.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3, {
                        filter: (s: any) => s.structureType == STRUCTURE_CONTAINER
                    });
                    if(nearbyCtrlBox.length == 0 && nearbyCtrlBoxSite.length == 0) {
                        let lookStructs = linkLocation.lookFor(LOOK_STRUCTURES);
                        let foundContainer = false;
                        for(let building of lookStructs) {
                            if(building.structureType == STRUCTURE_TOWER || building.structureType == STRUCTURE_EXTENSION) {
                                building.destroy();
                            }
                            else if(building.structureType == STRUCTURE_CONTAINER) {
                                foundContainer = true;
                            }
                        }
                        if(!foundContainer) {
                            linkLocation.createConstructionSite(STRUCTURE_CONTAINER);
                        }
                    }
                }
                if(room.controller.level >= 7) {
                    if(linkLocation) {
                        let lookStructs = linkLocation.lookFor(LOOK_STRUCTURES);
                        for(let building of lookStructs) {
                            if(building.structureType !== STRUCTURE_LINK && building.structureType !== STRUCTURE_RAMPART && building.structureType !== STRUCTURE_ROAD) {
                                building.destroy();
                            }
                        }

                        let links = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LINK);}});
                        // Place when no existing CONTROLLER link is within 3.
                        // A hub or source-adjacent link inside that radius is
                        // not a depot (same filters as upgrader controllerDepot);
                        // treating them as "already exists" skipped the real
                        // controller link in compact rooms.
                        const sourcesNearCtrl = room.find(FIND_SOURCES);
                        const storageLinkId = room.memory.Structures && room.memory.Structures.StorageLink;
                        const ctrlDepotLinks = links.filter(function(l: any) {
                            return l.id !== storageLinkId && l.pos.findInRange(sourcesNearCtrl, 1).length == 0;
                        });
                        let closestLinkToController = room.controller.pos.findClosestByRange(ctrlDepotLinks);
                        if(!closestLinkToController || room.controller.pos.getRangeTo(closestLinkToController) > 3) {
                            let currentControllerLink:any = Game.getObjectById(room.memory.Structures.controllerLink);
                            const keyIsRealCtrlLink = currentControllerLink &&
                                currentControllerLink.structureType == STRUCTURE_LINK &&
                                currentControllerLink.id !== storageLinkId &&
                                currentControllerLink.pos.findInRange(sourcesNearCtrl, 1).length == 0;
                            if(!keyIsRealCtrlLink) {
                                room.createConstructionSite(linkLocation.x, linkLocation.y, STRUCTURE_LINK);
                            }
                        }
                    }


                    if(mySpawns.length < 2 && storage) {
                        let secondSpawnPosition = new RoomPosition(storage.pos.x, storage.pos.y - 2, room.name);
                        vizCircle(room.name, secondSpawnPosition.x, secondSpawnPosition.y, {fill: 'transparent', radius: .75, stroke: '#BABABA'});
                        let listOfSpawnPositions = [];
                        listOfSpawnPositions.push(secondSpawnPosition);


                        DestroyAndBuild(room, listOfSpawnPositions, STRUCTURE_SPAWN);
                    }


                }

                if(room.controller.level == 8 && mySpawns.length == 2) {
                    let thirdSpawnPosition = new RoomPosition(storage.pos.x + 2, storage.pos.y, room.name);
                    vizCircle(room.name, thirdSpawnPosition.x, thirdSpawnPosition.y, {fill: 'transparent', radius: .75, stroke: '#BABABA'});
                    let listOfSpawnPositions = [];
                    listOfSpawnPositions.push(thirdSpawnPosition);


                    DestroyAndBuild(room, listOfSpawnPositions, STRUCTURE_SPAWN);
                }

                if(room.controller.level == 8 && myConstructionSites == 0) {
                    let observers = room.find(FIND_MY_STRUCTURES, {filter:s => s.structureType == STRUCTURE_OBSERVER});
                    if(observers.length == 0) {
                        let listOfObserverPosition = [new RoomPosition(storage.pos.x - 2, storage.pos.y + 1, room.name)]
                        DestroyAndBuild(room, listOfObserverPosition, STRUCTURE_OBSERVER);
                    }

                    let nukers = room.find(FIND_MY_STRUCTURES, {filter:s => s.structureType == STRUCTURE_NUKER});
                    if(nukers.length == 0) {
                        let listOfNukerPositions = [new RoomPosition(storage.pos.x + 4, storage.pos.y, room.name)]
                        DestroyAndBuild(room, listOfNukerPositions, STRUCTURE_NUKER);
                    }
                    // else if(nukers.length == 1) {
                    //     let NukerPosition = new RoomPosition(storage.pos.x + 4, storage.pos.y, room.name);
                    //     let lookForS = NukerPosition.lookFor(LOOK_STRUCTURES);
                    //     if(lookForS.length == 1) {
                    //         NukerPosition.createConstructionSite(STRUCTURE_RAMPART);
                    //     }
                    // }
                    let powerSpawns = room.find(FIND_MY_STRUCTURES, {filter:s => s.structureType == STRUCTURE_POWER_SPAWN});
                    if(powerSpawns.length == 0) {
                        let listOfPowerSpawnPositions = [new RoomPosition(storage.pos.x + 3, storage.pos.y + 2, room.name)]
                        DestroyAndBuild(room, listOfPowerSpawnPositions, STRUCTURE_POWER_SPAWN);
                    }
                    // else if(powerSpawns.length == 1) {
                    //     let PowerSpawnPosition = new RoomPosition(storage.pos.x + 3, storage.pos.y + 2, room.name);
                    //     let lookForS = PowerSpawnPosition.lookFor(LOOK_STRUCTURES);
                    //     if(lookForS.length == 1) {
                    //         PowerSpawnPosition.createConstructionSite(STRUCTURE_RAMPART);
                    //     }
                    // }
                }

                if(room.controller.level == 8 && myConstructionSites == 0 && room.controller.isPowerEnabled) {
                    let openPositionsAroundController = room.controller.pos.getOpenPositionsIgnoreCreeps();
                    for(let position of openPositionsAroundController) {
                        let found = false;
                        if(storage && (storage.pos.getRangeTo(position) >= 10 || storage.pos.findPathTo(position, { ignoreCreeps: true, ignoreRoads: true, swampCost: 1 }).length > 11)) {
                            let structuresHere = position.lookFor(LOOK_STRUCTURES);
                            if(structuresHere.length > 0) {
                                for(let building of structuresHere) {
                                    if(building.structureType == STRUCTURE_RAMPART) {
                                        found = true;
                                    }
                                }
                            }
                            if(!found) {
                                position.createConstructionSite(STRUCTURE_WALL);
                            }
                        }
                    }
                    // build walls around controller
                }



                if(room.controller.level >= 3 && room.controller.level < 6 && container1 && !haulRoadsIncomplete(room)) {
                    const already1 = sources.length > 0 && (
                        sources[0].pos.findInRange(FIND_STRUCTURES, 1, {filter: (s: any) => s.structureType == STRUCTURE_CONTAINER}).length > 0 ||
                        sources[0].pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {filter: (s: any) => s.structureType == STRUCTURE_CONTAINER}).length > 0
                    );
                    if(!already1) {
                        Game.rooms[container1.roomName].createConstructionSite(container1.x, container1.y, STRUCTURE_CONTAINER);
                    }
                }

                if(room.controller.level >= 3 && room.controller.level < 6 && container2 && !haulRoadsIncomplete(room)) {
                    const already2 = sources.length > 1 && (
                        sources[1].pos.findInRange(FIND_STRUCTURES, 1, {filter: (s: any) => s.structureType == STRUCTURE_CONTAINER}).length > 0 ||
                        sources[1].pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {filter: (s: any) => s.structureType == STRUCTURE_CONTAINER}).length > 0
                    );
                    if(!already2) {
                        Game.rooms[container2.roomName].createConstructionSite(container2.x, container2.y, STRUCTURE_CONTAINER);
                    }
                }

                // THE ROAD LINES. Re-searched on makeRoadCostMatrix rather than
                // reusing the container/link searches above: those must stay on
                // makeStructuresCostMatrix so the container and link SEATS do not
                // move, but a road line has to prefer the road that is already
                // there or it lays a second one beside it every time an extension
                // changes the cost landscape. One line per destination, and none
                // at all while the basePlan placer owns the road budget.
                if(room.controller.level >= 3 && !basePlanRoadsActive) {
                    if(sources.length > 0) {
                        pathBuilder(legacyRoadLine(room, storage.pos, sources[0].pos, 1), STRUCTURE_ROAD, room);
                    }
                    if(sources.length > 1) {
                        pathBuilder(legacyRoadLine(room, storage.pos, sources[1].pos, 1), STRUCTURE_ROAD, room);
                    }
                    const controllerRoad = legacyRoadLine(room, storage.pos, room.controller.pos, 2);
                    controllerRoad.path.pop();
                    pathBuilder(controllerRoad, STRUCTURE_ROAD, room);
                }

                if(room.controller.level >= 6) {

                    if(storage) {

                        // storage.x-4 / y+4 can sit outside 0..49 when the
                        // hub is near an edge; RoomPosition would throw.
                        let extraRoadRaw = [
                            [storage.pos.x-4, storage.pos.y],
                            [storage.pos.x-3, storage.pos.y-1],
                            [storage.pos.x-2, storage.pos.y-1],
                            [storage.pos.x-2, storage.pos.y+2],
                            [storage.pos.x-2, storage.pos.y+3],
                            [storage.pos.x-3, storage.pos.y+4],
                            [storage.pos.x-4, storage.pos.y+3]
                        ];
                        let extraRoadPositions = [];
                        for(let raw of extraRoadRaw) {
                            let p = safePos(raw[0], raw[1], room.name);
                            if(p) extraRoadPositions.push(p);
                        }

                        for(let position of extraRoadPositions) {
                            if(position.lookFor(LOOK_TERRAIN)[0] !== "wall") {
                                position.createConstructionSite(STRUCTURE_ROAD);
                            }

                            let lookForRoad = position.lookFor(LOOK_STRUCTURES);
                            if(lookForRoad.length > 0) {
                                for(let building of lookForRoad) {
                                    if(building.structureType == STRUCTURE_ROAD) {
                                        let road = building.id;
                                        if(room.memory.keepTheseRoads && !_.includes(room.memory.keepTheseRoads, road, 0)) {
                                            room.memory.keepTheseRoads.push(road);
                                        }
                                    }
                                }
                            }
                        }

                        let MyRamparts = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(storage) <= 10});
                        // myConstructionSites is already a count (see the .length at its
                        // assignment); .length on a number is undefined, so this block never
                        // ran. It also has to read THIS rampart's tile, not the stale
                        // storage-tile lookup, or it kept roads from the wrong position.
                        if(myConstructionSites == 0 && Game.shard.name !== "shard3") {
                            for(let rampart of MyRamparts) {
                                let lookForStructsHere = rampart.pos.lookFor(LOOK_STRUCTURES);
                                if(lookForStructsHere.length == 1) {
                                    rampart.pos.createConstructionSite(STRUCTURE_ROAD);
                                }
                                else {
                                    for(let building of lookForStructsHere) {
                                        if(building.structureType == STRUCTURE_ROAD) {
                                            if(room.memory.keepTheseRoads && !_.includes(room.memory.keepTheseRoads, building.id, 0)) {
                                                room.memory.keepTheseRoads.push(building.id);
                                            }
                                        }
                                    }
                                }
                            }
                        }


                    }


                    let extractor = Game.getObjectById(room.memory.Structures.extractor) || room.findExtractor();
                    let mineral = Game.getObjectById(room.memory.mineral) || room.findMineral();
                    if(!extractor) {
                        room.createConstructionSite(mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR);
                    }
                    else {
                        room.memory.extractor = extractor.id;
                    }

                    let pathFromStorageToMineral = PathFinder.search(storage.pos, {pos:mineral.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrix(roomName)});
                    let RampartLocationMineral = pathFromStorageToMineral.path[pathFromStorageToMineral.path.length - 1]
                    if(storage.pos.getRangeTo(RampartLocationMineral) >= 8) {
                        RampartLocationMineral.createConstructionSite(STRUCTURE_RAMPART);
                    }

                    // road line on the road-preferring matrix; the rampart seat
                    // above keeps the original search (see legacyRoadLine)
                    pathBuilder(legacyRoadLine(room, storage.pos, mineral.pos, 1), STRUCTURE_ROAD, room);

                    if(room.terminal) {
                        pathBuilder(legacyRoadLine(room, storage.pos, room.terminal.pos, 1), STRUCTURE_ROAD, room);
                    }

                }
            }

        }



        // Early RCL: place extensions around spawn when there is no storage/container yet.
        // (Previously commented out — without this, RCL2-3 never gets extensions if hub container fails.)
        if(spawn && !storage && room.controller.level < 4) {
            let spawnNeighbours = getNeighbours(spawn.pos, checkerboard);
            spawnNeighbours = spawnNeighbours.filter(function(location) {return location.x > 0 && location.x < 49 && location.y > 0 && location.y < 49;});
            spawnNeighbours.sort((a,b) => new RoomPosition (a.x, a.y, room.name).getRangeTo(spawn) - new RoomPosition (b.x, b.y, room.name).getRangeTo(spawn));
            pathBuilder(spawnNeighbours, STRUCTURE_EXTENSION, room, false);
        }
        if(storage) {
            let storageNeighbours = getNeighbours(storage.pos, checkerboard);
            storageNeighbours = storageNeighbours.filter(function(location) {return location.x > 0 && location.x < 49 && location.y > 0 && location.y < 49;})
            storageNeighbours.sort((a,b) => new RoomPosition (a.x, a.y, room.name).getRangeTo(storage) - new RoomPosition (b.x, b.y, room.name).getRangeTo(storage));

            if(room.controller.level < 4) {
                pathBuilder(storageNeighbours, STRUCTURE_EXTENSION, room, false);
            }


            if(room.controller.level >= 4) {
                pathBuilder(storageNeighbours, STRUCTURE_EXTENSION, room, false);

                let aroundStorageList = [
                    new RoomPosition(storage.pos.x + 1, storage.pos.y + 1, room.name),
                    new RoomPosition(storage.pos.x + 1, storage.pos.y - 1, room.name),
                    new RoomPosition(storage.pos.x -1, storage.pos.y + 1, room.name),
                    new RoomPosition(storage.pos.x -1, storage.pos.y - 1, room.name),
                    new RoomPosition(storage.pos.x + 1, storage.pos.y, room.name),
                    new RoomPosition(storage.pos.x - 1, storage.pos.y, room.name),
                    new RoomPosition(storage.pos.x, storage.pos.y + 1, room.name),
                    new RoomPosition(storage.pos.x, storage.pos.y - 1, room.name),
                ]

                pathBuilder(aroundStorageList, STRUCTURE_ROAD, room, false);
            }

            if(room.terminal && room.controller.level >= 6) {
                let aroundTerminalList = [
                    new RoomPosition(room.terminal.pos.x + 1, room.terminal.pos.y, room.name),
                    // new RoomPosition(room.terminal.pos.x - 1, room.terminal.pos.y, room.name),
                    new RoomPosition(room.terminal.pos.x, room.terminal.pos.y + 1, room.name),
                    new RoomPosition(room.terminal.pos.x, room.terminal.pos.y - 1, room.name),
                ]
                pathBuilder(aroundTerminalList, STRUCTURE_ROAD, room, false);

                let lookterminallocation = room.terminal.pos.lookFor(LOOK_STRUCTURES);
                if(lookterminallocation.length == 1) {
                    room.terminal.pos.createConstructionSite(STRUCTURE_RAMPART);
                }
            }
        }


        if(room.controller.level >= 5 && storage && myConstructionSites == 0) {
            let ramparts = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(storage) == 10});
            if(ramparts.length > 0) {
                let topLeftRamparts = ramparts.filter(function(rampart) {return rampart.pos.x < storage.pos.x-1 && rampart.pos.y < storage.pos.y-1;});
                if(topLeftRamparts.length > 0) {
                    // topLeftRamparts.sort((a,b) => b.pos.getRangeTo(storage) - a.pos.getRangeTo(storage));
                    let closestTopLeftRampart = storage.pos.findClosestByRange(topLeftRamparts);
                    let pathFromStorageToFurthestTopLeftRampart = PathFinder.search(storage.pos, {pos:closestTopLeftRampart.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrixModifiedTest(roomName)});
                    pathBuilder(pathFromStorageToFurthestTopLeftRampart, STRUCTURE_ROAD, room);
                }
                let topRightRamparts = ramparts.filter(function(rampart) {return rampart.pos.x > storage.pos.x+1 && rampart.pos.y < storage.pos.y-1;});
                if(topRightRamparts.length > 0) {
                    // topRightRamparts.sort((a,b) => b.pos.getRangeTo(storage) - a.pos.getRangeTo(storage));
                    let closestTopRightRampart = storage.pos.findClosestByRange(topRightRamparts);
                    let pathFromStorageToFurthestTopRightRampart = PathFinder.search(storage.pos, {pos:closestTopRightRampart.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrixModifiedTest(roomName)});
                    pathBuilder(pathFromStorageToFurthestTopRightRampart, STRUCTURE_ROAD, room);
                }
                let bottomRightRamparts = ramparts.filter(function(rampart) {return rampart.pos.x > storage.pos.x+1 && rampart.pos.y > storage.pos.y+1;});
                if(bottomRightRamparts.length > 0) {
                    // bottomRightRamparts.sort((a,b) => b.pos.getRangeTo(storage) - a.pos.getRangeTo(storage));
                    let closestBottomRightRampart = storage.pos.findClosestByRange(bottomRightRamparts);
                    let pathFromStorageToFurthestBottomRightRampart = PathFinder.search(storage.pos, {pos:closestBottomRightRampart.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrixModifiedTest(roomName)});
                    pathBuilder(pathFromStorageToFurthestBottomRightRampart, STRUCTURE_ROAD, room);
                }

                let bottomLeftRamparts = ramparts.filter(function(rampart) {return rampart.pos.x < storage.pos.x-1 && rampart.pos.y > storage.pos.y+1;});
                if(bottomLeftRamparts.length > 0) {
                    // bottomLeftRamparts.sort((a,b) => b.pos.getRangeTo(storage) - a.pos.getRangeTo(storage));
                    let closestBottomLeftRampart = storage.pos.findClosestByRange(bottomLeftRamparts);
                    let pathFromStorageToFurthestBottomLeftRampart = PathFinder.search(storage.pos, {pos:closestBottomLeftRampart.pos, range:1}, {plainCost: 1, swampCost: 3, roomCallback: (roomName) => makeStructuresCostMatrixModifiedTest(roomName)});
                    pathBuilder(pathFromStorageToFurthestBottomLeftRampart, STRUCTURE_ROAD, room);
                }
            }
        }


        if(room.controller.level >= 6 && storage) {
            let sources = room.find(FIND_SOURCES);

            sources.forEach(source => {
                let open = source.pos.getOpenPositionsIgnoreCreeps();
                findOpenSpotsForExtensions(open, storage, room, source.pos, source);
            });
        }








// IMPORTNAT DO NOT DELETE
        let links = room.find(FIND_MY_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_LINK);}});

        // storage is null for the whole storage-build window (hub container
        // already destroyed). Unguarded storage.pos throws and aborts later rooms.
        if(room.controller.level >= 5 && storage) {
            let sources = room.find(FIND_SOURCES);
            if(sources.length > 0) {
            sources.forEach(source => {
                let sourceLinks = source.pos.findInRange(links, 2);
                // A link SITE is invisible to FIND_MY_STRUCTURES; the next
                // pass walks open[2+] and one source eats both RCL5 slots.
                const sourceLinkSites = source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 2, {
                    filter: (s: any) => s.structureType == STRUCTURE_LINK
                });
                if(sourceLinks.length == 0 && sourceLinkSites.length == 0) {
                    let open = source.pos.getOpenPositionsIgnoreCreeps();
                    findTwoOpenSpotsForLink(open, storage, room, source);
                }
                for(let link of sourceLinks) {
                    if(storage.pos.getRangeTo(link) > 7) {
                        link.pos.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }
            }
        )};
        }

        if(room.controller.level >= 6) {
            if(storage) {
                // storage.x-2 is -1 when the hub sits on x=1.
                let storageLinkPosition = safePos(storage.pos.x-2, storage.pos.y, room.name);
                if(storageLinkPosition) {
                let buildingsHere = storageLinkPosition.lookFor(LOOK_STRUCTURES);
                let found = false;
                for(let building of buildingsHere) {
                    if(building.structureType == STRUCTURE_LINK) {
                        found = true;
                    }
                }
                if(!found) {
                    vizCircle(room.name, storageLinkPosition.x, storageLinkPosition.y, {fill: 'transparent', radius: .75, stroke: 'red'});
                    let positionsList = [];
                    positionsList.push(storageLinkPosition);

                    DestroyAndBuild(room, positionsList, STRUCTURE_LINK);
                }
                }

                if(!room.terminal) {
                    let terminalPosition = new RoomPosition(storage.pos.x - 1, storage.pos.y + 2, room.name);
                    let positionsList = [];
                    positionsList.push(terminalPosition);
                    vizCircle(room.name, terminalPosition.x, terminalPosition.y, {fill: 'transparent', radius: .75, stroke: 'green'});

                    DestroyAndBuild(room, positionsList, STRUCTURE_TERMINAL);
                }
            }
        }
        if(room.controller.level >= 3) {
            if(storage) {
                // Hub ring, not the old range-7 "on the mincut wall" ring.
                // Live E36N57 sat a tower on a border rampart at 18,20 (8 from
                // storage) because that list preferred tiles next to the shell.
                const hub = storage.pos;
                const towerOff = [
                    [2, 0], [-2, 0], [0, 2], [0, -2],
                    [2, 2], [-2, -2], [2, -2], [-2, 2],
                    [1, 2], [-1, 2], [2, 1], [-2, 1],
                ];
                const towerCandidates = [];
                const sources = room.find(FIND_SOURCES);
                for (const off of towerOff) {
                    const x = hub.x + off[0];
                    const y = hub.y + off[1];
                    if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                    const pos = new RoomPosition(x, y, room.name);
                    if (pos.lookFor(LOOK_TERRAIN)[0] === "wall") continue;
                    if (sources.some((s) => pos.getRangeTo(s) <= 1)) continue;
                    towerCandidates.push(pos);
                }
                BuildIfICan(towerCandidates, STRUCTURE_TOWER);
            }
        }
    }
}


function DestroyAndBuild(room, LocationsList, StructureType:string) {
    for(let location of LocationsList) {
        let lookForExistingStructures = location.lookFor(LOOK_STRUCTURES);
        // Road+structure is a legal overlay. Destroying the road here
        // deleted paving under labs/terminal/factory and re-destroyed
        // roads already sitting under a finished structure every pass.
        let hasTarget = false;
        let blocking = false;
        for(let existingstructure of lookForExistingStructures) {
            if(existingstructure.structureType === StructureType) {
                hasTarget = true;
            } else if(existingstructure.structureType !== STRUCTURE_RAMPART && existingstructure.structureType !== STRUCTURE_ROAD) {
                existingstructure.destroy();
                blocking = true;
            }
        }
        if(!hasTarget && !blocking) {
            room.createConstructionSite(location, StructureType);
        }
    }
}

/** One off-hub tower per pass, only in peacetime, only if we can rebuild. */
function relocateStrayTowers(room) {
    if (!room.controller || !room.controller.my) return;
    if (room.memory.danger || room.find(FIND_HOSTILE_CREEPS).length) return;
    const hub: any = room.storage || room.find(FIND_MY_SPAWNS)[0];
    if (!hub) return;
    const towers = room.find(FIND_MY_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_TOWER,
    });
    for (const t of towers) {
        const range = t.pos.getRangeTo(hub);
        if (range <= 6) continue;
        const bank = room.storage && room.storage.my ? room.storage.store[RESOURCE_ENERGY] || 0 : 0;
        if (bank < 8000) continue;
        logAlways(
            `construction ${room.name}: destroying off-hub tower@${t.pos.x},${t.pos.y} (range ${range} from hub)`,
        );
        t.destroy();
        return;
    }
}

function BuildIfICan(LocationsList, StructureType:string) {
    let ramparts;
    if(LocationsList.length > 0) {
        let storage:any = Game.getObjectById(Game.rooms[LocationsList[0].roomName].memory.Structures.storage);
        if(storage) {
            ramparts = Game.rooms[LocationsList[0].roomName].find(FIND_MY_STRUCTURES).filter(function(s) {return s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(storage) > 6;});
        }
    }
    for(let location of LocationsList) {
        let source = location.findClosestByRange(Game.rooms[location.roomName].find(FIND_SOURCES));
        if(location.getRangeTo(source) == 1) {
            continue;
        }

        // Towers live on the hub. The old "must be within 4 of a wall rampart"
        // filter is what parked them on the mincut / room border.
        if(StructureType !== STRUCTURE_TOWER && ramparts && ramparts.length > 0) {
            if(location.getRangeTo(location.findClosestByRange(ramparts)) > 4) {
                continue;
            }
        }

        let lookForExistingStructures = location.lookFor(LOOK_STRUCTURES);
        if(lookForExistingStructures.length > 0) {
            let canIBuild = true;
            for(let existingstructure of lookForExistingStructures) {
                if(existingstructure.structureType === STRUCTURE_ROAD || existingstructure.structureType === STRUCTURE_RAMPART || existingstructure.structureType === STRUCTURE_CONTAINER) {
                    continue;
                }
                else {
                    canIBuild = false;
                    break;
                }
            }

            if(canIBuild) {
                vizCircle(location.roomName, location.x, location.y, {fill: 'full', radius: 0.25, stroke: 'black'});
                location.createConstructionSite(StructureType);
            }
        }
        else {
            // Bare terrain never sited: createConstructionSite lived only
            // inside the existing-structure branch. Ring-7 tiles with no
            // road/rampart never got a tower.
            vizCircle(location.roomName, location.x, location.y, {fill: 'full', radius: 0.25, stroke: 'black'});
            location.createConstructionSite(StructureType);
        }
    }
}


function findTwoOpenSpotsForLink(open:Array<RoomPosition>, storage, room, source?, depth?) {
    if(depth == null) depth = 0;
    // 1-access sources recurse A → source-tile → A and overflow the
    // uncaught room loop — same hole the extension walker already had.
    // Cap depth, refuse an empty ring, never step onto the source.
    if(depth > 8 || !open || open.length == 0) return;
    const notSource = function(p: RoomPosition) {
        return !source || !p.isEqualTo(source.pos);
    };
    if(open.length > 1) {
        open.sort((a,b) => a.findPathTo(storage, {ignoreCreeps:true}).length - b.findPathTo(storage, {ignoreCreeps:true}).length)
        open = open.filter(position => position.findPathTo(storage.pos, {ignoreCreeps:true}).length < open[0].findPathTo(storage.pos, {ignoreCreeps:true}).length + 3);
        if(open.length > 1) {
            if(open.length == 2 && open[0].getRangeTo(open[1]) > 1) {
                if(!open[0]) return;
                let NewOpen = open[0].getOpenPositionsIgnoreCreeps().filter(notSource);
                findTwoOpenSpotsForLink(NewOpen, storage, room, source, depth + 1)
            }
            else {
            // let closestOpen = storage.pos.findClosestByRange(open);
            vizCircle(room.name, open[1].x, open[1].y, {fill: 'transparent', radius: 0.75, stroke: 'red'});
            for (let i = 1; i < open.length; i++) {
                let result = open[i].createConstructionSite(STRUCTURE_LINK);
                if(result == 0) {
                    return;
                }
            }
            }
        }
        else {
            if(!open[0]) return;
            let NewOpen = open[0].getOpenPositionsIgnoreCreeps().filter(notSource);
            findTwoOpenSpotsForLink(NewOpen, storage, room, source, depth + 1)
        }
    }
    else {
        if(!open[0]) return;
        let NewOpen = open[0].getOpenPositionsIgnoreCreeps().filter(notSource);
        findTwoOpenSpotsForLink(NewOpen, storage, room, source, depth + 1)
    }
}

function findOpenSpotsForExtensions(open:Array<RoomPosition>, storage, room, origin, source, depth?) {
    if(depth == null) depth = 0;
    // 1-access sources recurse A → source-tile → A and overflow the
    // uncaught room loop. Cap depth and never step onto the source.
    if(depth > 8 || !open || open.length == 0) return;
    if(open.length > 1) {
        open.sort((a,b) => a.findPathTo(storage, {ignoreCreeps:true}).length - b.findPathTo(storage, {ignoreCreeps:true}).length)
        open = open.filter(position => position.findPathTo(storage.pos, {ignoreCreeps:true}).length < open[0].findPathTo(storage.pos, {ignoreCreeps:true}).length + 3);
        if(open.length > 1) {

            let pathFromSourceToStorage = source.pos.findPathTo(storage.pos, {ignoreCreeps:true});

            if(pathFromSourceToStorage.length > 0) {
                let firstLocation = pathFromSourceToStorage[0];

                let firstSpotOnPath = new RoomPosition(firstLocation.x, firstLocation.y, room.name);

                if(firstSpotOnPath.getRangeTo(storage) >= 8) {
                    let lookForBuildingsOnFirstSpotOnPath = firstSpotOnPath.lookFor(LOOK_STRUCTURES);
                    if(lookForBuildingsOnFirstSpotOnPath.length == 0 || lookForBuildingsOnFirstSpotOnPath.length == 1 && lookForBuildingsOnFirstSpotOnPath[0].structureType == STRUCTURE_ROAD) {
                        firstSpotOnPath.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }


                let buildhere = firstSpotOnPath.getOpenPositionsIgnoreCreeps();

                let myLinks = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_LINK});
                if(myLinks.length >= 4) {
                    for (let i = 0; i < buildhere.length; i++) {
                        vizCircle(room.name, buildhere[i].x, buildhere[i].y, {fill: 'transparent', radius: 0.75, stroke: 'white'});

                        let buildings = buildhere[i].lookFor(LOOK_STRUCTURES);
                        if(buildings.length == 0) {
                            let count = 0;
                            if(new RoomPosition(buildhere[i].x + 1, buildhere[i].y, room.name).lookFor(LOOK_TERRAIN)[0] == "wall") {
                                count ++;
                            }
                            if(new RoomPosition(buildhere[i].x - 1, buildhere[i].y, room.name).lookFor(LOOK_TERRAIN)[0] == "wall") {
                                count ++;
                            }
                            if(new RoomPosition(buildhere[i].x, buildhere[i].y + 1, room.name).lookFor(LOOK_TERRAIN)[0] == "wall") {
                                count ++;
                            }
                            if(new RoomPosition(buildhere[i].x, buildhere[i].y - 1, room.name).lookFor(LOOK_TERRAIN)[0] == "wall") {
                                count ++;
                            }
                            if(count < 2) {
                                buildhere[i].createConstructionSite(STRUCTURE_EXTENSION);
                            }
                        }
                    }
                }

                return;
            }
            else {
                console.log(room.name, 'this room sucks')
            }

        }
        else {
            if(!open[0]) return;
            let NewOpen = open[0].getOpenPositionsIgnoreCreeps().filter(function(p) {
                return !p.isEqualTo(source.pos) && !(origin && p.isEqualTo(origin));
            });
            findOpenSpotsForExtensions(NewOpen, storage, room, origin, source, depth + 1)
        }
    }
    else {
        if(!open[0]) return;
        let NewOpen = open[0].getOpenPositionsIgnoreCreeps().filter(function(p) {
            return !p.isEqualTo(source.pos) && !(origin && p.isEqualTo(origin));
        });
        findOpenSpotsForExtensions(NewOpen, storage, room, origin, source, depth + 1)
    }
}

    // let roomPositionArray = [];
    // for(let x = 1; x < 48; x++) {
    //     for(let y = 1; y < 48; y++) {
    //         roomPositionArray.push(new RoomPosition(x, y, roomName));
    //     }
    // }
    // let terrain = Game.map.getRoomTerrain(roomName);
    // let unWalkablePositions = _.filter(roomPositionArray, function(pos:any) {
    //     return terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL;});

    // for(let position of unWalkablePositions) {
    //     costs.set(position.x, position.y, 255);
    // }

    // let allowedRooms = { [ roomName ]: true };

    // if (allowedRooms[roomName] === undefined) {
    //     return false;
    // }




const makeStructuresCostMatrix = (roomName: string): boolean | CostMatrix => {
    let currentRoom = Game.rooms[roomName];
    if(currentRoom == undefined || currentRoom === undefined || !currentRoom || currentRoom === null || currentRoom == null) {
        return false;
    }
    let costs = new PathFinder.CostMatrix;

    let existingStructures = currentRoom.find(FIND_STRUCTURES);
    if(existingStructures.length > 0) {
        existingStructures.forEach(building => {
            if(building.structureType != STRUCTURE_RAMPART && building.structureType != STRUCTURE_CONTAINER && building.structureType != STRUCTURE_ROAD) {
                costs.set(building.pos.x, building.pos.y, 255);
            }
            // else {
            //     costs.set(building.pos.x, building.pos.y, 0);
            // }
        });
    }

    let storages = currentRoom.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_STORAGE});
    let storage;
    if(storages.length > 0) {
        storage = storages[0];
    }
    if(storage) {
        let storageX = storage.pos.x;
        let storageY = storage.pos.y;

        let listOfPositionsInFutureToBeBuilt = [
            [storageX + -2,storageY + -2],
            [storageX + 2,storageY + -2],
            [storageX + 2,storageY],
            [storageX + -3,storageY + -3],
            [storageX + -1,storageY + -3],
            [storageX + -1,storageY + 3],
            [storageX + 1,storageY + -3],
            [storageX + 3,storageY + -3],
            [storageX + 1,storageY + 3],
            [storageX + 3,storageY + 3],
            [storageX + -3,storageY + -2],
            [storageX + 3,storageY + -2],
            [storageX + -4,storageY + -4],
            [storageX + -2,storageY + -4],
            [storageX,storageY + -4],
            [storageX + 2,storageY + -4],
            [storageX + 4,storageY + -4],
            [storageX + -4,storageY + -2],
            [storageX + -4,storageY + 4],
            [storageX + -2,storageY + 4],
            [storageX + 0,storageY + 4],
            [storageX + 2,storageY + 4],
            [storageX + 4,storageY + 4],
            [storageX + -5,storageY + -5],
            [storageX + -3,storageY + -5],
            [storageX + -1,storageY + -5],
            [storageX + 1,storageY + -5],
            [storageX + 3,storageY + -5],
            [storageX + 5,storageY + -5],
            [storageX + -5,storageY + -3],
            [storageX + 5,storageY + -3],
            [storageX + -5,storageY + -1],
            [storageX + 5,storageY + 3],
            [storageX + -5,storageY + 5],
            [storageX + -3,storageY + 5],
            [storageX + -1,storageY + 5],
            [storageX + 1,storageY + 5],
            [storageX + 3,storageY + 5],
            [storageX + 0,storageY + 5],
            [storageX + 0,storageY - 5],
            [storageX + -6,storageY + -6],
            [storageX + -4,storageY + -6],
            [storageX + -2,storageY + -6],
            [storageX + 0,storageY + -6],
            [storageX + 2,storageY + -6],
            [storageX + 4,storageY + -6],
            [storageX + 6,storageY + -6],
            [storageX + -6,storageY + -4],
            [storageX + 6,storageY + -4],
            [storageX + -6,storageY + -2],
            [storageX + 6,storageY + -2],
            [storageX + 6,storageY + 0],
            [storageX + 6,storageY + 2],
            [storageX + -6,storageY + 4],
            [storageX + 6,storageY + 4],
            [storageX + -6,storageY + 6],
            [storageX + -4,storageY + 6],
            [storageX + -2,storageY + 6],
            [storageX + 0,storageY + 6],
            [storageX + 2,storageY + 6],
            [storageX + 4,storageY + 6],
            [storageX + 6,storageY + 6],
            // [storageX + -5,storageY + -7],
            // [storageX + -3,storageY + -7],
            // [storageX + -1,storageY + -7],
            // [storageX + 1,storageY + -7],
            // [storageX + 3,storageY + -7],
            // [storageX + 5,storageY + -7],
            // [storageX + -7,storageY + -5],
            // [storageX + -7,storageY + -3],
            // [storageX + -7,storageY + -1],
            // [storageX + -7,storageY + 5],
            // [storageX + -5,storageY + 7],
            // [storageX + -3,storageY + 7],
            // [storageX + -1,storageY + 7],
            // [storageX + 1,storageY + 7],
            // [storageX + 3,storageY + 7],
            // [storageX + 5,storageY + 7],
            // [storageX + 7,storageY + 5],
            // [storageX + 7,storageY + 3],
            // [storageX + 7,storageY + 1],
            // [storageX + 7,storageY + -1],
            // [storageX + 7,storageY + -3],
            // [storageX + 7,storageY + -5],
            // [storageX + 0,storageY + 7],
            // [storageX + 7,storageY + 0],
            // [storageX + 0,storageY + -7],
            // [storageX + 4,storageY + 7],
            // [storageX + -4,storageY + 7],
            // [storageX + 7,storageY + 4],
            // [storageX + 7,storageY + -4],
            // [storageX + 4,storageY + -7],
            // [storageX + -4,storageY + -7],
            // [storageX + -7,storageY + 4],
            // [storageX + -7,storageY + -4],

            // non extension buildings
            [storageX + -1,storageY + 2],
            [storageX + 0,storageY + -2],
            [storageX + 2,storageY + 0],
            [storageX + 4,storageY + 0],
            [storageX + 2,storageY + 2],
            [storageX + 3,storageY + 2],
            [storageX + -2,storageY + 0],
            // towers
            // [storageX + 4,storageY + -2],
            // [storageX + 3,storageY + -1],
            // [storageX + 5,storageY + -1],
            // [storageX + 3,storageY + 1],
            // [storageX + 5,storageY + 1],
            // [storageX + 4,storageY + 2],
            // labs
            [storageX + -3,storageY + 0],
            [storageX + -3,storageY + 1],
            [storageX + -3,storageY + 2],
            [storageX + -3,storageY + 3],
            [storageX + -4,storageY + 1],
            [storageX + -4,storageY + 2],
            [storageX + -5,storageY + 0],
            [storageX + -5,storageY + 1],
            [storageX + -5,storageY + 2],
            [storageX + -5,storageY + 3],
        ]

        for(let position of listOfPositionsInFutureToBeBuilt) {
            if(position[0] <= 47 && position[0] >= 2 && position[1] <= 47 && position[1] >= 2) {
                costs.set(position[0], position[1], 10);
            }
        }
    }


    return costs;
}


const makeStructuresCostMatrixModifiedTest = (roomName: string): boolean | CostMatrix => {
    let currentRoom = Game.rooms[roomName];
    if(currentRoom == undefined || currentRoom === undefined || !currentRoom || currentRoom === null || currentRoom == null) {
        return false;
    }
    if(currentRoom.controller && currentRoom.controller.level == 0) {
        return makeStructuresCostMatrix(roomName);
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 15;
            }
            else if(tile == 0){
                weight = 3;
            }
            costs.set(x, y, weight);
        }
    }


    let existingStructures = currentRoom.find(FIND_STRUCTURES);
    if(existingStructures.length > 0) {
        existingStructures.forEach(building => {
            if(building.structureType != STRUCTURE_RAMPART && building.structureType != STRUCTURE_CONTAINER && building.structureType != STRUCTURE_ROAD) {
                costs.set(building.pos.x, building.pos.y, 255);
            }
            else if(building.structureType == STRUCTURE_ROAD) {
                costs.set(building.pos.x, building.pos.y, 2)
            }

            // else {
            //     costs.set(building.pos.x, building.pos.y, 0);
            // }
        });
    }

    let storages = currentRoom.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_STORAGE});
    let storage;
    if(storages.length > 0) {
        storage = storages[0];
    }
    if(storage) {
        let storageX = storage.pos.x;
        let storageY = storage.pos.y;

        let listOfPositionsInFutureToBeBuilt = [
            [storageX + -2,storageY + -2],
            [storageX + 2,storageY + -2],
            [storageX + 2,storageY],
            [storageX + -3,storageY + -3],
            [storageX + -1,storageY + -3],
            [storageX + -1,storageY + 3],
            [storageX + 1,storageY + -3],
            [storageX + 3,storageY + -3],
            [storageX + 1,storageY + 3],
            [storageX + 3,storageY + 3],
            [storageX + -3,storageY + -2],
            [storageX + 3,storageY + -2],
            [storageX + -4,storageY + -4],
            [storageX + -2,storageY + -4],
            [storageX,storageY + -4],
            [storageX + 2,storageY + -4],
            [storageX + 4,storageY + -4],
            [storageX + -4,storageY + -2],
            [storageX + -4,storageY + 4],
            [storageX + -2,storageY + 4],
            [storageX + 0,storageY + 4],
            [storageX + 2,storageY + 4],
            [storageX + 4,storageY + 4],
            [storageX + -5,storageY + -5],
            [storageX + -3,storageY + -5],
            [storageX + -1,storageY + -5],
            [storageX + 1,storageY + -5],
            [storageX + 3,storageY + -5],
            [storageX + 5,storageY + -5],
            [storageX + -5,storageY + -3],
            [storageX + 5,storageY + -3],
            [storageX + -5,storageY + -1],
            [storageX + 5,storageY + 3],
            [storageX + -5,storageY + 5],
            [storageX + -3,storageY + 5],
            [storageX + -1,storageY + 5],
            [storageX + 1,storageY + 5],
            [storageX + 3,storageY + 5],
            [storageX + 0,storageY + 5],
            [storageX + 0,storageY - 5],
            [storageX + -6,storageY + -6],
            [storageX + -4,storageY + -6],
            [storageX + -2,storageY + -6],
            [storageX + 0,storageY + -6],
            [storageX + 2,storageY + -6],
            [storageX + 4,storageY + -6],
            [storageX + 6,storageY + -6],
            [storageX + -6,storageY + -4],
            [storageX + 6,storageY + -4],
            [storageX + -6,storageY + -2],
            [storageX + 6,storageY + -2],
            [storageX + 6,storageY + 0],
            [storageX + 6,storageY + 2],
            [storageX + -6,storageY + 4],
            [storageX + 6,storageY + 4],
            [storageX + -6,storageY + 6],
            [storageX + -4,storageY + 6],
            [storageX + -2,storageY + 6],
            [storageX + 0,storageY + 6],
            [storageX + 2,storageY + 6],
            [storageX + 4,storageY + 6],
            [storageX + 6,storageY + 6],
            // [storageX + -5,storageY + -7],
            // [storageX + -3,storageY + -7],
            // [storageX + -1,storageY + -7],
            // [storageX + 1,storageY + -7],
            // [storageX + 3,storageY + -7],
            // [storageX + 5,storageY + -7],
            // [storageX + -7,storageY + -5],
            // [storageX + -7,storageY + -3],
            // [storageX + -7,storageY + -1],
            // [storageX + -7,storageY + 5],
            // [storageX + -5,storageY + 7],
            // [storageX + -3,storageY + 7],
            // [storageX + -1,storageY + 7],
            // [storageX + 1,storageY + 7],
            // [storageX + 3,storageY + 7],
            // [storageX + 5,storageY + 7],
            // [storageX + 7,storageY + 5],
            // [storageX + 7,storageY + 3],
            // [storageX + 7,storageY + 1],
            // [storageX + 7,storageY + -1],
            // [storageX + 7,storageY + -3],
            // [storageX + 7,storageY + -5],
            // [storageX + 0,storageY + 7],
            // [storageX + 7,storageY + 0],
            // [storageX + 0,storageY + -7],
            // [storageX + 4,storageY + 7],
            // [storageX + -4,storageY + 7],
            // [storageX + 7,storageY + 4],
            // [storageX + 7,storageY + -4],
            // [storageX + 4,storageY + -7],
            // [storageX + -4,storageY + -7],
            // [storageX + -7,storageY + 4],
            // [storageX + -7,storageY + -4],

            // non extension buildings
            [storageX + -1,storageY + 2],
            [storageX + 0,storageY + -2],
            [storageX + 2,storageY + 0],
            [storageX + 4,storageY + 0],
            [storageX + 2,storageY + 2],
            [storageX + 3,storageY + 2],
            [storageX + -2,storageY + 0],
            // towers
            // [storageX + 4,storageY + -2],
            // [storageX + 3,storageY + -1],
            // [storageX + 5,storageY + -1],
            // [storageX + 3,storageY + 1],
            // [storageX + 5,storageY + 1],
            // [storageX + 4,storageY + 2],
            // labs
            [storageX + -3,storageY + 0],
            [storageX + -3,storageY + 1],
            [storageX + -3,storageY + 2],
            [storageX + -3,storageY + 3],
            [storageX + -4,storageY + 1],
            [storageX + -4,storageY + 2],
            [storageX + -5,storageY + 0],
            [storageX + -5,storageY + 1],
            [storageX + -5,storageY + 2],
            [storageX + -5,storageY + 3],
        ]

        for(let position of listOfPositionsInFutureToBeBuilt) {
            if(position[0] <= 47 && position[0] >= 2 && position[1] <= 47 && position[1] >= 2) {
                costs.set(position[0], position[1], 10);
            }
        }
    }



    return costs;
}
// const makeStructuresCostMatrix = (roomName: string): boolean | CostMatrix => {
//     let currentRoom = Game.rooms[roomName];
//     if(currentRoom == undefined || currentRoom === undefined || !currentRoom || currentRoom === null || currentRoom == null) {
//         return false;
//     }
//     let costs = new PathFinder.CostMatrix;

//     let storage:any = Game.getObjectById(currentRoom.memory.Structures.storage) || currentRoom.findStorage();


//     let illegal_locations_for_roads = [
//         []
//     ]

//     let positions_to_loop_through = getNeighbours(storage.pos, illegal_locations_for_roads);

//     for(let almost_position of checkerboard) {
//         costs.set(almost_position[0],almost_position[1],255);
//     }


//     let existingStructures = currentRoom.find(FIND_STRUCTURES);
//     if(existingStructures.length > 0) {
//         existingStructures.forEach(building => {
//             if(building.structureType != STRUCTURE_RAMPART && building.structureType != STRUCTURE_CONTAINER && building.structureType != STRUCTURE_ROAD) {
//                 costs.set(building.pos.x, building.pos.y, 255);
//             }
//             // else {
//             //     costs.set(building.pos.x, building.pos.y, 0);
//             // }
//         });
//     }



//     return costs;
// }




const RampartBorderCallbackFunction = (roomName: string): boolean | CostMatrix => {
    let currentRoom:any = Game.rooms[roomName];

    let costs = new PathFinder.CostMatrix;

    let storage = Game.getObjectById(currentRoom.memory.Structures.storage) || currentRoom.findStorage();


    let rampartLocations = [];
    for(let i = -10; i<11; i++) {
        for(let o = -10; o <11; o++) {
            if((i==10 || i==-10)) {
                let combinedX = storage.pos.x + i;
                if(combinedX >= 2 && combinedX <= 47) {
                    rampartLocations.push([i,o]);
                }
                else {
                    if(combinedX == 48) {
                        rampartLocations.push([i-1,o]);
                    }
                    else if(combinedX == 49) {
                        rampartLocations.push([i-2,o]);
                    }
                    else if(combinedX == 1) {
                        rampartLocations.push([i+1,o]);
                    }
                    else if(combinedX == 0) {
                        rampartLocations.push([i+2,o]);
                    }
                }
            }
            else if((o==10 || o==-10)) {
                let combinedY = storage.pos.y + o;
                if(combinedY >= 2 && combinedY <= 47) {
                    rampartLocations.push([i,o]);
                }
                else {
                    if(combinedY == 48) {
                        rampartLocations.push([i,o-1]);
                    }
                    else if(combinedY == 49) {
                        rampartLocations.push([i,o-2]);
                    }
                    else if(combinedY == 1) {
                        rampartLocations.push([i,o+1]);
                    }
                    else if(combinedY == 0) {
                        rampartLocations.push([i,o+2]);
                    }
                }
            }
        }
    }
    let storageRampartNeighbors = getNeighbours(storage.pos, rampartLocations);
    for(let location of storageRampartNeighbors) {
        costs.set(location.x, location.y, 255);
    }

    return costs;
}












// let route = Game.map.findRoute(room.name, targetRoomName)
// let roomNames = [];
// _.forEach(route, function(point){
//     roomNames.push(point.room);
// });



/** packed (x + y*50) set of the adopted plan's road tiles, or null */
function planRoadSet(room): { [packed: number]: boolean } | null {
    const plan = room.memory.planV2;
    if (!plan || !plan.t || !plan.t.road) return null;
    const set: { [packed: number]: boolean } = {};
    for (const p of plan.t.road) set[p] = true;
    return set;
}

/**
 * Cost matrix for the storage -> remote-source line.
 *
 * ONE geometry for everything. This matrix used to price the home room at
 * plain 10 / swamp 25 so the line would hug the plan's eco roads at any
 * detour — while the carriers' own travel matrices price plain 2, and
 * remotePathIsRoaded judged a THIRD, road-blind terrain path. Measured on
 * the VPS: the roads got built on one line (exit x≈42), the carriers drove
 * another (exit x≈17), and two fully-paved legs read 8-26% "roaded" so 2:1
 * bodies never unlocked. Same 2/6/1 pricing as the remote rooms now — plan
 * roads and built roads still cost 1, so the line prefers them at sane
 * detours, and the CLIP rule (on-plan or exterior only) is what protects
 * the base, not path distortion. Exported: rooms.spawning's roaded check
 * and path-length survey MUST walk this same matrix.
 */
export function remoteRoadCostMatrix(roomName: string, homeRoom: any, planRoads: { [packed: number]: boolean } | null): boolean | CostMatrix | undefined {
    if (!planRoads || roomName !== homeRoom.name) {
        // No vision: makeStructuresCostMatrixModifiedTest returns `false`, and
        // `false` tells PathFinder the room is IMPASSABLE. Every path to a
        // remote we cannot currently see therefore came back incomplete, which
        // is half of why pathLength never landed. `undefined` means "use plain
        // terrain costs" — exactly the right answer for a room whose
        // structures we cannot enumerate.
        if (!Game.rooms[roomName]) return undefined;
        /*
         * STICKY LINE: without a road discount every 500-tick pass is free to
         * return a different equal-cost route and pave 4 tiles of THAT one —
         * the observed "scattered roads, no line" in every remote. Existing
         * roads and road sites cost 1 vs plain 2 / swamp 6, so the search
         * re-uses what previous passes paid for. (The file header documents
         * this exact failure for the home room; this is the remote half.)
         */
        const rr = Game.rooms[roomName];
        const stickyCosts = new PathFinder.CostMatrix();
        const terr = new Room.Terrain(roomName);
        for (let y = 0; y <= 49; y++) {
            for (let x = 0; x <= 49; x++) {
                const t = terr.get(x, y);
                stickyCosts.set(x, y, t === TERRAIN_MASK_WALL ? 255 : t === TERRAIN_MASK_SWAMP ? 6 : 2);
            }
        }
        for (const s of rr.find(FIND_STRUCTURES)) {
            if (s.structureType === STRUCTURE_ROAD) { stickyCosts.set(s.pos.x, s.pos.y, 1); continue; }
            if (s.structureType === STRUCTURE_CONTAINER) continue;
            if (s.structureType === STRUCTURE_RAMPART && (s as any).my) continue;
            stickyCosts.set(s.pos.x, s.pos.y, 255);
        }
        for (const cs of rr.find(FIND_CONSTRUCTION_SITES)) {
            if (cs.structureType === STRUCTURE_ROAD) stickyCosts.set(cs.pos.x, cs.pos.y, 1);
        }
        return stickyCosts;
    }
    const costs = new PathFinder.CostMatrix();
    const terrain = new Room.Terrain(roomName);
    for (let y = 0; y <= 49; y++) {
        for (let x = 0; x <= 49; x++) {
            const t = terrain.get(x, y);
            costs.set(x, y, t === TERRAIN_MASK_WALL ? 255 : t === TERRAIN_MASK_SWAMP ? 6 : 2);
        }
    }
    for (const packed of Object.keys(planRoads)) {
        const p = Number(packed);
        costs.set(p % 50, Math.floor(p / 50), 1);
    }
    for (const s of homeRoom.find(FIND_STRUCTURES)) {
        if (s.structureType === STRUCTURE_ROAD) { costs.set(s.pos.x, s.pos.y, 1); continue; }
        if (s.structureType === STRUCTURE_CONTAINER) continue;
        if (s.structureType === STRUCTURE_RAMPART && s.my) continue;
        costs.set(s.pos.x, s.pos.y, 255);
    }
    // Sticky here too: half-built connectors attract the next pass's line.
    for (const cs of homeRoom.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (cs.structureType === STRUCTURE_ROAD) costs.set(cs.pos.x, cs.pos.y, 1);
    }
    return costs;
}

/**
 * The canonical haul-line pather for a home room, shared by placement
 * (Build_Remote_Roads), body sizing (remotePathIsRoaded) and trip pricing
 * (ensureRemotePathLength). If these ever walk different geometries again,
 * roads get built where nobody drives — see remoteRoadCostMatrix's header.
 */
export function searchRemoteHaulPath(homeRoom: any, originPos: any, goal: any, maxOps: number): any {
    const planRoads = planRoadSet(homeRoom);
    return PathFinder.search(originPos, goal, {
        plainCost: 2,
        swampCost: 6,
        roomCallback: (roomName: string) => remoteRoadCostMatrix(roomName, homeRoom, planRoads) as any,
        maxRooms: 16,
        maxOps
    });
}

/** how many open sites the home room may hold before we stop adding to it */
const HOME_SITE_CEILING = 4;
/** open sites we tolerate in ONE remote room (a remote line is 50-80 tiles;
 *  paving it in one go buries the 100-site global cap) */
const REMOTE_SITE_CEILING = 8;
/** leave this much of the 100-site global cap for the base plans */
const GLOBAL_SITE_CEILING = 70;

/**
 * Pave a remote line for a v2-planned room.
 *
 * Rules (owner's ask): roads OUTSIDE the home room freely; INSIDE the home
 * room only on tiles the plan already calls road. If the in-room segment
 * deviates from the plan, leave it — creeps just walk those tiles. This keeps
 * the whole in-room budget with placeFromPlanV2 and stops the remote line from
 * dual-stamping the base.
 */
function placeClippedRemoteRoads(homeRoom, path, planRoads: { [packed: number]: boolean }, budget: { homeSites: number, remoteSites: { [roomName: string]: number } }): void {
    // 2/4 is a per-source drip. Site COUNTS live on `budget` so a second
    // source this pass sees the first source's sites (ceilings overshot
    // when each call snapshotted homeSites and reset the maps).
    let remoteBudget = 4;
    let homeBudget = 2;

    for (const pos of path) {
        if (remoteBudget <= 0 && homeBudget <= 0) break;
        if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) continue;
        const targetRoom = Game.rooms[pos.roomName];
        if (!targetRoom) continue;

        const inHome = pos.roomName === homeRoom.name;
        if (inHome) {
            if (homeBudget <= 0) continue;
            /*
             * On-plan tiles ride the base's own eco roads. EXTERIOR tiles are
             * the shell->exit connector the planner never emits (verified: 0
             * road tiles in any border band across all shipped plans) — the
             * reason every remote line dead-ended at the border with 6-10
             * roads sitting on the remote side. Exterior off-plan roads are
             * already exempt from migration destroy (PlanV2 isExteriorTile
             * guards), so paving them cannot fight the planner; interior
             * off-plan tiles stay unpaved as before.
             *
             * The connector also bypasses the homeSites ceiling: ROAD_DRIP
             * keeps up to 4 plan-road sites standing at all times, so a
             * ceiling of 4 seeded with ALL home sites blocked this branch
             * permanently (the second half of the dead-end).
             */
            const onPlan = !!planRoads[pos.x + pos.y * 50];
            if (!onPlan && !isExteriorPos(homeRoom, pos)) continue;
            if (onPlan && budget.homeSites >= HOME_SITE_CEILING) continue;
        } else {
            if (remoteBudget <= 0) continue;
            if (budget.remoteSites[pos.roomName] === undefined) {
                budget.remoteSites[pos.roomName] = targetRoom.find(FIND_MY_CONSTRUCTION_SITES).length;
            }
            if (budget.remoteSites[pos.roomName] >= REMOTE_SITE_CEILING) continue;
        }

        const terrainHere = targetRoom.getTerrain().get(pos.x, pos.y);
        if (terrainHere === TERRAIN_MASK_WALL) continue;

        let blocked = false;
        for (const s of pos.lookFor(LOOK_STRUCTURES)) {
            if (s.structureType === STRUCTURE_ROAD) {
                // rooms.ts wipe empties keepTheseRoads; legacy pathBuilder
                // re-pushed built ids. Without this, RemoteRepair ignores
                // planV2 remote roads and they decay to 0.
                if (!targetRoom.memory.keepTheseRoads) targetRoom.memory.keepTheseRoads = [];
                if (!_.includes(targetRoom.memory.keepTheseRoads, s.id, 0)) {
                    targetRoom.memory.keepTheseRoads.push(s.id);
                }
                blocked = true;
                break;
            }
            // Harvest-seat container is a legal road overlay; treating it
            // as blocked left the drop tile unpaved once the box finished.
            if (s.structureType === STRUCTURE_CONTAINER) continue;
            if (s.structureType !== STRUCTURE_RAMPART) { blocked = true; break; }
        }
        if (blocked) continue;
        if (pos.lookFor(LOOK_CONSTRUCTION_SITES).length) continue;

        if (targetRoom.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD) === OK) {
            if (inHome) {
                homeBudget--;
                budget.homeSites++;
            } else {
                remoteBudget--;
                budget.remoteSites[pos.roomName]++;
            }
        }
    }
}

/** how often ONE remote gets a full road/container pass while we can see it */
const REMOTE_ROAD_PASS_EVERY = 500;
/** how often we re-derive pathLength for a remote we canNOT currently see */
const REMOTE_PATH_PASS_EVERY = 500;

interface RemoteRoadCtx {
    /** path origin — the home storage */
    storage: any;
    /** home-room plan road tiles, or null for an unplanned room */
    planRoads: { [packed: number]: boolean } | null;
    /** shared site budget for this pass; null when we are only measuring */
    clipBudget: { homeSites: number, remoteSites: { [roomName: string]: number } } | null;
    /** false => compute pathLength only, place nothing */
    allowSites: boolean;
}

/**
 * One remote room's sources: measure the haul, then (optionally) pave it.
 *
 * Split out of Build_Remote_Roads so the per-remote cadence in
 * Remote_Roads_Tick can run exactly one remote per tick, and so the
 * measure-only half can run with no vision at all.
 */
function buildRemote(room, targetRoomName: string, data: any, ctx: RemoteRoadCtx): void {
    _.forEach(data.energy, function(values: any, sourceId: any) {
        if(!values) return;

        const source: any = Game.getObjectById(sourceId);
        // Stamp coordinates whenever vision happens to be here (the remote
        // miner stands on the source, so this is nearly free and keeps
        // pre-existing memory entries — written before scout.ts recorded
        // x/y — self-healing).
        if(source && source.pos) {
            values.x = source.pos.x;
            values.y = source.pos.y;
        }
        // Without vision AND without a remembered position there is nothing
        // to path at. scout.ts records x/y, so this only bites once.
        if(typeof values.x !== "number" || typeof values.y !== "number") return;

        const goalPos = source && source.pos
            ? source.pos
            : new RoomPosition(values.x, values.y, targetRoomName);

        const pathFromStorageToRemoteSource = searchRemoteHaulPath(
            room, ctx.storage.pos, {pos: goalPos, range: 1}, 10000);

        if(pathFromStorageToRemoteSource.incomplete) {
            console.log(`Could not find path to remote source in ${targetRoomName}`);
            return;
        }

        // Carrier body sizing (rooms.spawning) and remote SCORING
        // (rooms.remotes: `if (!isFinite(best)) continue`) both read this and
        // nothing else. It is the single most important thing this function
        // produces, so it is written before any of the site-placement gates
        // below can bail.
        values.pathLength = pathFromStorageToRemoteSource.path.length;
        // Authoritative stamp: this is the geometry the carriers drive, so
        // the spawning side's survey (which walks the SAME matrix now) must
        // not immediately redo the work — or worse, overwrite it from a
        // different model, which is where the phantom 75/100-tile legs came
        // from (real: 43/52).
        values.pathLengthT = Game.time;

        // Measure-only pass (no vision, or the global site cap is full).
        if(!ctx.allowSites || !ctx.clipBudget) return;

        const containerSpot = pathFromStorageToRemoteSource.path[pathFromStorageToRemoteSource.path.length - 1];
        if(!containerSpot || !Game.rooms[containerSpot.roomName]) {
            // No vision at the source end. This used to `return` — a FULL
            // abort that also skipped the home-side connector roads, so a
            // pass tick that missed remote vision (recalls, hot spells)
            // placed nothing at all, every 500 ticks, indefinitely. Place
            // what we CAN see; only the box needs the far room.
            console.log(`No visibility in container room ${containerSpot?.roomName} - paving visible leg only`);
        }
        // A source sitting at x/y 1 or 48 puts the last path tile ON the room
        // border, and createConstructionSite refuses border tiles - silently,
        // every single pass, forever. Skip only the box; the roads below and the
        // pathLength above are still worth the pass.
        else if(containerSpot.x < 1 || containerSpot.x > 48 || containerSpot.y < 1 || containerSpot.y > 48) {
            console.log(`Remote container spot ${containerSpot.x},${containerSpot.y} in ${containerSpot.roomName} is a border tile - no container, roads only`);
        }
        else {
            const containerSiteResult = Game.rooms[containerSpot.roomName].createConstructionSite(containerSpot.x, containerSpot.y, STRUCTURE_CONTAINER);
            if(containerSiteResult === OK && containerSpot.roomName !== room.name) {
                // The box counts against the remote's site ceiling like
                // everything else placed there (it never used to).
                const b = ctx.clipBudget.remoteSites;
                if(b[containerSpot.roomName] === undefined) {
                    const vis = Game.rooms[containerSpot.roomName];
                    b[containerSpot.roomName] = vis ? vis.find(FIND_MY_CONSTRUCTION_SITES).length : 0;
                }
                b[containerSpot.roomName]++;
            }
            if(containerSiteResult !== OK && containerSiteResult !== ERR_FULL && containerSiteResult !== ERR_INVALID_TARGET) {
                console.log(`Remote container site ${containerSpot.x},${containerSpot.y} in ${containerSpot.roomName} failed: ${containerSiteResult}`);
            }
        }
        console.log(`Building road from ${room.name} storage to remote source in ${targetRoomName} (${values.pathLength} tiles)`);
        if(ctx.planRoads) {
            placeClippedRemoteRoads(room, pathFromStorageToRemoteSource.path, ctx.planRoads, ctx.clipBudget);
        } else {
            pathBuilder(pathFromStorageToRemoteSource, STRUCTURE_ROAD, room);
        }
    });
}

/**
 * @param onlyRemote restrict the pass to one remote room (the per-tick
 *        cadence does this). Omitted => every active remote, ignoring the
 *        roadPass/pathPass stamps — that is what `global.buildRemoteRoads()`
 *        wants from the console.
 */
function Build_Remote_Roads(room, onlyRemote?: string) {
    // Early RCL / no remotes: do not lay road sites to room edges
    if (!room || !room.controller || room.controller.level < 4) return;
    if(room.memory.danger) {
        return;
    }
    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
    if (!storage) {
        return;
    }
    // Construction sites are capped at 100 GLOBALLY (MAX_CONSTRUCTION_SITES),
    // not per room. A remote line is 50-80 tiles, so paving two remotes ate
    // the whole allowance and left placeFromPlanV2 with zero slots in both
    // communes. Remote roads are the lowest-priority builder there is.
    //
    // This used to be a hard `return`, which meant a busy build queue also
    // suppressed pathLength — and pathLength is what SCORES the remote. Now it
    // only downgrades the pass to measure-only.
    const allowSites = Object.keys(Game.constructionSites).length < GLOBAL_SITE_CEILING;

    // v2-planned rooms are handled with a clipped placer instead of
    // pathBuilder: pathBuilder paves the WHOLE path, which drops up to 12
    // in-room road sites and starves placeFromPlanV2's 4-site budget.
    // Computed even for measure-only passes: it changes the in-room leg of the
    // path (plan roads cost 1), so leaving it out would make the two kinds of
    // pass disagree about pathLength.
    const planRoads = planRoadSet(room);
    const ctx: RemoteRoadCtx = {
        storage,
        planRoads,
        clipBudget: allowSites ? {
            homeSites: room.find(FIND_MY_CONSTRUCTION_SITES).length,
            remoteSites: {} as { [roomName: string]: number }
        } : null,
        allowSites
    };

    let resourceData = _.get(room.memory, ['resources']);

    _.forEach(resourceData, function(data, targetRoomName){
        // We want to build roads to remote rooms, not the current room
        if(room.name === targetRoomName) return;
        if(onlyRemote && targetRoomName !== onlyRemote) return;
        // ...and only to remotes we actually decided to mine
        if(!data || !data.active || !data.energy) return;

        buildRemote(room, targetRoomName as string, data, ctx);
    });
}

/** ticks a closed remote keeps its sites before the sweep reclaims them */
const STRANDED_SITE_GRACE = 3000;
let _strandedSweepAt = 0;

/**
 * Reclaim MY road/container sites stranded in remote rooms nobody is mining.
 *
 * VPS W6N3: an Invader core closed the remote and its 8 sites sat there for
 * good — pinned at REMOTE_SITE_CEILING, eating the global 100-site cap, and
 * reading as "the bot is building something" while nothing ever would.
 * `ConstructionSite.remove()` works WITHOUT vision, and roads/containers are
 * the only things this bot ever places in unowned rooms, so the sweep is
 * safe: worst case a re-opened remote re-places them in one pass. A recent
 * close (hot spell, cap juggle) keeps its sites for STRANDED_SITE_GRACE.
 */
function purgeStrandedRemoteSites(): void {
    if (Game.time - _strandedSweepAt < 500) return;
    _strandedSweepAt = Game.time;
    // Scope: only rooms the remote system TRACKS. A room outside every
    // resources map (a colonise target, a manual RoomLocker job) is none of
    // this sweep's business.
    const tracked: { [roomName: string]: boolean } = {};
    const keep: { [roomName: string]: boolean } = {};
    for (const home in Memory.rooms) {
        const res: any = (Memory.rooms[home] as any).resources;
        if (!res) continue;
        for (const t in res) {
            const e = res[t];
            if (!e || t === home) continue;
            tracked[t] = true;
            if (e.active) keep[t] = true;
            else if (e.closedAt && Game.time - e.closedAt < STRANDED_SITE_GRACE) keep[t] = true;
        }
    }
    const colonise: any = (Memory as any).target_colonise;
    if (colonise && colonise.room) keep[colonise.room] = true;
    for (const id in Game.constructionSites) {
        const s: any = Game.constructionSites[id];
        if (s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER) continue;
        const rn = s.pos.roomName;
        if (!tracked[rn] || keep[rn]) continue;
        const vis = Game.rooms[rn];
        if (vis && vis.controller && vis.controller.my) continue;
        s.remove();
    }
}

/**
 * Per-remote, vision-triggered cadence. Call every tick.
 *
 * The old trigger was `Game.time % 500 === 0` for the whole ROOM, while the
 * body needed `Game.getObjectById(sourceId)` to resolve — i.e. it only did
 * anything if one of our creeps happened to be standing in that remote on that
 * exact 1-in-500 tick. The two almost never coincided, so live memory showed
 * every remote at `roads 0, cont 0` with no pathLength at all: unscored,
 * unclaimed, unpaved, forever.
 *
 * Cheap enough for every tick — a for-in over room.memory.resources with early
 * continues, no find() and no PathFinder unless a remote is actually due. At
 * most ONE remote per room per tick does PathFinder work, so three remotes
 * gaining vision on the same tick spread across three ticks.
 */
function Remote_Roads_Tick(room): void {
    if (!room.controller || room.controller.level < 4) return;
    if (room.memory.danger) return;
    purgeStrandedRemoteSites(); // module-throttled to one sweep per 500t
    const resources: any = room.memory.resources;
    if (!resources) return;

    // Fallback candidate: a remote we cannot see, whose distance we still do
    // not know. Only used if no visible remote is due this tick.
    let measureOnly: string | null = null;

    for (const targetRoomName in resources) {
        if (targetRoomName === room.name) continue;
        const data = resources[targetRoomName];
        if (!data || !data.active || !data.energy) continue;

        if (Game.rooms[targetRoomName]) {
            if (Game.time - (data.roadPass || 0) <= REMOTE_ROAD_PASS_EVERY) continue;
            // Stamp first: a pass that bails inside (no storage, incomplete
            // path) must not retry every tick.
            data.roadPass = Game.time;
            Build_Remote_Roads(room, targetRoomName);
            return; // one remote per room per tick
        }

        if (measureOnly) continue;
        if (Game.time - (data.pathPass || 0) <= REMOTE_PATH_PASS_EVERY) continue;
        for (const id in data.energy) {
            const v = data.energy[id];
            // Known position, unknown distance => worth a blind path.
            if (v && v.pathLength == null && typeof v.x === "number" && typeof v.y === "number") {
                measureOnly = targetRoomName;
                break;
            }
        }
    }

    if (measureOnly) {
        resources[measureOnly].pathPass = Game.time;
        // No vision on the remote => the container-spot guard inside
        // buildRemote returns before anything is placed. This is the
        // measure-only path.
        Build_Remote_Roads(room, measureOnly);
    }
}

function Situational_Building(room) {
    // planV2 rooms own the hub via placeFromPlanV2. This two-tick
    // spawn.y-2 smash dual-stamps storage and throws when y<2 or no spawn.
    if(room.memory.planV2) return;
    if(room.controller.level == 4 && room.memory.data && room.memory.data.DOBug && (room.memory.data.DOBug == 3 || room.memory.data.DOBug == 4)) {
        if(room.memory.data.DOBug == 3) {
            let spawns = room.find(FIND_MY_SPAWNS);
            if(spawns.length == 0) return;
            let spawn = spawns[0];
            let storagePosition = safePos(spawn.pos.x, spawn.pos.y - 2, room.name);
            if(!storagePosition) return;
            let lookForStoragePositionBuildings = storagePosition.lookFor(LOOK_STRUCTURES);
            for(let building of lookForStoragePositionBuildings) {
                if(building.structureType == STRUCTURE_CONTAINER) {
                    building.destroy();
                }
            }
        }
        if(room.memory.data.DOBug == 4) {
            let spawns = room.find(FIND_MY_SPAWNS);
            if(spawns.length == 0) return;
            let spawn = spawns[0];
            let storagePosition = safePos(spawn.pos.x, spawn.pos.y - 2, room.name);
            if(!storagePosition) return;
            storagePosition.createConstructionSite(STRUCTURE_STORAGE);
        }
    }
}


export { Build_Remote_Roads, Remote_Roads_Tick, Situational_Building };

export default construction;

// module.exports = construction;
