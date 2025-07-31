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
    } catch (error) {
        console.log(`Error running creep ${name}:`, error);
    }
}

export default RunCreepManager;
