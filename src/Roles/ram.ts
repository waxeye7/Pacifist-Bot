/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    ;

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

    if(!creep.memory.myhealer) {
        let creepsInRoom = creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == "signifer");}});
        if(creepsInRoom.length > 0) {
            creepsInRoom.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.myhealer = creepsInRoom[0].id;
        }
    }

    if(creep.memory.myhealer) {
        let myhealer:any = Game.getObjectById(creep.memory.myhealer);

        if(creep.room.name != creep.memory.targetRoom && creep.fatigue == 0 && ((myhealer && myhealer.fatigue == 0 && creep.pos.isNearTo(myhealer)) || creep.pos.x == 0 || creep.pos.y == 0 || creep.pos.x == 49 || creep.pos.y == 49)) {
            creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom)
        }


        let buildingsInRoom = creep.room.find(FIND_STRUCTURES, {filter: s => !s.my && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER});
        let highPrioBuildingsInRoom = buildingsInRoom.filter(function(building) {return building.structureType == STRUCTURE_TOWER});
        let spawnsInRoom = buildingsInRoom.filter(function(building) {return building.structureType == STRUCTURE_SPAWN});

        if(creep.room.name == creep.memory.targetRoom) {
            let move_location;

            let range = 1;
            if(creep.room.controller && creep.room.controller.my || !creep.room.controller) {
                let hostilesInRoom = creep.room.find(FIND_HOSTILE_CREEPS);
                let portals = creep.room.find(FIND_STRUCTURES).filter(function(s) {return s.structureType == STRUCTURE_PORTAL});
                if(hostilesInRoom.length > 0) {
                    let closestHostile = creep.pos.findClosestByRange(hostilesInRoom);
                    range = 0
                    move_location = closestHostile.pos;
                }
                else if(portals.length > 1) {
                    let closestPortal = creep.pos.findClosestByRange(portals);
                    range = 1;
                    move_location = closestPortal.pos;
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
                if(enemycreep.pos.isNearTo(creep)) {
                    let found = false;
                    let lookStructuresEnemyCreep = enemycreep.pos.lookFor(LOOK_STRUCTURES);
                    for(let building of lookStructuresEnemyCreep) {
                        if(building.structureType == STRUCTURE_RAMPART) {
                            found = true;
                        }
                    }
                    if(!found) {
                        creep.attack(enemycreep);
                        creep_to_attack_found = true;
                    }

                }
                else if(myhealer && creep.pos.getRangeTo(enemycreep) == 2 && myhealer.pos.isNearTo(enemycreep)) {
                    let lookForStructs =  enemycreep.pos.lookFor(LOOK_STRUCTURES);
                    if(lookForStructs.length) {
                        let found = false;
                        for(let s of lookForStructs) {
                            if(s.structureType === STRUCTURE_RAMPART) {
                                found = true;
                            }
                        }
                        if(!found) {
                            creep.moveTo(myhealer);
                        }
                    }
                    else {
                        creep.moveTo(myhealer);
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
                else {
                    costs.set(x, y, 10);
                }
            }
        }
    }
    return costs;
}












const roleRam = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRam;
