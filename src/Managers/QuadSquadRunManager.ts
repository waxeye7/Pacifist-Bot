import { inferRoleFromName } from "./RunCreepManager";
import { logAlways } from "utils/Logger";

function QuadSquadRunManager(QuadSquadNameList) {

    // Leaders first (SquadCreepA / DuoCreepA), then followers — a follower that
    // runs before its leader reads a stale position.
    for(let pass = 0; pass < 2; pass++) {
      for(let name of QuadSquadNameList) {
        let creep = Game.creeps[name];
        if(!creep) {
            delete Memory.creeps[name];
        }
        else {
            if(creep.memory.role == undefined) {
                // Same rule as RunCreepManager: never suicide on a wiped role.
                // A squad creep that dies here strands its three partners at
                // the rally point for the rest of their lives.
                const inferred = inferRoleFromName(name);
                if (inferred && global.ROLES[inferred]) {
                    creep.memory.role = inferred;
                    logAlways("[memory] restored role " + inferred + " from name " + name + " @" + creep.room.name);
                } else {
                    if ((creep.ticksToLive || 1500) % 100 === 0) {
                        logAlways("[memory] role-undefined skip " + name + " @" + creep.room.name);
                    }
                    continue;
                }
            }
            const isLeader = creep.memory.role === "SquadCreepA" || creep.memory.role === "DuoCreepA";
            if((pass === 0) === isLeader && global.ROLES[creep.memory.role]) {
              global.ROLES[creep.memory.role].run(creep);
            }
        }
      }
    }
}

export default QuadSquadRunManager;
