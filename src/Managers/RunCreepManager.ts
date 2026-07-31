import { logAlways } from "utils/Logger";

function RunCreepManager(name) {
    try {
        let creep = Game.creeps[name];
        if(!creep) {
            delete Memory.creeps[name];
            return;
        }
        
        if(creep.memory.role == undefined) {
            console.log("i am undefined", name)
            creep.suicide();
            return;
        }
        
        if (!global.ROLES[creep.memory.role]) {
            console.log(`Unknown role: ${creep.memory.role} for creep ${name}`);
            return;
        }
        
        let creepUsed = Game.cpu.getUsed();
        global.ROLES[creep.memory.role].run(creep);
        if(global.profiler) {
          console.log(creep.memory.role, "used", (Game.cpu.getUsed() - creepUsed).toFixed(2))
        }
    } catch (error: any) {
        // include the top stack frames — a bare message ("Invalid arguments in
        // RoomPosition constructor") is undiagnosable once the creep dies
        const stack = error && error.stack ? String(error.stack).split("\n").slice(0, 4).join(" | ") : String(error);
        const role = (Memory.creeps && Memory.creeps[name] && (Memory.creeps[name] as any).role) || "?";
        logAlways(`Error running creep ${name} (role ${role}): ${stack}`);
        // a poisoned movement cache (dest with a bad room name) re-throws every
        // tick until the creep dies — wipe it so the next tick starts clean
        if (/Invalid room name|Invalid arguments in RoomPosition/.test(String(error)) && Memory.creeps && Memory.creeps[name]) {
            delete (Memory.creeps[name] as any)._move;
            delete (Memory.creeps[name] as any)._trav;
        }
    }
}

export default RunCreepManager;
