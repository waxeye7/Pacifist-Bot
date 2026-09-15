import { powerDisabled } from "utils/Features";
import { logAlways } from "utils/Logger";

function RunPowerCreepManager() {
if (powerDisabled()) {
    return;
}

for(let name in Game.powerCreeps) {
    if(name.startsWith("efficient")) {
        let creep = Game.powerCreeps[name];
        if(creep && creep.ticksToLive) {
            // RunCreepManager catches per creep; a throw here used to escape
            // into phase("creeps") and skip every creep after it for the tick.
            try {
                global.ROLES["efficient"].run(creep);
            } catch (error: any) {
                const stack = error && error.stack ? String(error.stack).split("\n").slice(0, 4).join(" | ") : String(error);
                logAlways(`Error running power creep ${name}: ${stack}`);
            }
        }
    }
}

}

export default RunPowerCreepManager;
