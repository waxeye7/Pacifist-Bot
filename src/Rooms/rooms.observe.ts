function observe(room) {
// if(Game.time % 10 == 0) {

    let interval = 1000;
    let observer:any = Game.getObjectById(room.memory.Structures.observer) || room.findObserver();
    if(observer && Game.time % interval <= 1) {

        let RoomsToSee = [];

        let EastOrWest = room.name[0];
        let NorthOrSouth = room.name[3];
        if(room.name.length == 6) {
            let homeRoomNameX = parseInt(room.name[1] + room.name[2]);
            let homeRoomNameY = parseInt(room.name[4] + room.name[5]);
            for(let i = homeRoomNameX-3; i<=homeRoomNameX+3; i++) {
                for(let o = homeRoomNameY-3; o<=homeRoomNameY+3; o++) {
                    if(i % 10 !== 0 && o % 10 !== 0) {
                        if(i % 10 >= 4 && i % 10 <= 6 && o % 10 >= 4 && o % 10 <= 6) {
                            // do nothing
                        }
                        else {
                            let firstString = i.toString();
                            let secondString = o.toString();
                            RoomsToSee.push(EastOrWest + firstString + NorthOrSouth + secondString);
                        }
                    }
                }
            }
        }

        // console.log(RoomsToSee);

        if(RoomsToSee.length > 0 && Game.time % interval == 0) {
            let chosenRoom = RoomsToSee[Math.floor(Math.random()*RoomsToSee.length)]
            observer.observeRoom(chosenRoom);
            console.log("seeing", chosenRoom)
        }

        if(Game.time % interval == 1) {
            for(let adj of RoomsToSee) {
                if(Game.rooms[adj] && room.name !== adj && Game.rooms[adj].controller && !Game.rooms[adj].controller.my) {

                    let buildings = Game.rooms[adj].find(FIND_STRUCTURES, {filter: s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_INVADER_CORE});
                    let openControllerPositions;

                    if(Game.rooms[adj].controller.level == 0) {
                        openControllerPositions = Game.rooms[adj].controller.pos.getOpenPositionsIgnoreCreeps();
                    }

                    if(openControllerPositions && openControllerPositions.length > 0 && buildings.length > 0 && !Game.rooms[adj].controller.reservation) {


                        if(Memory.CanClaimRemote) {
                            let found = false;

                            for(let creepName in Game.creeps) {
                                if(creepName.startsWith("WallClearer")) {
                                    let creep = Game.creeps[creepName];
                                    if(creep.memory.role == "WallClearer" && creep.memory.homeRoom == room.name) {
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

                        for(let creepName in Game.creeps) {
                            if(creepName.startsWith("DismantleControllerWalls")) {
                                let creep = Game.creeps[creepName];
                                if(creep.memory.role == "DismantleControllerWalls" && creep.memory.homeRoom == room.name) {
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


// }
}

export default observe;
