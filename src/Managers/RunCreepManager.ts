function RunCreepManager(name) {

    let creep = Game.creeps[name];
    if(!creep) {
        delete Memory.creeps[name];
    }
    else {
      if(creep.memory.role == undefined) {
          console.log("i am undefined", name)
          creep.suicide();
      }
      else {
        let creepUsed = Game.cpu.getUsed();
        global.ROLES[creep.memory.role].run(creep);
        if(global.profiler) {
          console.log(creep.memory.role, "used", (Game.cpu.getUsed() - creepUsed).toFixed(2))
        }
      }
    }

}

export default RunCreepManager;
