/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
    ;
    creep.memory.moving = false;

    if(creep.memory.suicide) {
        creep.recycle();
        return;
    }

    if(creep.memory.repairing && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.repairing = false;
    }
    if(!creep.memory.repairing && creep.store.getFreeCapacity() == 0) {
        creep.memory.repairing = true;
    }

    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();


    if(creep.memory.repairing) {
        let buildingsToRepair = [];
        creep.room.memory.keepTheseRoads.forEach(function(roadID) {
            let road:any = Game.getObjectById(roadID);
            if(road && road.hits <= road.hitsMax - 500) {
                buildingsToRepair.push(road);
            }
        });
        let containers = creep.room.find(FIND_STRUCTURES, {filter: s => s.structureType == STRUCTURE_CONTAINER && (s.id == creep.room.memory.Structures.bin || (s.id == creep.room.memory.Structures.controllerLink && creep.room.controller <= 6))});
        if(containers.length > 0) {
            for(let container of containers) {
                if(container.hits <= container.hitsMax - 500) {
                    buildingsToRepair.push(container);
                }
            }
        }

        if(!creep.memory.rampartsToRepair) {
            let rampartsInRoom = creep.room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType == STRUCTURE_RAMPART && s.hits < 50000});
            let idsOfRamparts = [];
            for(let rampart of rampartsInRoom) {
                idsOfRamparts.push(rampart.id);
            }
            creep.memory.rampartsToRepair = idsOfRamparts;
        }

        let rampartsIDS = creep.memory.rampartsToRepair;
        if(rampartsIDS.length > 0) {
            for(let rampart of rampartsIDS) {
                let rampObj:any = Game.getObjectById(rampart);
                if(rampObj && rampObj.hits <= 50000) {
                    buildingsToRepair.push(rampObj);
                }
            }
        }

        if(creep.room.memory.danger_timer > 0 && storage) {
            buildingsToRepair = buildingsToRepair.filter(function(b) {return storage.pos.getRangeTo(b) <= 10;});
        }

        if(buildingsToRepair.length > 0) {
            let closeByBuildings = creep.pos.findInRange(buildingsToRepair, 3);
            if(closeByBuildings.length > 0) {
                creep.repair(closeByBuildings[closeByBuildings.length - 1])
                if(closeByBuildings[closeByBuildings.length - 1].hits !== closeByBuildings[closeByBuildings.length - 1].hitsMax) {
                    creep.MoveCostMatrixRoadPrio(closeByBuildings[closeByBuildings.length - 1], 1)
                }
                else {
                    creep.MoveCostMatrixRoadPrio(closeByBuildings[0], 0)
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(creep.pos.findClosestByRange(buildingsToRepair), 3)
            }
        }
        else {
            creep.memory.suicide = true;
        }

    }
    else {
        if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, RESOURCE_ENERGY);
        }
        else {
            creep.MoveCostMatrixRoadPrio(storage, 1)
        }
    }


}

const roleMaintainer = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleMaintainer;
