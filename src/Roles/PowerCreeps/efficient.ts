const run = function (creep) {
    creep.memory.moving = false;

    if(creep.room.memory.danger && creep.powers[PWR_GENERATE_OPS] && creep.powers[PWR_GENERATE_OPS].cooldown == 0 && creep.store.getFreeCapacity() > 0) creep.usePower(PWR_GENERATE_OPS);
    if(creep.room.controller && !creep.room.controller.isPowerEnabled) {
        if(creep.pos.isNearTo(creep.room.controller)) {
            creep.enableRoom(creep.room.controller);
        }
        else {
            creep.MoveCostMatrixRoadPrio(creep.room.controller, 1);
        }
        return;
    }
    if(creep.ticksToLive < 120) {
        let powerSpawn:any = Game.getObjectById(creep.room.memory.Structures.powerSpawn);
        if(powerSpawn) {
            if(creep.pos.isNearTo(powerSpawn)) {
                creep.renew(powerSpawn);
            }
            else {
                creep.MoveCostMatrixRoadPrio(powerSpawn, 1);
            }
            return;
        }
    }

    let storage:any = creep.room.storage;
    let terminal = creep.room.terminal;

    let danger = creep.room.memory.danger;



    if(creep.store.getFreeCapacity() === 0) {
        creep.memory.full = true;
    }
    if(creep.store.getUsedCapacity() === 0) {
        creep.memory.full = false;
    }


    if(creep.memory.full ) {
        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                for(let resource in creep.store) {
                    if(creep.transfer(storage, resource, creep.store[resource] - 50) === 0 && resource === RESOURCE_OPS) {
                        creep.memory.full = false;
                    }
                }
            }
            else {
                creep.MoveCostMatrixRoadPrio(storage, 1);
            }
            return;
        }
    }

        for(let power in creep.powers) {

            if(parseInt(power) == PWR_GENERATE_OPS) {

                if(creep.powers[power].cooldown == 0) {
                    creep.usePower(power)
                    return;
                }
            }
            else if(parseInt(power) == PWR_OPERATE_EXTENSION) {

                if(creep.powers[power].cooldown == 0 && storage && storage.store[RESOURCE_ENERGY] > 15000 && creep.store[RESOURCE_OPS] >= 3 && creep.room.energyAvailable !== creep.room.energyCapacityAvailable) {
                    usePowerInRange(creep, power, 3, storage);
                    return;
                }
            }

            else if(parseInt(power) == PWR_REGEN_SOURCE) {
                if(creep.powers[power].cooldown == 0 && !danger) {
                    if(!creep.memory.sources) {
                        creep.memory.sources = [];
                        let sources = creep.room.find(FIND_SOURCES);
                        if(sources.length > 0) {
                            for(let source of sources) {
                                creep.memory.sources.push({id:source.id, lastBuff:0})
                            }
                        }
                    }
                    if(creep.memory.sources) {
                        let index = 0;
                        for(let source of creep.memory.sources) {
                            if(Game.time - 300 > source.lastBuff) {
                                let sourceObj:any = Game.getObjectById(source.id);
                                if(sourceObj) {
                                    let result = usePowerInRange(creep, power, 3, sourceObj);
                                    if(result && result == "success") {
                                        creep.memory.sources[index].lastBuff = Game.time;
                                    }
                                    return;
                                }
                            }
                            index ++;
                        }
                    }
                }
            }
            else if(parseInt(power) == PWR_OPERATE_OBSERVER) {
                if(creep.powers[power].cooldown == 0) {
                    if(!creep.memory.observer) {
                        let observer = creep.room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_OBSERVER}});
                        if(observer.length > 0) {
                            creep.memory.observer = {id:observer[0].id, lastBuff:0};
                        }
                    }
                    if(creep.memory.observer) {
                        let lastBuffTimer = creep.powers[power].level * 200;
                        if(Game.time - lastBuffTimer > creep.memory.observer.lastBuff) {
                            let observer:any = Game.getObjectById(creep.memory.observer.id);
                            if(observer) {
                                let result = usePowerInRange(creep, power, 3, observer);
                                if(result && result == "success") {
                                    creep.memory.observer.lastBuff = Game.time;
                                }
                                return;
                            }
                        }
                    }
                }
            }
    }
}




function usePowerInRange(creep, power, range, target=false):any {
    if(creep.pos.getRangeTo(target) <= range) {
        if(creep.usePower(power, target) == 0) {
            return "success";
        }

    }
    else {
        creep.MoveCostMatrixRoadPrio(target, range);
    }
}



const roleEfficient = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleEfficient;
