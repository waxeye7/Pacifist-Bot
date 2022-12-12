/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {
    creep.Speak();

    if(!creep.memory.MaxStorage) {
        let carryPartsAmount = 0
        for(let part of creep.body) {
            if(part.type == CARRY) {
                carryPartsAmount += 1;
            }
        }
        creep.memory.MaxStorage = carryPartsAmount * 50;
    }
    let MaxStorage = creep.memory.MaxStorage;

    if(creep.roadCheck()) {
        creep.moveAwayIfNeedTo();
    }

	if(creep.ticksToLive <= 10 && _.keys(creep.store).length == 0) {
		creep.memory.suicide = true;
	}
	if(creep.memory.suicide == true) {
		creep.recycle();
        return;
	}




    if(creep.store.getFreeCapacity() == MaxStorage) {
        creep.memory.target = false
    }

    if(creep.memory.target) {
        let target = Game.getObjectById(creep.memory.target);
        if(creep.pos.isNearTo(target)) {
            for(let resource in creep.store) {
                creep.transfer(target, resource);
            }
        }
        else {
            creep.moveTo(target);
        }
    }
    if(!creep.memory.target) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();
        let terminal = creep.room.terminal;
        let factory; if(creep.room.controller.level >= 7 && creep.room.memory.factory) {factory = Game.getObjectById(creep.room.memory.factory);}
        let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLinkToStorage();
        let bin = Game.getObjectById(creep.room.memory.bin) || creep.room.findBin(storage);


        if(closestLink && closestLink.store[RESOURCE_ENERGY] > 0 && creep.store.getFreeCapacity() == MaxStorage) {
            if(creep.pos.isNearTo(closestLink)) {
                creep.withdraw(closestLink, RESOURCE_ENERGY);
                creep.memory.target = storage.id;
            }
            else {
                creep.moveTo(closestLink);
            }
            return;
        }


        if(bin && bin.store.getFreeCapacity() < 2000 && creep.store.getFreeCapacity() == MaxStorage) {
            if(creep.pos.isNearTo(bin)) {
                for(let resourceType in bin.store) {
                    creep.withdraw(bin, resourceType);
                }
                creep.memory.target = storage.id;
            }
            else {
                creep.moveTo(bin);
            }
            return;
        }

		if(!creep.memory.controllerLink && creep.room.controller && creep.room.controller.level >= 7) {
			let links = creep.room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LINK});
			if(links.length > 3) {
				let controllerLink = creep.room.controller.pos.findClosestByRange(links);
				creep.memory.controllerLink = controllerLink.id;
			}
		}
        if(creep.room.controller && creep.room.controller.level >= 7 && creep.memory.controllerLink) {
            let controllerLink:any = Game.getObjectById(creep.memory.controllerLink);
            if(controllerLink && controllerLink.store[RESOURCE_ENERGY] <= 200) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, RESOURCE_ENERGY);
                    creep.memory.target = controllerLink.id;
                }
                else {
                    creep.moveTo(storage);
                }
                return;
            }
        }


        if(terminal && terminal.store[RESOURCE_ENERGY] > 105000 && creep.store.getFreeCapacity() == MaxStorage) {
            if(creep.pos.isNearTo(terminal)) {
                creep.withdraw(terminal, RESOURCE_ENERGY);
                creep.memory.target = storage.id;
            }
            else {
                creep.moveTo(terminal);
            }
            return;
        }

        if(creep.room.memory.labs && Object.keys(creep.room.memory.labs).length >= 4) {
            let inputLab1; let inputLab2;
            let outputLab1; let outputLab2; let outputLab3; let outputLab4;
            let outputLab5; let outputLab6; let outputLab7; let outputLab8;

            let outputLabs = [];

            if(creep.room.memory.labs.inputLab1) {inputLab1 = Game.getObjectById(creep.room.memory.labs.inputLab1)}
            if(creep.room.memory.labs.inputLab2) {inputLab2 = Game.getObjectById(creep.room.memory.labs.inputLab2)}
            if(creep.room.memory.labs.outputLab1) {
                outputLab1 = Game.getObjectById(creep.room.memory.labs.outputLab1)
                outputLabs.push(outputLab1)
            }
            if(creep.room.memory.labs.outputLab2) {
                outputLab2 = Game.getObjectById(creep.room.memory.labs.outputLab2)
                outputLabs.push(outputLab2)
            }
            if(creep.room.memory.labs.outputLab3) {
                outputLab3 = Game.getObjectById(creep.room.memory.labs.outputLab3)
                outputLabs.push(outputLab3)
            }
            if(creep.room.memory.labs.outputLab4) {
                outputLab4 = Game.getObjectById(creep.room.memory.labs.outputLab4)
                outputLabs.push(outputLab4)
            }
            if(creep.room.memory.labs.outputLab5) {
                outputLab5 = Game.getObjectById(creep.room.memory.labs.outputLab5)
                outputLabs.push(outputLab5)
            }
            if(creep.room.memory.labs.outputLab6) {
                outputLab6 = Game.getObjectById(creep.room.memory.labs.outputLab6)
                outputLabs.push(outputLab6)
            }
            if(creep.room.memory.labs.outputLab7) {
                outputLab7 = Game.getObjectById(creep.room.memory.labs.outputLab7)
                outputLabs.push(outputLab7)
            }
            if(creep.room.memory.labs.outputLab8) {
                outputLab8 = Game.getObjectById(creep.room.memory.labs.outputLab8)
                outputLabs.push(outputLab8)
            }

            let currentOutput = creep.room.memory.labs.status.currentOutput;
            let lab1Input = creep.room.memory.labs.status.lab1Input;
            let lab2Input = creep.room.memory.labs.status.lab2Input;


            if(inputLab1 && inputLab1.mineralType != undefined && inputLab1.mineralType != lab1Input) {
                if(creep.pos.isNearTo(inputLab1)) {
                    creep.withdraw(inputLab1, inputLab1.mineralType);
                    creep.memory.target = storage.id;
                }
                else {
                    creep.moveTo(inputLab1);
                }
                return;
            }

            if(inputLab2 && inputLab2.mineralType != undefined && inputLab2.mineralType != lab2Input) {
                if(creep.pos.isNearTo(inputLab2)) {
                    creep.withdraw(inputLab2, inputLab2.mineralType);
                    creep.memory.target = storage.id;
                }
                else {
                    creep.moveTo(inputLab2);
                }
                return;
            }

            for(let outputLab of outputLabs) {
                if(outputLab && (outputLab.mineralType != undefined && outputLab.mineralType != currentOutput) || outputLab.mineralType == currentOutput && outputLab.store[outputLab.mineralType] > MaxStorage) {
                    if(creep.pos.isNearTo(outputLab)) {
                        creep.withdraw(outputLab, outputLab.mineralType);
                        creep.memory.target = storage.id;
                    }
                    else {
                        creep.moveTo(outputLab);
                    }
                    return;
                }
            }

            if((inputLab1 && inputLab1.mineralType == undefined || inputLab1 && inputLab1.mineralType == lab1Input && inputLab1.store[inputLab1.mineralType] < 600) &&
            storage && storage.store[lab1Input] >= MaxStorage) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, lab1Input);
                    creep.memory.target = inputLab1.id;
                }
                else {
                    creep.moveTo(storage);
                }
                return;
            }

            if((inputLab1 && inputLab1.mineralType == undefined || inputLab1 && inputLab1.mineralType == lab1Input && inputLab1.store[inputLab1.mineralType] < 600) &&
            terminal && terminal.store[lab1Input] >= MaxStorage) {
                if(creep.pos.isNearTo(terminal)) {
                    creep.withdraw(terminal, lab1Input);
                    creep.memory.target = inputLab1.id;
                }
                else {
                    creep.moveTo(terminal);
                }
                return;
            }

            if((inputLab2 && inputLab2.mineralType == undefined || inputLab2 && inputLab2.mineralType == lab2Input && inputLab2.store[inputLab2.mineralType] < 600) &&
            storage && storage.store[lab2Input] >= MaxStorage) {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, lab2Input);
                    creep.memory.target = inputLab2.id;
                }
                else {
                    creep.moveTo(storage);
                }
                return;
            }

            if((inputLab2 && inputLab2.mineralType == undefined || inputLab2 && inputLab2.mineralType == lab2Input && inputLab2.store[inputLab2.mineralType] < 600) &&
            terminal && terminal.store[lab2Input] >= MaxStorage) {
                if(creep.pos.isNearTo(terminal)) {
                    creep.withdraw(terminal, lab2Input);
                    creep.memory.target = inputLab2.id;
                }
                else {
                    creep.moveTo(terminal);
                }
                return;
            }
        }

        let Mineral:any = Game.getObjectById(creep.room.memory.mineral) || creep.room.findMineral();
        let MineralType = Mineral.mineralType;

        if(storage && storage.store[MineralType] > 20000 && terminal && terminal.store.getFreeCapacity() > MaxStorage) {
            if(creep.pos.isNearTo(storage)) {
                creep.withdraw(storage, MineralType);
                creep.memory.target = terminal.id;
            }
            else {
                creep.moveTo(storage);
            }
            return;
        }

        let listOfResourcesToTerminal:any = [RESOURCE_BATTERY, RESOURCE_OPS];
        if(storage && terminal && terminal.store.getFreeCapacity() > MaxStorage * 10 && (storage.store[RESOURCE_BATTERY] >= MaxStorage || storage.store[RESOURCE_OPS] >= MaxStorage)) {
            if(creep.pos.isNearTo(storage)) {
                for(let resource in storage.store) {
                    if(listOfResourcesToTerminal.includes(resource)) {
                        creep.withdraw(storage, resource);
                    }
                }
                creep.memory.target = terminal.id;
            }
            else {
                creep.moveTo(storage);
            }
            return;
        }

        let listOfResourcesToFactory:any = [RESOURCE_MIST, RESOURCE_BIOMASS, RESOURCE_METAL, RESOURCE_SILICON];
        if(storage && factory && factory.store.getFreeCapacity() > MaxStorage * 2 && (storage.store[RESOURCE_MIST] >= MaxStorage || storage.store[RESOURCE_BIOMASS] >= MaxStorage || storage.store[RESOURCE_METAL] >= MaxStorage || storage.store[RESOURCE_SILICON] >= MaxStorage)) {
            if(creep.pos.isNearTo(storage)) {
                for(let resource in storage.store) {
                    if(listOfResourcesToFactory.includes(resource)) {
                        creep.withdraw(storage, resource);
                    }
                }
                creep.memory.target = factory.id;
            }
            else {
                creep.moveTo(storage);
            }
            return;
        }

        let listOfResourcesToFactoryFromTerminal:any = [RESOURCE_MIST, RESOURCE_BIOMASS, RESOURCE_METAL, RESOURCE_SILICON];
        if(terminal && factory && factory.store.getFreeCapacity() > MaxStorage * 2 && (terminal.store[RESOURCE_MIST] >= MaxStorage || terminal.store[RESOURCE_BIOMASS] >= MaxStorage || terminal.store[RESOURCE_METAL] >= MaxStorage || terminal.store[RESOURCE_SILICON] >= MaxStorage)) {
            if(creep.pos.isNearTo(terminal)) {
                for(let resource in terminal.store) {
                    if(listOfResourcesToFactoryFromTerminal.includes(resource)) {
                        creep.withdraw(terminal, resource);
                    }
                }
                creep.memory.target = factory.id;
            }
            else {
                creep.moveTo(terminal);
            }
            return;
        }

        let listOfResourcesToTerminalFromFactory:any = [RESOURCE_KEANIUM_BAR];
        if(terminal && factory && terminal.store.getFreeCapacity() > MaxStorage * 10 && (factory.store[RESOURCE_KEANIUM_BAR] >= 5000)) {
            if(creep.pos.isNearTo(factory)) {
                for(let resource in factory.store) {
                    if(listOfResourcesToTerminalFromFactory.includes(resource)) {
                        creep.withdraw(factory, resource);
                    }
                }
                creep.memory.target = terminal.id;
            }
            else {
                creep.moveTo(factory);
            }
            return;
        }




    }








}


const roleEnergyManager = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleEnergyManager;
