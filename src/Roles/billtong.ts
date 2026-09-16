/**
 * A little description of this function
 * @param {Creep} creep
 **/

import { isHighway, roomStatus, roomsInRange } from "War/geo";

/**
 * Highway rooms within 3 of home that a deposit hunter may walk to.
 *
 * This list used to be built by slicing homeRoom's name at fixed character
 * positions - "E12N34"-shaped names only. A home with a 3-digit coordinate
 * ("E127N58", "E1N127") parsed to NaN bounds or a wrong axis letter, the
 * loops produced an empty list, and the creep parked at home forever with
 * no log saying why. War/geo parses names for every map size and wraps the
 * getRoomStatus call so a name the map rejects reads as closed, not thrown.
 */
export function depositFallbackRooms(homeRoom: string): string[] {
    const out: string[] = [];
    for (const name of roomsInRange(homeRoom, 3)) {
        if (name === homeRoom) continue;
        if (!isHighway(name)) continue;
        if (roomStatus(name) !== "normal") continue;
        out.push(name);
    }
    return out;
}
 const run = function (creep:any) {
    creep.memory.moving = false;

    if(creep.memory.suicide) {
        if(creep.store.getUsedCapacity() > 0) {
            creep.memory.full = true;
        }
        else {
            creep.recycle();
            return;
        }
    }

    if(!creep.memory.MaxStorage) {
        let carryPartsAmount = 0
        for(let part of creep.body) {
            if(part.type == CARRY) {
                carryPartsAmount += 1;
            }
        }
        creep.memory.MaxStorage = carryPartsAmount * 50;
    }
    let MaxStorage = creep.memory.MaxStorage;

    // {filter: deposit => deposit.}));
    if(creep.store.getFreeCapacity() == 0) {
        creep.memory.full = true;
    }
    if(creep.store.getFreeCapacity() == MaxStorage) {
        creep.memory.full = false;
    }

    if(!creep.memory.targetRoom) {

        if(Memory.billtong_rooms && Memory.billtong_rooms.length > 0) {
            let copy_of_list = Memory.billtong_rooms;
            copy_of_list.sort((a,b) => Game.map.getRoomLinearDistance(creep.room.name, a) - Game.map.getRoomLinearDistance(creep.room.name, b));
            for(let billtong_room of copy_of_list) {
                 Game.map.getRoomLinearDistance(creep.room.name, billtong_room)
                // searchedRooms is unset on a fresh creep, so && short-
                // circuited and we never took a known billtong room
                if((!creep.memory.searchedRooms || !creep.memory.searchedRooms.includes(billtong_room)) && Game.map.getRoomLinearDistance(creep.room.name, billtong_room) <= 4) {
                    creep.memory.targetRoom = billtong_room;
                    return;
                }
            }
        }

        let listOfPossibleRooms = depositFallbackRooms(creep.memory.homeRoom);

        let lowest = [100, 100];
        for(let i=0; i<listOfPossibleRooms.length; i++) {
            if(creep.memory.searchedRooms && _.includes(creep.memory.searchedRooms, listOfPossibleRooms[i], 0)) {
                continue;
            }

            let current = Game.map.getRoomLinearDistance(creep.memory.homeRoom, listOfPossibleRooms[i])
            if(current < lowest[1]) {
                lowest = [i, current];
            }
        }
        if(lowest[0] >= listOfPossibleRooms.length) {
            // every candidate is already in searchedRooms (or there are none):
            // lowest kept its [100,100] sentinel, so assigning here wrote
            // targetRoom = undefined and the creep re-scanned this same dead
            // list every tick for the rest of its life
            creep.memory.suicide = true;
            return;
        }
        creep.memory.targetRoom = listOfPossibleRooms[lowest[0]];
    }


    if(creep.memory.full) {
        if(creep.room.name != creep.memory.homeRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
        }

        let terminal = creep.room.terminal;
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        // a terminal that cannot accept used to shadow the storage fallback
        // forever — transfer ERR_FULL every tick, `full` never cleared
        if(terminal && terminal.store.getFreeCapacity() > 0 && creep.store.getFreeCapacity() < MaxStorage) {
            if(creep.pos.isNearTo(terminal)) {
                for(let resourceType in creep.carry) {
                    creep.transfer(terminal, resourceType);
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(terminal, 1);
            }
        }
        else if(storage && creep.store.getFreeCapacity() < MaxStorage) {
            if(creep.pos.isNearTo(storage)) {
                for(let resourceType in creep.carry) {
                    creep.transfer(storage, resourceType);
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
        }
    }

    if(!creep.memory.full) {
        if(creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        }

        if(!creep.memory.deposit) {
            let deposits:any = creep.room.find(FIND_DEPOSITS);
            if(deposits.length > 0) {
                creep.memory.deposit = deposits[0].id;
                creep.memory.targetRoom = deposits[0].room.name;
                // Seeded per owned room in rooms(); a billtong that outlives
                // every owned room would read .includes on undefined.
                if(!Memory.billtong_rooms) Memory.billtong_rooms = [];
                if(!Memory.billtong_rooms.includes(creep.room.name)) {
                    Memory.billtong_rooms.push(creep.room.name);
                }
            }
            else {
                if(Memory.billtong_rooms && Memory.billtong_rooms.includes(creep.room.name)) {
                    let indexOfUselessRoom = Memory.billtong_rooms.indexOf(creep.room.name);
                    Memory.billtong_rooms.splice(indexOfUselessRoom, 1);
                }
            }

            if(creep.room.name == creep.memory.targetRoom) {
                if(!creep.memory.searchedRooms) {
                    creep.memory.searchedRooms = [];
                }
                if(!_.includes(creep.memory.searchedRooms, creep.room.name, 0)) {
                    creep.memory.searchedRooms.push(creep.room.name);
                }
                delete creep.memory.targetRoom;
            }
        }

        if(creep.memory.deposit) {
            let deposit:any = Game.getObjectById(creep.memory.deposit);
            if(!deposit && Game.time % 3 == 0) {
                creep.memory.deposit = null;
                return;
            }


            if(deposit && deposit.room.name == creep.room.name) {
                if(creep.room.name !== creep.memory.targetRoom) {
                    creep.memory.targetRoom = creep.room.name;
                }
                // flee on the walk in, not only once adjacent — otherwise we
                // close onto the hostile, home, dump, walk back (yo-yo)
                if(creep.room.memory.roomData && creep.room.memory.roomData.has_hostile_creeps) {
                    if(creep.store.getUsedCapacity() > 0) {
                        creep.memory.full = true;
                    }
                    else {
                        delete creep.memory.deposit;
                        delete creep.memory.targetRoom;
                    }
                }
                else if(creep.pos.isNearTo(deposit)) {
                    if(!creep.memory.timeToGetHome) {
                        creep.memory.timeToGetHome = 1500 - creep.ticksToLive + 10;
                    }
                    if(deposit.cooldown == 0) {
                        creep.harvest(deposit);
                    }

                    if(Game.time % 10 == 0) {
                        let droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: r => r.pos.getRangeTo(creep) <= 3 && (r.resourceType == RESOURCE_METAL || r.resourceType == RESOURCE_BIOMASS || r.resourceType == RESOURCE_SILICON || r.resourceType == RESOURCE_MIST)});
                        if(droppedResources.length > 0) {
                            let closestDroppedResource = creep.pos.findClosestByRange(droppedResources);
                            if(creep.pos.isNearTo(closestDroppedResource)) {
                                creep.pickup(closestDroppedResource);
                            }
                            else {
                                creep.MoveCostMatrixRoadPrio(closestDroppedResource, 1);
                            }
                            return;
                        }
                    }
                }
                else {
                    creep.moveTo(deposit);
                }
            }

            // dump at home before recycle — suicide used to skip the cargo
            if(creep.memory.timeToGetHome && creep.ticksToLive <= creep.memory.timeToGetHome) {
                creep.memory.suicide = true;
                if(creep.store.getUsedCapacity() > 0) {
                    creep.memory.full = true;
                }
            }
        }

    }
}


const roleBilltong = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleBilltong;
