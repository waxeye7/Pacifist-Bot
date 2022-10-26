/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep) {

    if(Game.time % 250 == 0 && creep.room.energyAvailable <= 1000 && creep.room.energyAvailable > 300 && creep.room.find(FIND_MY_CREEPS).length > 6) {
        for(let resourceType in creep.carry) {
            creep.drop(resourceType);
        }
        creep.memory.role = "filler";
    }

    if(creep.roadCheck()) {
        creep.moveAwayIfNeedTo();
    }

    let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();

    if(closestLink && closestLink.store[RESOURCE_ENERGY] > 0 && creep.store.getFreeCapacity() != 0 && creep.store[RESOURCE_ENERGY] == 0) {
        if(creep.pos.isNearTo(closestLink)) {
            creep.withdraw(closestLink, RESOURCE_ENERGY);
            return;
        }
        else {
            creep.moveTo(closestLink);
            return;
        }
    }

    if(creep.store[RESOURCE_ENERGY] > 0) {
        let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

        if(creep.pos.isNearTo(storage)) {
            for(let resourceType in creep.carry) {
                creep.transfer(storage, resourceType);
            }
            return;
        }
        else {
            creep.moveTo(storage, {ignoreRoads:true});
            return;
        }
    }

    let storage = Game.getObjectById(creep.memory.storage) || creep.findStorage();

    let bin = Game.getObjectById(creep.room.memory.bin) || creep.room.findBin(storage);

    if(bin && bin.store.getFreeCapacity() < 2000 && creep.store.getFreeCapacity() != 0 && creep.store[RESOURCE_ENERGY] == 0) {
        if(creep.pos.isNearTo(bin)) {
            for(let resourceType in bin.store) {
                creep.withdraw(bin, resourceType);
            }
            return;
        }
        else {
            creep.moveTo(bin);
            return;
        }
    }

    let terminal = creep.room.terminal;

    if(terminal && terminal.store[RESOURCE_ENERGY] > 27000 && creep.store.getFreeCapacity() >= 200) {
        if(creep.pos.isNearTo(terminal)) {
            creep.withdraw(terminal, RESOURCE_ENERGY);
            if(!creep.pos.isNearTo(storage)) {
                creep.moveTo(storage);
            }
        }
        else {
            creep.moveTo(terminal);
        }
        return;
    }


    if(creep.room.memory.labs && creep.room.memory.labs.length == 3) {
        let labIDS = creep.room.memory.labs;

        let ThreeLabs = []

        labIDS.forEach(lab => {
            ThreeLabs.push(Game.getObjectById(lab));
        });

        let resultLab = ThreeLabs[0];
        let firstLab = ThreeLabs[1];
        let secondLab = ThreeLabs[2];


        if(resultLab && resultLab.store[RESOURCE_UTRIUM_HYDRIDE] < 1600 && terminal && terminal.store[RESOURCE_UTRIUM_HYDRIDE] >= 800) {

            if(creep.store[RESOURCE_UTRIUM_HYDRIDE] > 0) {
                if(creep.pos.isNearTo(resultLab)) {
                    creep.transfer(resultLab, RESOURCE_UTRIUM_HYDRIDE);
                }
                else {
                    creep.moveTo(resultLab);
                }
                return;
            }
            else {
                if(creep.pos.isNearTo(terminal)) {
                    creep.withdraw(terminal, RESOURCE_UTRIUM_HYDRIDE);
                }
                else {
                    creep.moveTo(terminal);
                }
            }

        }

        else if(firstLab && firstLab.store[RESOURCE_UTRIUM] <= 1400) {
            //  && terminal.store[RESOURCE_UTRIUM] >= 200
            if(creep.store[RESOURCE_UTRIUM] > 0) {
                if(creep.pos.isNearTo(firstLab)) {
                    creep.transfer(firstLab, RESOURCE_UTRIUM);
                }
                else {
                    creep.moveTo(firstLab);
                }
                return;
            }
            else {
                if(creep.pos.isNearTo(terminal)) {
                    creep.withdraw(terminal, RESOURCE_UTRIUM);
                }
                else {
                    creep.moveTo(terminal);
                }
            }
        }
        else if(secondLab && secondLab.store[RESOURCE_HYDROGEN] <= 1400) {
            // && terminal.store[RESOURCE_HYDROGEN] >= 200
            if(creep.store[RESOURCE_HYDROGEN] > 0) {
                if(creep.pos.isNearTo(secondLab)) {
                    creep.transfer(secondLab, RESOURCE_HYDROGEN);
                }
                else {
                    creep.moveTo(secondLab);
                }
                return;
            }
            else {
                if(creep.pos.isNearTo(terminal)) {
                    creep.withdraw(terminal, RESOURCE_HYDROGEN);
                }
                else {
                    creep.moveTo(terminal);
                }
            }
        }



        else if(resultLab && resultLab.store[RESOURCE_UTRIUM_HYDRIDE] >= 2600) {

            if(creep.store[RESOURCE_UTRIUM_HYDRIDE] > 0) {
                if(creep.pos.isNearTo(storage)) {
                    creep.transfer(storage, RESOURCE_UTRIUM_HYDRIDE);
                }
                else {
                    creep.moveTo(storage);
                }
                return;
            }
            else {
                if(creep.pos.isNearTo(resultLab)) {
                    creep.withdraw(resultLab, RESOURCE_UTRIUM_HYDRIDE);
                }
                else {
                    creep.moveTo(resultLab);
                }
            }

        }

        else if(resultLab && resultLab.store[RESOURCE_UTRIUM_HYDRIDE] < 1600 && storage && storage.store[RESOURCE_UTRIUM_HYDRIDE] >= 400) {

            if(creep.store[RESOURCE_UTRIUM_HYDRIDE] > 0) {
                if(creep.pos.isNearTo(resultLab)) {
                    creep.transfer(resultLab, RESOURCE_UTRIUM_HYDRIDE);
                }
                else {
                    creep.moveTo(resultLab);
                }
                return;
            }
            else {
                if(creep.pos.isNearTo(storage)) {
                    creep.withdraw(storage, RESOURCE_UTRIUM_HYDRIDE);
                }
                else {
                    creep.moveTo(storage);
                }
            }

        }



        else {
            if(creep.pos.isNearTo(terminal)) {
                for(let resourceType in creep.carry) {
                    creep.transfer(terminal, resourceType);
                }
                return;
            }
            else {
                creep.moveTo(terminal);
                return;
            }
        }
    }



    let Mineral:any = Game.getObjectById(creep.room.memory.mineral)
    let MineralType = Mineral.mineralType;
    if(storage && storage.store[MineralType] > 10000 && terminal && terminal.store.getFreeCapacity() > 200 && creep.store[RESOURCE_ENERGY] == 0 && creep.store[MineralType] == 0) {
        if(creep.pos.isNearTo(storage)) {
            creep.withdraw(storage, MineralType);
            if(!creep.pos.isNearTo(terminal)) {
                creep.moveTo(terminal);
            }
        }
        else {
            creep.moveTo(storage, {ignoreRoads:true});
        }
        return;
    }
    else if(terminal && terminal.store.getFreeCapacity() > 200 && creep.store.getFreeCapacity() == 0) {
        if(creep.pos.isNearTo(terminal)) {
            creep.transfer(terminal, MineralType);
            if(!creep.pos.isNearTo(storage)) {
                creep.moveTo(storage, {ignoreRoads:true});
            }
        }
        else {
            creep.moveTo(terminal);
        }
        return;
    }


    if(creep.roadCheck()) {
        creep.moveAwayIfNeedTo();
    }
}


const roleEnergyManager = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleEnergyManager;
