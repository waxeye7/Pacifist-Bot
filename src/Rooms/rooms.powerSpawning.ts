function powerSpawning(room) {
if(room.controller.level == 8) {

    if(!room.memory.Structures.powerSpawn) {
        let powerSpawns = room.find(FIND_MY_STRUCTURES, {filter:s => s.structureType == STRUCTURE_POWER_SPAWN});
        if(powerSpawns.length == 1) {
            room.memory.Structures.powerSpawn = powerSpawns[0].id;
        }
    }

    if(room.memory.Structures.powerSpawn) {
        let powerSpawn:any = Game.getObjectById(room.memory.Structures.powerSpawn);





    }

}
}

export default powerSpawning;
// module.exports = market;
