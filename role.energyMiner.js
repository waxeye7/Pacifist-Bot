/**
 * A little description of this function 
 * @param {Creep} creep
 **/
// const run = function (creep) {
//     creep.harvestEnergy();
// }

const run = function (creep) {
    creep.harvestEnergy();

}
const roleEnergyMiner = {
    run,
    //run: run,
    //function2,
    //function3
};



module.exports = roleEnergyMiner;










// const run = function (creep) {
//     if(creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
//         creep.memory.working = false;
//     }
//     if(!creep.memory.working && creep.store.getFreeCapacity() == 0) {
//         creep.memory.working = true;
//     }
//     if(creep.memory.working) {
//         if(creep.memory.homeRoom && creep.memory.homeRoom !== creep.room.name) {
//             const buildingsToRepair = creep.room.find(FIND_STRUCTURES, {filter: object => object.hits < object.hitsMax && (object.structureType == STRUCTURE_ROAD || object.structureType == STRUCTURE_CONTAINER)});
//             let closestBuildingToRepair = creep.pos.findClosestByRange(buildingsToRepair);

//             let buildingsToBuild = creep.room.find(FIND_CONSTRUCTION_SITES);

//             if(creep.pos.isNearTo(closestBuildingToRepair)) {
//                 creep.repair(closestBuildingToRepair);
//             }
//             else if(buildingsToBuild.length > 0) {
//                 let closestBuildingtoBuild = creep.pos.findClosestByRange(buildingsToBuild);
// 				if(creep.build(closestBuildingtoBuild) == ERR_NOT_IN_RANGE) {
// 					creep.moveTo(closestBuildingtoBuild, {visualizePathStyle: {stroke: '#000'}});
// 				}
//                 return;
//             }
//             return creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoom));
//         }

//         let storage = creep.room.storage;
//         if(storage) {
//             if(creep.pos.isNearTo(storage)) {
//                 creep.transfer(storage, RESOURCE_ENERGY);
//             }
//             else {
//                 creep.moveTo(storage);
//             }
//         }
//         else {
//             let targets = creep.room.find(FIND_STRUCTURES, {filter: (structure) => {return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_TOWER  || structure.structureType == STRUCTURE_CONTAINER) &&structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;}});
//             if(targets.length > 0) {
//                 let target = creep.pos.findClosestByRange(targets);

//                 if(creep.pos.isNearTo(target)) {
//                     creep.transfer(target, RESOURCE_ENERGY);
//                 }
//                 else {
//                     creep.moveTo(target);
//                 }
//             }
//         }

//     }
//     else {
//         creep.harvestEnergy();
//     }
// }