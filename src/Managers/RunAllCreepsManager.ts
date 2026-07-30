import QuadSquadRunManager from "./QuadSquadRunManager";
import RunCreepManager from "./RunCreepManager";
import RunPowerCreepManager from "./RunPowerCreepManager";
import { powerDisabled } from "utils/Features";

function RunAllCreepsManager() {

    const start = Game.cpu.getUsed()


    if (!powerDisabled()) {
        RunPowerCreepManager();
    }


    let executeCreepScriptsLaterList = [];
    const creepNames = Object.keys(Memory.creeps);
    for(let name of creepNames) {
      if(!Game.creeps[name]) {
        delete Memory.creeps[name];
        continue;
      }
      if(name.startsWith("SquadCreepA") || name.startsWith("SquadCreepB") || name.startsWith("SquadCreepY") || name.startsWith("SquadCreepZ")) {
        executeCreepScriptsLaterList.push(name);
      }
      else {
        RunCreepManager(name);
      }
    }

    QuadSquadRunManager(executeCreepScriptsLaterList);
    // gated by Memory.verbose via Logger
    console.log('Creeps Ran in', Game.cpu.getUsed() - start, 'ms');

}

export default RunAllCreepsManager;
