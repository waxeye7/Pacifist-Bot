/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.Speak();

    // if(creep.body[creep.body.length - 3].boost == undefined && creep.ticksToLive > 1465 && creep.room.memory.labs && creep.room.memory.labs.status.currentOutput == RESOURCE_UTRIUM_OXIDE) {

    //     let outputLabs = [];
    //     let outputLab1;
    //     let outputLab2;
    //     let outputLab3;
    //     let outputLab4;
    //     let outputLab5;
    //     let outputLab6;
    //     let outputLab7;
    //     let outputLab8;

    //     if(creep.room.memory.labs.outputLab1) {
    //         outputLab1 = Game.getObjectById(creep.room.memory.labs.outputLab1)
    //         outputLabs.push(outputLab1)
    //     }
    //     if(creep.room.memory.labs.outputLab2) {
    //         outputLab2 = Game.getObjectById(creep.room.memory.labs.outputLab2)
    //         outputLabs.push(outputLab2)
    //     }
    //     if(creep.room.memory.labs.outputLab3) {
    //         outputLab3 = Game.getObjectById(creep.room.memory.labs.outputLab3)
    //         outputLabs.push(outputLab3)
    //     }
    //     if(creep.room.memory.labs.outputLab4) {
    //         outputLab4 = Game.getObjectById(creep.room.memory.labs.outputLab4)
    //         outputLabs.push(outputLab4)
    //     }
    //     if(creep.room.memory.labs.outputLab5) {
    //         outputLab5 = Game.getObjectById(creep.room.memory.labs.outputLab5)
    //         outputLabs.push(outputLab5)
    //     }
    //     if(creep.room.memory.labs.outputLab6) {
    //         outputLab6 = Game.getObjectById(creep.room.memory.labs.outputLab6)
    //         outputLabs.push(outputLab6)
    //     }
    //     if(creep.room.memory.labs.outputLab7) {
    //         outputLab7 = Game.getObjectById(creep.room.memory.labs.outputLab7)
    //         outputLabs.push(outputLab7)
    //     }
    //     if(creep.room.memory.labs.outputLab8) {
    //         outputLab8 = Game.getObjectById(creep.room.memory.labs.outputLab8)
    //         outputLabs.push(outputLab8)
    //     }

    //     if(outputLabs.length > 1) {
    //         outputLabs.sort((a,b) => b.store[creep.room.memory.labs.status.currentOutput] - a.store[creep.room.memory.labs.status.currentOutput]);
    //     }

    //     if(outputLabs && outputLabs.length > 0 && outputLabs[0] && outputLabs[0].store[creep.room.memory.labs.status.currentOutput] >= 30) {
    //         if(creep.pos.isNearTo(outputLabs[0])) {
    //             outputLabs[0].boostCreep(creep);
    //         }
    //         else {
    //             creep.moveTo(outputLabs[0]);
    //         }
    //         return;
    //     }
    // }



    if(!creep.memory.deposit) {
        let found_deposit = creep.room.find(FIND_MINERALS);
        creep.memory.deposit = found_deposit[0];
    }

    let deposit:any = Game.getObjectById(creep.memory.deposit.id);
    if(deposit.mineralAmount == 0) {
        creep.memory.suicide = true;
    }


    if(!creep.memory.mining && creep.store[deposit.mineralType] == 0) {
        creep.memory.mining = true;
    }
    else if(creep.memory.mining && creep.store.getFreeCapacity() == 0) {
        creep.memory.mining = false;
    }

    if(creep.memory.mining) {
        if(creep.pos.isNearTo(deposit)) {
            creep.harvest(deposit);
        }
        else {
            creep.moveTo(deposit, {reusePath:20, ignoreRoads:true});
        }
    }
    else {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        if(storage && storage.store[deposit.mineralType] < 10000) {
            if(creep.pos.isNearTo(storage)) {
                creep.transfer(storage, deposit.mineralType);
            }
            else {
                creep.moveTo(storage, {reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
            }
            return;
        }


        let terminal = creep.room.terminal;

        if(terminal && terminal.store[deposit.mineralType] < 5000) {
            if(creep.pos.isNearTo(terminal)) {
                creep.transfer(terminal, deposit.mineralType);
            }
            else {
                creep.moveTo(terminal, {reusePath:20});
            }
            return;
        }


        if(storage) {
            if(creep.pos.isNearTo(storage)) {
                creep.transfer(storage, deposit.mineralType);
            }
            else {
                creep.moveTo(storage, {reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
            }
            return;
        }
    }

	if(creep.ticksToLive <= 60 && creep.memory.mining) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
	}

}

const roleMineralMiner = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleMineralMiner;
