function findLocked(room) {

    let maxRepairTower;
    if(room.controller.level < 4) {
        maxRepairTower = 5000;
    }
    else {
        maxRepairTower = 50000
    }

    let buildingsToRepair;

    if(room.controller.level >= 6) {
        buildingsToRepair = room.find(FIND_STRUCTURES, {filter: building => building.structureType != STRUCTURE_CONTAINER && building.hits < building.hitsMax && building.hits < (building.hitsMax-900) && building.hits < maxRepairTower});
    }
    else if(room.controller.level < 6) {
        buildingsToRepair = room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < (building.hitsMax-1200) && building.hits < maxRepairTower});
    }


    let allowedBuildingsToRepair = [];
    _.forEach(buildingsToRepair, function(building) {
        if(building.structureType == STRUCTURE_ROAD) {
            if(_.includes(room.memory.keepTheseRoads, building.id, 0)) {
                allowedBuildingsToRepair.push(building)
            }
        }
        else {
            allowedBuildingsToRepair.push(building)
        }
    });

    allowedBuildingsToRepair.sort((a,b) => a.hits - b.hits);
    if(allowedBuildingsToRepair.length > 0) {
        room.memory.lowestHitsBuildingToRepair = allowedBuildingsToRepair[0].id;
    }
}


function roomDefence(room) {

    let maxRepairTower;
    if(room.controller.level < 4) {
        maxRepairTower = 5000;
    }
    else {
        maxRepairTower = 150000
    }

    if(Game.time % 100 == 0) {
        room.memory.towers = [];

        let towers = room.find(FIND_MY_STRUCTURES, { filter: {structureType: STRUCTURE_TOWER}});
        if(towers.length) {
            _.forEach(towers, function(tower) {
                room.memory.towers.push(tower.id);
            });
        }
    }


    if(room.memory.towers && room.memory.towers.length > 0) {
        let towerCount = -1;
        let currentTickModTowers = Game.time % room.memory.towers.length;
        _.forEach(room.memory.towers, function(towerID) {
            let tower:any = Game.getObjectById(towerID);
            towerCount = towerCount + 1;

            let isDanger = room.memory.danger;

            if(isDanger) {
                let damagedCreeps = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits < damagedCreep.hitsMax && damagedCreep.room.name == room.name);
                if(damagedCreeps.length > 0) {
                    tower.heal(damagedCreeps[0]);
                    return;
                }
            }

            if(isDanger && tower.store[RESOURCE_ENERGY] > 200) {
                let closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
                if(closestHostile) {
                    tower.attack(closestHostile);
                    return;
                }
            }


            if(currentTickModTowers == towerCount && tower.store[RESOURCE_ENERGY] > 400) {
                if(Game.time % 11 == 0) {
                    findLocked(room);
                }
                if(room.memory.lowestHitsBuildingToRepair && room.memory.lowestHitsBuildingToRepair != null) {
                    let repairTarget:any = Game.getObjectById(room.memory.lowestHitsBuildingToRepair);
                    if(repairTarget.hits + 1200 > repairTarget.hitsMax || repairTarget.hits > maxRepairTower) {
                        room.memory.lowestHitsBuildingToRepair = null;
                        return;
                    }
                    if(tower.repair(repairTarget) != 0) {
                        room.memory.lowestHitsBuildingToRepair = null;
                    }
                }
            }

            if(Game.time % 12 == 0) {
                let damagedCreeps = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits < damagedCreep.hitsMax && damagedCreep.room.name == room.name);
                if(damagedCreeps.length > 0) {
                    tower.heal(damagedCreeps[0]);
                    return;
                }
            }

       });
    }


    if(Game.time % 10 == 1) {
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        if(HostileCreeps.length > 0) {
            room.memory.danger = true;

            if(HostileCreeps.length > 1) {
                if(!Memory.DistressSignals) {
                    Memory.DistressSignals = {};
                }
                if(!Memory.DistressSignals.reinforce_me) {
                    Memory.DistressSignals.reinforce_me = room.name;
                }
            }


            let MyRamparts = room.find(FIND_MY_STRUCTURES, {filter: structure => structure.structureType == STRUCTURE_RAMPART});

            let currentLowestRange = 100;
            let currentRampart;

            _.forEach(MyRamparts, function(rampart) {
                let closestHostileToRampart = rampart.pos.findClosestByRange(HostileCreeps);
                let rangeToEnemy = rampart.pos.getRangeTo(closestHostileToRampart)
                if(currentLowestRange > rangeToEnemy) {
                    currentLowestRange = rangeToEnemy;
                    currentRampart = rampart;
                    room.memory.rampartToMan = currentRampart.id;
                }
            });
        }
        else {
            room.memory.danger = false;
            room.memory.rampartToMan = false

            if(Memory.DistressSignals && Memory.DistressSignals.reinforce_me && room.name == Memory.DistressSignals.reinforce_me && room.memory.danger == false) {
                delete Memory.DistressSignals.reinforce_me;
            }
        }
    }
}
export default roomDefence;
// module.exports = roomDefence
