function observe(room) {
if(Game.time % 10 == 0) {


    let observer:any = Game.getObjectById(room.memory.Structures.observer) || room.findObserver();
    if(observer) {
        let RoomsToSee = [];
        let adjacentRooms = Object.values(Game.map.describeExits(room.name));
        let adjacentAdjacentRooms = [];
        for(let RoomNameAdj of adjacentRooms) {
            adjacentAdjacentRooms.push(Object.values(Game.map.describeExits(RoomNameAdj)));
        }

        RoomsToSee.push(adjacentRooms);
        RoomsToSee.push(adjacentAdjacentRooms);


        if(RoomsToSee.length > 0) {
            observer.observeRoom(RoomsToSee[Math.floor(Math.random()*RoomsToSee.length)]);
        }


        for(let adj of RoomsToSee) {
            if(Game.rooms[adj] && Game.rooms[adj].controller && !Game.rooms[adj].controller.my) {

                let buildings = room.find(FIND_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER});

                let openControllerPositions;

                if(Game.rooms[adj].controller.level == 0) {
                    openControllerPositions = Game.rooms[adj].controller.pos.getOpenPositionsIgnoreCreeps();
                }

                if(openControllerPositions && openControllerPositions.length > 0 && buildings.length > 0) {


                    if(Memory.CanClaimRemote) {
                        let found = false;
                        let wallClearer;

                        for(let creepName in Game.creeps) {
                            if(creepName.startsWith("WallClearer")) {
                                let creep = Game.creeps[creepName];
                                if(creep.memory.role == "WallClearer" && creep.memory.homeRoom == room.name) {
                                    wallClearer = creep;
                                    found = true;
                                    break;
                                }
                            }
                        }

                        if(!found) {
                            let newName = 'WallClearer-' + room.name + "-" + adj;
                            room.memory.spawn_list.push([CLAIM,MOVE], newName, {memory: {role: 'WallClearer', homeRoom: room.name, targetRoom:adj}});
                            console.log('Adding wall-clearer to Spawn List: ' + newName);
                        }
                    }
                }
                else if(openControllerPositions && openControllerPositions.length == 0) {

                    let found = false;
                    let Dismantler;

                    for(let creepName in Game.creeps) {
                        if(creepName.startsWith("DismantleControllerWalls")) {
                            let creep = Game.creeps[creepName];
                            if(creep.memory.role == "DismantleControllerWalls" && creep.memory.homeRoom == room.name) {
                                Dismantler = creep;
                                found = true;
                                break;
                            }
                        }
                    }

                    if(!found) {
                        let newName = 'DismantleControllerWalls-' + room.name + "-" + adj;
                        room.memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'DismantleControllerWalls', homeRoom: room.name, targetRoom:adj}});
                        console.log('Adding DismantleControllerWalls to Spawn List: ' + newName);
                    }

                }


            }
        }
    }


}
}

export default observe;
