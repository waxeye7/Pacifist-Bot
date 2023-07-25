function factory(room) {
    if(room.controller && room.controller.my && room.controller.level >= 7 && Game.time % 10 == 0) {
        if(!room.memory.Structures.factory) {
            let factories = room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_FACTORY});
            if(factories.length > 0) {
                room.memory.Structures.factory = factories[0].id;
            }
        }



        if(room.memory.Structures.factory) {
            let factory:any = Game.getObjectById(room.memory.Structures.factory);
            let storage:any = Game.getObjectById(room.memory.Structures.storage);
            if(factory && factory.cooldown == 0 && factory.store[RESOURCE_ENERGY] >= 600 && storage.store[RESOURCE_BATTERY] === 0 && storage && storage.store[RESOURCE_ENERGY] > 250000) {
                factory.produce(RESOURCE_BATTERY);
            }
            else if(factory && factory.cooldown == 0 && factory.store[RESOURCE_BATTERY] >= 50 && factory.store.getFreeCapacity() >= 450 && storage && (storage.store[RESOURCE_BATTERY] > 200 || storage.store[RESOURCE_ENERGY] <= 100000 || Memory.targetRampRoom.urgent && storage.store[RESOURCE_ENERGY] < 80000)) {
                factory.produce(RESOURCE_ENERGY);
            }
            // if(factory.cooldown == 0) {
            //     let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            //     if(factory.store[RESOURCE_KEANIUM_BAR] < 10000 &&
            //         factory.store[RESOURCE_ENERGY] >= 200 &&
            //         factory.store[RESOURCE_KEANIUM] >= 500 &&
            //         storage && storage.store[RESOURCE_ENERGY] > 475000) {
            //         factory.produce(RESOURCE_KEANIUM_BAR);
            //     }
            //     else if(factory.store[RESOURCE_KEANIUM_BAR] >= 20 &&
            //         factory.store[RESOURCE_ENERGY] >= 40 &&
            //         factory.store[RESOURCE_MIST] >= 100) {
            //             factory.produce(RESOURCE_CONDENSATE);
            //         }
            // }
        }



    }
}

export default factory;
// module.exports = market;
