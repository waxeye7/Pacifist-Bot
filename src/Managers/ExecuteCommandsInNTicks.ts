function ExecuteCommandsInNTicks() {

    if(!Memory.commandsToExecute) {
        Memory.commandsToExecute = [];
    }

    // Memory.commandsToExecute.push({delay:40, bucketNeeded:9500, formation:"Duo", homeRoom:"E33N59", Boosted:true, targetRoom:"E29N55"})
    let commands = Memory.commandsToExecute;

    let index = 0;
    for(let command of commands) {
        if(command.delay > 0) {
            command.delay --;
            console.log(JSON.stringify(command))
        }

        else if(command.delay == 0) {
            if(command.bucketNeeded && command.bucketNeeded <= Game.cpu.bucket) {
                if(command.formation == "Singleton") {
                    global.SS(command.homeRoom,command.targetRoom);
                }
                else if(command.formation == "Duo") {
                    global.SD(command.homeRoom,command.targetRoom,command.Boosted);
                }
                else if(command.formation == "ToughDuo") {
                    global.SDB(command.homeRoom,command.targetRoom,command.Boosted);
                }
                else if(command.formation == "RangedQuad") {
                    global.SQR(command.homeRoom,command.targetRoom,command.Boosted)
                }
                else if(command.formation == "MeleeQuad") {
                    global.SQM(command.homeRoom,command.targetRoom,command.Boosted)
                }
                else if(command.formation == "DismantleQuad") {
                    global.SQD(command.homeRoom,command.targetRoom,command.Boosted)
                }
                commands.splice(index, 1);
            }
            else if(!command.bucketNeeded || !command.formation) {
                commands.splice(index, 1);
            }

        }
        index ++;
    }

    Memory.commandsToExecute = commands;


}

    export default ExecuteCommandsInNTicks;
