import QuadSquadRunManager from "./QuadSquadRunManager";
import RunCreepManager from "./RunCreepManager";
import RunPowerCreepManager from "./RunPowerCreepManager";

function RunAllCreepsManager() {

    const start = Game.cpu.getUsed()


    RunPowerCreepManager();


    let executeCreepScriptsLaterList = [];
    for(let name in Memory.creeps) {
      if(name.startsWith("SquadCreepA") || name.startsWith("SquadCreepB") || name.startsWith("SquadCreepY") || name.startsWith("SquadCreepZ")) {
        executeCreepScriptsLaterList.push(name);
      }
      else {
        RunCreepManager(name);
      }
    }

    QuadSquadRunManager(executeCreepScriptsLaterList);
    console.log('Creeps Ran in', Game.cpu.getUsed() - start, 'ms');

}

export default RunAllCreepsManager;
