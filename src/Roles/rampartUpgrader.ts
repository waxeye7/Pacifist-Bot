/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { rampartIsBuried } from "utils/Interior";
import { rampartHitsTarget } from "Rooms/rooms.defence";

 const run = function (creep) {
    creep.memory.moving = false;

    if(creep.memory.homeRoom && creep.memory.homeRoom != creep.room.name) {
        return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
    }

    if(creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.repairing = false;
        creep.memory.locked = false;
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }
    if(!creep.memory.repairing) {
        creep.harvestEnergy();
    }
    if(creep.memory.repairing) {
        if(!creep.memory.locked) {
            // This role's whole job is pumping hits into the weakest rampart,
            // so it must never be aimed at a BURIED one — a tile at depth >= 4
            // behind the final wall is out of ranged reach from anywhere an
            // enemy can stand and every hit put into it is wasted (utils/Interior
            // rampartIsBuried; fail-open false without usable shell geometry).
            // ...and never one already at the room's hits policy (12.5M at
            // RCL8). Without a ceiling this role's whole job — pumping the
            // weakest rampart — ran until hitsMax (300M at RCL8).
            let rampartsInRoom = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.hits < rampartHitsTarget(creep.room) && !rampartIsBuried(creep.room, s.pos)});
            if(rampartsInRoom.length > 0) {
                rampartsInRoom.sort((a,b) => a.hits - b.hits);
                creep.memory.locked = rampartsInRoom[0].id
            }
        }
        if(creep.memory.locked) {
            let target:any = Game.getObjectById(creep.memory.locked);
            // re-checked at use: the lock survives across ticks, so a rampart
            // that reached the policy ceiling must be released, not pumped
            // past it
            if(target && target.hits < rampartHitsTarget(creep.room)) {
                if(creep.pos.getRangeTo(target) <= 3) {
                    creep.repair(target);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(target, 3);
                }
            }
            else {
                creep.memory.locked = false;
            }

        }

    }

}

const roleRampartUpgrader = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleRampartUpgrader;
