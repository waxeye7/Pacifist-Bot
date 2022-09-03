/**
 * A little description of this function 
 * @param {Creep} creep
 **/
const run = function (creep) {
    if(creep.room.name == creep.memory.targetRoom) {
        const containers = creep.room.find(FIND_STRUCTURES, {filter: object => object.structureType == STRUCTURE_CONTAINER});
        let closestContainer = creep.pos.findClosestByRange(containers);
        if(creep.pos.getRangeTo(closestContainer) <= 3 && creep.pos.getRangeTo(closestContainer) > 1) {
            creep.moveTo(closestContainer);
            return;
        }
    }
    creep.harvestEnergy();
}
const roleEnergyMiner = {
    run,
    //run: run,
    //function2,
    //function3
};



module.exports = roleEnergyMiner;