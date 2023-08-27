function powerSpawning(room) {
if(room.controller.level == 8) {

    if(Game.time % 5000 == 0 && !Game.powerCreeps["efficient-" + room.name] && room.storage && room.terminal && room.memory.Structures.powerSpawn && Game.getObjectById(room.memory.Structures.powerSpawn) && room.find(FIND_MY_SPAWNS).length) {
        let allow = true;
        for(let name in Game.powerCreeps) {
            let roomName = name.split("-")[1];
            if(!Game.rooms[roomName] || Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.level !== 8) {
                Game.powerCreeps[name].rename("efficient-" + room.name);
                allow = false;
            }
        }
        if(allow) {
            PowerCreep.create("efficient-" + room.name, POWER_CLASS.OPERATOR);
        }
    }



    if(!room.memory.Structures.powerSpawn) {
        let powerSpawns = room.find(FIND_MY_STRUCTURES, {filter:s => s.structureType == STRUCTURE_POWER_SPAWN});
        if(powerSpawns.length == 1) {
            room.memory.Structures.powerSpawn = powerSpawns[0].id;
        }
    }

    if(room.memory.Structures.powerSpawn) {
        let powerSpawn:any = Game.getObjectById(room.memory.Structures.powerSpawn);
        if(powerSpawn) {
            if(Game.cpu.bucket > 4000 && powerSpawn.store[RESOURCE_POWER] >= 1 && powerSpawn.store[RESOURCE_ENERGY] >= 50) {
                powerSpawn.processPower();
            }

            if(Game.powerCreeps["efficient-" + room.name] && !Game.powerCreeps["efficient-" + room.name].ticksToLive) {
                Game.powerCreeps["efficient-" + room.name].spawn(powerSpawn);
            }

        }







        else {
            room.memory.Structures.powerSpawn = false;
        }
    }

}
}

export default powerSpawning;
// module.exports = market;
