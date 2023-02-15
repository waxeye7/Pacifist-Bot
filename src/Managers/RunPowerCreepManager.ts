function RunPowerCreepManager() {

for(let name in Game.powerCreeps) {
    if(name.startsWith("efficient")) {
        let creep = Game.powerCreeps[name];
        if(creep && creep.ticksToLive) {
        global.ROLES["efficient"].run(creep);
        }
    }
}

}

export default RunPowerCreepManager;
