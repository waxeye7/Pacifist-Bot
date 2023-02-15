function QuadSquadRunManager(QuadSquadNameList) {

    for(let name of QuadSquadNameList) {
        let creep = Game.creeps[name];
        if(!creep) {
            delete Memory.creeps[name];
        }
        else {
            if(creep.memory.role == undefined) {
                console.log("i am undefined", name)
                creep.suicide();
            }
            if(creep.memory.role == "SquadCreepA") {
              global.ROLES[creep.memory.role].run(creep);
            }
        }
      }
      for(let name of QuadSquadNameList) {
        let creep = Game.creeps[name];
        if(!creep) {
            delete Memory.creeps[name];
        }
        else {
            if(creep.memory.role == undefined) {
                console.log("i am undefined", name)
                creep.suicide();
            }
            if(creep.memory.role !== "SquadCreepA") {
              global.ROLES[creep.memory.role].run(creep);
            }
        }
      }

}

export default QuadSquadRunManager;
