const roomCallbackSquadA = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;


    const terrain = new Room.Terrain(roomName);



    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 5;
            }
            else if(tile == 0){
                weight = 0;

                if(terrain.get(x+1, y) == TERRAIN_MASK_SWAMP) {
                    weight = 5;
                }
                else if(terrain.get(x+1, y+1) == TERRAIN_MASK_SWAMP) {
                    weight = 5;
                }
                else if(terrain.get(x, y+1) == TERRAIN_MASK_SWAMP) {
                    weight = 5;
                }

            }

            if(weight !== 255) {
                let problemTiles = [];
                problemTiles.push(terrain.get(x + 1, y));
                problemTiles.push(terrain.get(x, y + 1));
                problemTiles.push(terrain.get(x + 1, y + 1));
                // , [terrain.get(x + 2, y), terrain.get(x + 2, y + 1)]]
                for(let tile of problemTiles) {
                    if(tile == TERRAIN_MASK_WALL) {
                        weight = 255;
                        break;
                    }
                }

            }

            costs.set(x, y, weight);

            // new RoomVisual(room.name).text("255", x, y, {color: 'green', font: 0.8});
        }
    }

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_RAMPART && struct.my || struct.structureType == STRUCTURE_ROAD) {
            return;
        }

        else {
            if(struct.my) {
                costs.set(struct.pos.x, struct.pos.y, 255);
                costs.set(struct.pos.x - 1, struct.pos.y, 255);
                costs.set(struct.pos.x - 1, struct.pos.y - 1, 255);
                costs.set(struct.pos.x, struct.pos.y - 1, 255);
            }
            else if(!struct.my && struct.structureType !== STRUCTURE_CONTROLLER) {
                if(costs.get(struct.pos.x, struct.pos.y) !== 255) {
                    costs.set(struct.pos.x, struct.pos.y, 100);
                }
                else {
                    costs.set(struct.pos.x, struct.pos.y, 100);
                }
                if(costs.get(struct.pos.x - 1, struct.pos.y) !== 255) {
                    costs.set(struct.pos.x - 1, struct.pos.y, 100);
                }
                else {
                    costs.set(struct.pos.x - 1, struct.pos.y, 255);
                }
                if(costs.get(struct.pos.x - 1, struct.pos.y - 1) !== 255) {
                    costs.set(struct.pos.x - 1, struct.pos.y - 1, 100);
                }
                else {
                    costs.set(struct.pos.x - 1, struct.pos.y - 1, 255);
                }
                if(costs.get(struct.pos.x, struct.pos.y - 1) !== 255) {
                    costs.set(struct.pos.x, struct.pos.y - 1, 100);
                }
                else {
                    costs.set(struct.pos.x, struct.pos.y - 1, 255);
                }
            }
            else {
                costs.set(struct.pos.x, struct.pos.y, 255);
                costs.set(struct.pos.x - 1, struct.pos.y, 255);
                costs.set(struct.pos.x - 1, struct.pos.y - 1, 255);
                costs.set(struct.pos.x, struct.pos.y - 1, 255);
            }


            // new RoomVisual(room.name).text("255", struct.pos.x, struct.pos.y, {color: 'green', font: 0.8});
            // new RoomVisual(room.name).text("255", struct.pos.x-1, struct.pos.y, {color: 'green', font: 0.8});
            // new RoomVisual(room.name).text("255", struct.pos.x-1, struct.pos.y-1, {color: 'green', font: 0.8});
            // new RoomVisual(room.name).text("255", struct.pos.x, struct.pos.y-1, {color: 'green', font: 0.8});

        }
    });


    room.find(FIND_CREEPS).forEach(function(creep) {
        if(!creep.my || (creep.memory.role !== "SquadCreepA" && creep.memory.role !== "SquadCreepB" && creep.memory.role !== "SquadCreepY" && creep.memory.role !== "SquadCreepZ")) {

            let weight:any = 255;

            costs.set(creep.pos.x, creep.pos.y, weight);
            costs.set(creep.pos.x - 1, creep.pos.y, weight);
            costs.set(creep.pos.x - 1, creep.pos.y - 1, weight);
            costs.set(creep.pos.x, creep.pos.y - 1, weight);

            // new RoomVisual(creep.room.name).text("255", creep.pos.x, creep.pos.y, {color: 'green', font: 0.8});
            // new RoomVisual(creep.room.name).text("255", creep.pos.x-1, creep.pos.y, {color: 'green', font: 0.8});
            // new RoomVisual(creep.room.name).text("255", creep.pos.x-1, creep.pos.y-1, {color: 'green', font: 0.8});
            // new RoomVisual(creep.room.name).text("255", creep.pos.x, creep.pos.y-1, {color: 'green', font: 0.8});

        }
        // else if(creep.memory.role === "SquadCreepA") {
        //     costs.set(creep.pos.x, creep.pos.y, 0);
        // }
    });




    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                const tile = terrain.get(x, y);
                // let cost = costs.get(x,y);
                if(tile == TERRAIN_MASK_WALL) {
                    costs.set(x, y, 255);
                }
                else {

                    costs.set(x, y, 15);

                    if(y==49 && terrain.get(x+1, y) == TERRAIN_MASK_WALL) {
                        costs.set(x, y, 255);
                    }
                    if(y==0 && terrain.get(x+1, y) == TERRAIN_MASK_WALL) {
                        costs.set(x, y, 255);
                    }
                    if(x==49 && terrain.get(x, y+1) == TERRAIN_MASK_WALL) {
                        costs.set(x, y, 255);
                    }
                    if(x==0 && terrain.get(x, y+1) == TERRAIN_MASK_WALL) {
                        costs.set(x, y, 255);
                    }
                }
            }
        }
    }

    // for(let y = 0; y < 50; y++) {
    //     for(let x = 0; x < 50; x++) {
    //         const tile = terrain.get(x, y);
    //         let cost = costs.get(x,y);
    //         if(cost !== 255) {
    //             new RoomVisual(room.name).text(cost.toString(), x, y, {color: 'green', font: 0.6});
    //         }
    //     }
    // }





    return costs;
}

export {roomCallbackSquadA};
