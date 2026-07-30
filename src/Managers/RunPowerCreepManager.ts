import { powerDisabled } from "utils/Features";

function RunPowerCreepManager() {
if (powerDisabled()) {
    return;
}

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
