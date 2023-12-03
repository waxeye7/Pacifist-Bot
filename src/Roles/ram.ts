/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.memory.moving = false;
    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(Game.rooms[creep.memory.targetRoom] && Game.rooms[creep.memory.targetRoom].controller && Game.rooms[creep.memory.targetRoom].controller.safeMode && Game.rooms[creep.memory.targetRoom].controller.safeMode > 0) {
        creep.memory.suicide = true;
    }

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(!creep.memory.myhealer || creep.room.name === creep.memory.homeRoom && creep.ticksToLive < 1400 && Game.time % 100 === 0) {
        let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "signifer");}});
        if(creepsInRoom.length > 0) {
            creepsInRoom.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.myhealer = creepsInRoom[0].id;
        }
    }

    if(creep.memory.myhealer) {
        let myhealer:any = Game.getObjectById(creep.memory.myhealer);

        if(creep.room.name != creep.memory.targetRoom && creep.fatigue == 0 && ((myhealer && myhealer.fatigue == 0 && creep.pos.isNearTo(myhealer)) || creep.pos.x == 0 || creep.pos.y == 0 || creep.pos.x == 49 || creep.pos.y == 49)) {
            creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
            if (!creep.room.controller || (!creep.room.controller.my && !creep.room.controller.reservation)) {
                let structuresNearMe = creep.room.find(FIND_STRUCTURES);
                let structuresToHit = creep.pos.findInRange(structuresNearMe, 1);
                if(structuresToHit.length > 0) {
                    for(let structure of structuresToHit) {
                        if(!structure.my && structure.structureType !== STRUCTURE_CONTROLLER) {
                            creep.attack(structure);
                            break;
                        }
                    }
                }
            }
                let hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
                if(hostiles.length > 0) {
                    // sort hostiles by distance and then secondly by the amount of active attack parts in a custom sort function

                    hostiles.sort((a, b) => {
                        // First, sort by distance from your creep
                        const distanceA = creep.pos.getRangeTo(a);
                        const distanceB = creep.pos.getRangeTo(b);

                        if (distanceA !== distanceB) {
                          return distanceA - distanceB; // Sort by distance in ascending order
                        } else {
                          // If both hostiles are at the same distance, sort by the number of active attack parts
                          const activeRangedAttackPartsA = a.getActiveBodyparts(RANGED_ATTACK);
                            const activeRangedAttackPartsB = b.getActiveBodyparts(RANGED_ATTACK);
                          const activeAttackPartsA = a.getActiveBodyparts(ATTACK);
                          const activeAttackPartsB = b.getActiveBodyparts(ATTACK);

                          return activeRangedAttackPartsB - activeRangedAttackPartsA - activeAttackPartsB - activeAttackPartsA; // Sort by active attack parts in descending order
                        }
                      });

                    let closestHostile = hostiles[0];

                    if(creep.pos.isNearTo(closestHostile)) {
                        creep.attack(closestHostile);
                        creep.moveTo(closestHostile);
                    }
                }
            return;
        }


        if(!creep.memory.powerCreep && creep.room.name === creep.memory.targetRoom) {
            let powerCreeps = creep.room.find(FIND_HOSTILE_POWER_CREEPS);
            if(powerCreeps.length) {
                let closestPowerCreep = creep.pos.findClosestByRange(powerCreeps);
                if(!PathFinder.search(creep.pos, {pos:closestPowerCreep.pos, range:1},
                    {
                        maxOps: 400,
                        maxRooms: 1,
                        roomCallback: (roomName) => pathAroundStructuresAndTerrain(roomName)
                    }).incomplete) {
                        creep.memory.powerCreep = closestPowerCreep.id;
                    }
            }
            else {
                creep.memory.powerCreep = "not found"
            }
        }

        if(creep.memory.powerCreep && creep.memory.powerCreep !== "not found") {
            let powerCreep = <PowerCreep>Game.getObjectById(creep.memory.powerCreep);
            if(powerCreep && !PathFinder.search(creep.pos, {pos:powerCreep.pos, range:1},
                {
                    maxOps: 400,
                    maxRooms: 1,
                    roomCallback: (roomName) => pathAroundStructuresAndTerrain(roomName)
                }).incomplete) {
                    creep.moveTo(powerCreep,{reusePath: 1});
                    creep.attack(powerCreep);
                    return;
                }
        }


        let buildingsInRoom = creep.room.find(FIND_STRUCTURES, {filter: s => !s.my && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER});
        if(creep.room.controller && creep.room.controller.my && buildingsInRoom.length > 0) {
            buildingsInRoom = buildingsInRoom.filter(function(building) {return building.owner !== undefined});
        }
        let highPrioBuildingsInRoom = buildingsInRoom.filter(function(building) {return building.structureType == STRUCTURE_TOWER || building.structureType === STRUCTURE_TERMINAL || building.structureType === STRUCTURE_STORAGE});
        let spawnsInRoom = buildingsInRoom.filter(function(building) {return building.structureType == STRUCTURE_SPAWN});
        let enemyCreepsInRoom =  creep.room.find(FIND_HOSTILE_CREEPS);
        if(creep.room.name == creep.memory.targetRoom) {
            let move_location;

            let range = 1;
            if(creep.room.controller && creep.room.controller.my || !creep.room.controller) {
                let hostilesInRoom = creep.room.find(FIND_HOSTILE_CREEPS);
                let hostilePowerCreeps = creep.room.find(FIND_HOSTILE_POWER_CREEPS);
                let portals = creep.room.find(FIND_STRUCTURES).filter(function(s) {return s.structureType == STRUCTURE_PORTAL});
                if(creep.memory.defendController && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) > 6 && (!creep.room.controller.my || creep.room.controller.level !== 8)) {
                    move_location = creep.room.controller.pos;
                    range = 2;
                }
                else if(hostilePowerCreeps.length > 0) {
                    let closestHostile = creep.pos.findClosestByRange(hostilePowerCreeps);
                    range = 0
                    move_location = closestHostile.pos;
                }
                else if(hostilesInRoom.length > 0) {
                    let closestHostile = creep.pos.findClosestByRange(hostilesInRoom);
                    range = 0
                    move_location = closestHostile.pos;
                }
                else if(portals.length > 1) {
                    let closestPortal = creep.pos.findClosestByRange(portals);
                    range = 1;
                    move_location = closestPortal.pos;
                }
                else {
                    move_location = new RoomPosition(12, 25, creep.memory.targetRoom);
                }

            }
            else {
                if(spawnsInRoom.length > 0) {
                    move_location = creep.pos.findClosestByRange(spawnsInRoom).pos;
                }
                else if(highPrioBuildingsInRoom.length > 0) {
                    move_location = creep.pos.findClosestByRange(highPrioBuildingsInRoom).pos;
                }
                else if (buildingsInRoom.length > 0) {
                    move_location = creep.pos.findClosestByRange(buildingsInRoom).pos;
                }
                else if(enemyCreepsInRoom.length > 0) {
                    move_location = creep.pos.findClosestByRange(enemyCreepsInRoom).pos;
                }
            }


            console.log(move_location)



            if(move_location && creep.fatigue == 0 && (myhealer && myhealer.fatigue == 0 && creep.pos.isNearTo(myhealer) || creep.pos.x == 0 || creep.pos.y == 0 || creep.pos.x == 49 || creep.pos.y == 49)) {
                let path = PathFinder.search(
                    creep.pos, {pos:move_location, range:range},
                    {
                        plainCost: 1,
                        swampCost: 5,
                        maxOps: 3600,
                        maxRooms: 40,
                        roomCallback: (roomName) => roomCallbackRam(roomName)
                    }
                );


                path.path.forEach(spot => {
                    new RoomVisual(spot.roomName).circle(spot.x, spot.y, {fill: 'transparent', radius: .25, stroke: '#ffffff'});
                });
                console.log(path.incomplete)
                let pos = path.path[0];
                let direction = creep.pos.getDirectionTo(pos);
                creep.move(direction);
            }

        }




        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

        let creep_to_attack_found = false;
        if(enemyCreeps.length > 0) {
            for(let enemycreep of enemyCreeps) {
                let enemyCreepExposed = true;
                if(creep.pos.getRangeTo(enemycreep) <= 4) {
                    let lookStructuresEnemyCreep = enemycreep.pos.lookFor(LOOK_STRUCTURES);
                    for(let building of lookStructuresEnemyCreep) {
                        if(building.structureType == STRUCTURE_RAMPART) {
                            enemyCreepExposed = false;
                        }
                    }
                }

                if(enemycreep.pos.isNearTo(creep) && enemyCreepExposed) {

                    if(enemyCreepExposed) {
                        if(creep.room.controller && creep.room.controller.my && creep.room.controller.level >= 3) {
                            creep.room.roomTowersAttackEnemy(enemycreep);
                        }
                        creep_to_attack_found = true;

                        if(creep.attack(enemycreep) === 0) break;
                    }

                }
                else if(myhealer && creep.pos.getRangeTo(enemycreep) == 2 && myhealer.pos.isNearTo(enemycreep) && enemyCreepExposed) {
                    creep.moveTo(myhealer);

                }
                else if(myhealer && creep.pos.getRangeTo(enemycreep) <= 4 && enemyCreepExposed && !PathFinder.search(creep.pos, {pos:enemycreep.pos, range:1},
                    {
                        maxOps: 400,
                        maxRooms: 1,
                        roomCallback: (roomName) => pathAroundStructuresAndTerrain(roomName)
                    }).incomplete) {
                    creep.moveTo(enemycreep);
                }
                else {
                    let structuresNotMine = creep.room.find(FIND_STRUCTURES, {filter: s => !s.my && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER});
                    let closestStructure = creep.pos.findClosestByRange(structuresNotMine);
                    if(creep.pos.isNearTo(closestStructure)) {
                        creep.attack(closestStructure);
                    }
                }
            }
        }

        if(buildingsInRoom.length > 0 && !creep_to_attack_found) {
            let buildingsAroundMe = creep.pos.findInRange(buildingsInRoom, 1);

            if(buildingsAroundMe.length > 0) {

                for(let building of buildingsAroundMe) {
                    if(building.structureType == STRUCTURE_SPAWN) {
                        creep.attack(building);
                        break;
                    }
                }
                buildingsAroundMe.sort((a,b) => a.hits - b.hits);
                // buildingsAroundMe.sort((a,b) => b.pos.x - a.pos.x);
                // buildingsAroundMe.sort((a,b) => b.pos.y - a.pos.y);
                creep.attack(buildingsAroundMe[0]);

            }


        }


    }


}



const roomCallbackRam = (roomName: string): boolean | CostMatrix => {
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
                weight = 1;
            }
            costs.set(x,y,weight);
        }
    }

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_RAMPART && struct.my || struct.structureType == STRUCTURE_ROAD || struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }

        else {
            if(struct.my) {
                costs.set(struct.pos.x, struct.pos.y, 255);
            }
            else if(!struct.my && struct.structureType !== STRUCTURE_CONTROLLER) {
                if(struct.structureType == STRUCTURE_WALL || struct.structureType == STRUCTURE_RAMPART) {
                    if(struct.hits < 1000000) {
                        costs.set(struct.pos.x, struct.pos.y, 60);
                    }
                    else if(struct.hits < 1500000) {
                        costs.set(struct.pos.x, struct.pos.y, 70);
                    }
                    else if(struct.hits < 2000000) {
                        costs.set(struct.pos.x, struct.pos.y, 80);
                    }
                    else if(struct.hits < 3000000) {
                        costs.set(struct.pos.x, struct.pos.y, 100);
                    }
                    else {
                        costs.set(struct.pos.x, struct.pos.y, 120);
                    }
                }
                else {
                    costs.set(struct.pos.x, struct.pos.y, 120);
                }

            }
            else {
                costs.set(struct.pos.x, struct.pos.y, 255);
            }
        }
    });


    room.find(FIND_CREEPS).forEach(function(creep) {
        if(!creep.my) {
            let weight:any = 10;
            if(costs.get(creep.pos.x, creep.pos.y) <= 5) {
                costs.set(creep.pos.x, creep.pos.y, weight);
            }
            if (creep.getActiveBodyparts(ATTACK) >= 24) {
                const range = 3;
                const centerX = creep.pos.x;
                const centerY = creep.pos.y;

                for (let x = centerX - range; x <= centerX + range; x++) {
                    for (let y = centerY - range; y <= centerY + range; y++) {
                        // Calculate the Manhattan distance from the creep's position
                        const distance = Math.max(Math.abs(x - centerX), Math.abs(y - centerY));

                        const baseCost = 235 - (50 * distance);

                        // Make sure the base cost is not negative or lower than a minimum value
                        const cost = Math.max(baseCost, 5);

                        if (costs.get(x, y) <= 50) {
                            if(terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                                costs.set(x, y, 240);
                            }else {
                            costs.set(x, y, cost);

                            }
                        }
                    }
                }
            }

        }
        else if(creep.my) {
            costs.set(creep.pos.x, creep.pos.y, 230);
        }
    });

    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                const tile = terrain.get(x, y);
                // let cost = costs.get(x,y);
                if(tile == TERRAIN_MASK_WALL) {
                    costs.set(x, y, 255);
                }
            }
        }
    }
    return costs;
}







const pathAroundStructuresAndTerrain = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
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
                weight = 1;
            }
            else if(tile == 0){
                weight = 1;
            }
            costs.set(x, y, weight);
        }
    }

    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {

        if(struct.structureType == STRUCTURE_CONTAINER || struct.structureType == STRUCTURE_ROAD) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });
    return costs;

}






const roleRam = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRam;

