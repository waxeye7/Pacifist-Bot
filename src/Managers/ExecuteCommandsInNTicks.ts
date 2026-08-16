/** A due command that never gets its bucket is dropped after this many ticks. */
const STARVED_TTL = 5000;

function ExecuteCommandsInNTicks() {

    if(!Memory.commandsToExecute) {
        Memory.commandsToExecute = [];
    }

    // Memory.commandsToExecute.push({delay:40, bucketNeeded:9500, formation:"Duo", homeRoom:"E33N59", Boosted:true, targetRoom:"E29N55"})
    let commands = Memory.commandsToExecute;

    // iterate backwards so splicing doesn't skip the next command
    for(let index = commands.length - 1; index >= 0; index --) {
        let command = commands[index];
        if(!command) {
            commands.splice(index, 1);
            continue;
        }
        if(command.delay > 0) {
            command.delay --;
            console.log(JSON.stringify(command))
        }

        // delay <= 0 is due. A negative delay (callers compute it from a creep's
        // travel time) used to match no branch at all, so the entry sat in memory
        // forever and kept rooms.observe's observeWaveInFlight() true for its
        // targetRoom — the observer never responded to that room again.
        else {
            if(!command.bucketNeeded || !command.formation) {
                commands.splice(index, 1);
                continue;
            }
            if(command.bucketNeeded <= Game.cpu.bucket) {
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
                else if(command.formation == "CCK") {
                    global.SCCK(command.homeRoom, command.targetRoom);
                }
                else if(command.formation == "CCKparty") {
                    global.spawn_hunting_party(command.homeRoom, command.targetRoom, command.controllerFreePositions);
                }
                commands.splice(index, 1);
                continue;
            }

            // Bucket-starved: keep waiting, but never forever.
            if(!command.waitingSince) {
                command.waitingSince = Game.time;
            }
            else if(Game.time - command.waitingSince >= STARVED_TTL) {
                console.log("Dropping stale command (bucket " + command.bucketNeeded +
                    " not reached in " + STARVED_TTL + " ticks): " + JSON.stringify(command));
                commands.splice(index, 1);
            }
        }
    }

    Memory.commandsToExecute = commands;


}

    export default ExecuteCommandsInNTicks;
