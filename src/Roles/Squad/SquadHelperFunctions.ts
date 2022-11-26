const roomCallbackSquadA = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room) {
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
                weight = 1;
            }

            if(weight !== 255) {
                let problemTiles = [];
                problemTiles.push(terrain.get(x + 1, y));
                problemTiles.push(terrain.get(x, y + 1));
                problemTiles.push(terrain.get(x + 1, y + 1));

                for(let tile of problemTiles) {
                    if(tile == TERRAIN_MASK_WALL) {
                        weight = 255;
                        break;
                    }
                }

            }

            costs.set(x, y, weight);
        }
    }


    room.find(FIND_STRUCTURES).forEach(function(struct) {
      if (struct.structureType !== STRUCTURE_ROAD) {

        let weight:any = 255;

        costs.set(struct.pos.x, struct.pos.y, 255);
        costs.set(struct.pos.x + 1, struct.pos.y, 255);
        costs.set(struct.pos.x + 1, struct.pos.y + 1, 255);
        costs.set(struct.pos.x, struct.pos.y + 1, 255);



        }
    });

    room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_RAMPART}).forEach(function(struct) {
        let lookForStructuresHere = struct.pos.lookFor(LOOK_STRUCTURES);
        for(let building of lookForStructuresHere) {
            if(building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_RAMPART) {

                let weight:any = 255;

                costs.set(struct.pos.x, struct.pos.y, weight);
                costs.set(struct.pos.x + 1, struct.pos.y, weight);
                costs.set(struct.pos.x + 1, struct.pos.y + 1, weight);
                costs.set(struct.pos.x, struct.pos.y + 1, weight);


                break;
            }
        }
        let weight:any = 1;
        if(costs.get(struct.pos.x, struct.pos.y) !== 255) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
        if(costs.get(struct.pos.x + 1, struct.pos.y) !== 255) {
            costs.set(struct.pos.x + 1, struct.pos.y, 1);
        }
        if(costs.get(struct.pos.x + 1, struct.pos.y) !== 255) {
            costs.set(struct.pos.x + 1, struct.pos.y + 1, 1);
        }
        if(costs.get(struct.pos.x, struct.pos.y) !== 255) {
            costs.set(struct.pos.x, struct.pos.y + 1, 1);
        }


      });

    room.find(FIND_CREEPS).forEach(function(creep) {
        if(creep.memory.role !== "SquadCreepA" && creep.memory.role !== "SquadCreepB" && creep.memory.role !== "SquadCreepY" && creep.memory.role !== "SquadCreepZ") {

            let weight:any = 255;

            costs.set(creep.pos.x, creep.pos.y, weight);
            costs.set(creep.pos.x + 1, creep.pos.y, weight);
            costs.set(creep.pos.x + 1, creep.pos.y + 1, weight);
            costs.set(creep.pos.x, creep.pos.y + 1, weight);


        }


    });

    return costs;
}

export {roomCallbackSquadA};
