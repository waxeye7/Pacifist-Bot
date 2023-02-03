function findLocked(room) {
    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
    let bin = Game.getObjectById(room.memory.Structures.bin) || room.findBin(storage);
    if(bin && bin.hits < 125000) {
        room.memory.lowestHitsBuildingToRepair = bin.id;
        return;
    }



    let maxRepairTower;
    if(room.controller.level < 5) {
        maxRepairTower = 11000;
    }
    else {
        maxRepairTower = 50000;
    }

    let buildingsToRepair;

    if(room.controller.level >= 6) {
        buildingsToRepair = room.find(FIND_STRUCTURES, {filter: building => (building.pos.getRangeTo(storage) <= 15 || building.structureType == STRUCTURE_ROAD) && building.structureType != STRUCTURE_CONTAINER && building.hits < building.hitsMax && building.hits < (building.hitsMax-900) && building.hits < maxRepairTower});
    }
    else if(room.controller.level < 6) {
        buildingsToRepair = room.find(FIND_STRUCTURES, {filter: building => building.hits < building.hitsMax && building.hits < (building.hitsMax-1200) && building.hits < maxRepairTower});
    }

    let allowedBuildingsToRepair = [];

    _.forEach(buildingsToRepair, function(building) {
        if(building.structureType == STRUCTURE_CONTAINER && room.controller.level < 6) {
            allowedBuildingsToRepair.push(building);
        }
        else if(bin && bin.id == building.id) {
            allowedBuildingsToRepair.push(bin);
        }

        if(building.structureType == STRUCTURE_ROAD) {
            if(_.includes(room.memory.keepTheseRoads, building.id, 0)) {
                allowedBuildingsToRepair.push(building);
            }
        }
        else if(building.structureType == STRUCTURE_RAMPART) {
            allowedBuildingsToRepair.push(building);
        }
    });

    allowedBuildingsToRepair.sort((a,b) => a.hits - b.hits);
    if(allowedBuildingsToRepair.length > 0) {
        room.memory.lowestHitsBuildingToRepair = allowedBuildingsToRepair[0].id;
        return;
    }

}


function roomDefence(room) {

    if(room.memory.danger && room.memory.danger_timer >= 250) {
        let enemyCreepsInRoom = room.find(FIND_HOSTILE_CREEPS);
        if(enemyCreepsInRoom.length > 0) {
            for(let eCreep of enemyCreepsInRoom) {
                if(eCreep.owner.username !== "Invader") {
                    room.controller.activateSafeMode();
                }
            }
        }
    }


    let maxRepairTower;
    if(room.controller.level < 4) {
        maxRepairTower = 5000;
    }
    else {
        maxRepairTower = 150000
    }

    if(Game.time % 100 == 0) {
        room.memory.Structures.towers = [];

        let towers = room.find(FIND_MY_STRUCTURES, { filter: {structureType: STRUCTURE_TOWER}});
        if(towers.length) {
            _.forEach(towers, function(tower) {
                room.memory.Structures.towers.push(tower.id);
            });
        }
    }


    if(room.memory.Structures.towers && room.memory.Structures.towers.length > 0) {
        let towerCount = -1;
        // let currentTickModTowers = Game.time % room.memory.Structures.towers.length;

        let canWeShoot = 0;
        room.memory.Structures.towers.forEach(towerID => {
            let towerTest:any = Game.getObjectById(towerID);
            if(towerTest && towerTest.store[RESOURCE_ENERGY] > 400) {
                canWeShoot ++;
            }
        });

        _.forEach(room.memory.Structures.towers, function(towerID) {
            let tower:any = Game.getObjectById(towerID);

            towerCount = towerCount + 1;

            let isDanger = room.memory.danger;

            if(isDanger) {
                let rampartDefenders = room.find(FIND_MY_CREEPS, {filter: creep => creep.memory.role == "RampartDefender"});
                let rampartDefendersLength = rampartDefenders.length;
                if(rampartDefendersLength == 1) {
                    let rampartToMan = room.memory.rampartToMan;
                    let rampart:any = Game.getObjectById(rampartToMan);
                    if(rampart) {
                        if((rampartDefenders[0].pos.getRangeTo(rampart) == 2 || rampartDefenders[0].pos.getRangeTo(rampart) == 3 || rampartDefenders[0].pos.getRangeTo(rampart) == 4) && (rampartDefenders[0].pos.lookFor(LOOK_STRUCTURES).length == 0) || rampartDefenders[0].pos.lookFor(LOOK_STRUCTURES).length == 1 && rampartDefenders[0].pos.lookFor(LOOK_STRUCTURES)[0].structureType== STRUCTURE_ROAD) {
                            if(rampartDefenders[0].pos.getRangeTo(rampart) < 6) {
                                tower.heal(rampartDefenders[0]);
                                return;
                            }
                        }
                    }
                }

                let damagedCreeps = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits+300 < damagedCreep.hitsMax && damagedCreep.room.name == room.name);
                if(damagedCreeps.length > 0) {
                    tower.heal(damagedCreeps[0]);
                    return;
                }
            }

            if(isDanger && tower && tower.store[RESOURCE_ENERGY] > 200 && canWeShoot == room.memory.Structures.towers.length) {
                let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
                // HostileCreeps.sort((a,b) => a.pos.getRangeTo(tower) - b.pos.getRangeTo(tower));
                let rampartDefenders = room.find(FIND_MY_CREEPS, {filter: creep => creep.memory.role == "RampartDefender"});
                let rampartDefendersLength = rampartDefenders.length;
                let rampartID = room.memory.rampartToMan
                let rampart:any = Game.getObjectById(rampartID);
                let closestHostile = tower.pos.findClosestByRange(HostileCreeps);
                if(closestHostile && HostileCreeps.length > 1 && rampartDefendersLength >= 1 && room.memory.in_position || closestHostile && HostileCreeps.length == 1 || rampartDefendersLength == 0 && closestHostile) {
                    // if(tower.id == "6334aeac2b2c07bdd3fe6cfe" && Game.time % 2) {
                    //     tower.attack(HostileCreeps[0]);
                    // }
                    // make the tower shoot the healer every second tick to make it lose a heal
                    // if(rampartDefendersLength > 0) {
                    //     tower.attack(rampartDefenders[-1].pos.findClosestByRange(HostileCreeps));
                    //     return;
                    // }
                    // else {
                    let attackTarget = room.memory.attack_target;
                    let target = Game.getObjectById(attackTarget);
                    if(rampart && rampart.pos.getRangeTo(target) < 2 && (target && Game.time % 17 == 0 || target && Game.time % 17 == 1 || target && Game.time % 17 == 2 || target && Game.time % 17 == 3 || target && Game.time % 17 == 4
                        || target && Game.time % 17 == 5 || target && Game.time % 17 == 6 || target && Game.time % 17 == 7 || target && Game.time % 17 == 8)) {
                        tower.attack(target);
                        return;
                    }
                    else if(Game.time % 150 >= 0 && Game.time % 150 < 30) {
                        tower.attack(closestHostile);
                    }
                    else if(HostileCreeps.length > 1 && target && rampart && rampart.pos.getRangeTo(target) < 2 ){
                        tower.attack(closestHostile);
                        return;
                    }
                    else if(HostileCreeps.length == 1){
                        tower.attack(closestHostile);
                    }
                    else {
                        tower.attack(closestHostile);
                    }
                    // }
                }
            }


            // if(currentTickModTowers == towerCount && tower && tower.store[RESOURCE_ENERGY] > 250 && !room.memory.danger && room.controller.level < 6) {
            //     if(Game.time % 11 == 0) {
            //         findLocked(room);
            //     }
            //     if(room.memory.lowestHitsBuildingToRepair && room.memory.lowestHitsBuildingToRepair != null) {
            //         let repairTarget:any = Game.getObjectById(room.memory.lowestHitsBuildingToRepair);
            //         if(repairTarget && repairTarget.hits + 1200 > repairTarget.hitsMax || repairTarget && repairTarget.hits > maxRepairTower) {
            //             room.memory.lowestHitsBuildingToRepair = null;
            //             return;
            //         }
            //         if(repairTarget && tower.repair(repairTarget) !== 0) {
            //             room.memory.lowestHitsBuildingToRepair = null;
            //         }
            //     }
            // }


            if(Game.time % 12 == 0) {
                let damagedCreeps = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits < damagedCreep.hitsMax && damagedCreep.room.name == room.name && !damagedCreep.memory.suicide);
                if(damagedCreeps.length > 0) {
                    tower.heal(damagedCreeps[0]);
                    return;
                }
            }

       });
    }


    if(Game.time % 5 == 0 || room.memory.danger && Game.time % 1 == 0) {
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);

        if(HostileCreeps.length > 0 && room.memory.blown_fuse) {
            let MyRamparts = room.find(FIND_MY_STRUCTURES, {filter: structure => structure.structureType == STRUCTURE_RAMPART});
            let myCreeps = room.find(FIND_MY_CREEPS);
            let found = false;
            for(let enemyCreep of HostileCreeps) {
                for(let part of enemyCreep.body) {
                    if(part.type == ATTACK || part.type == RANGED_ATTACK || part.type == WORK) {
                        MyRamparts.forEach(rampart => {

                            // if(rampart.hits < 500000 && myCreeps.length > 4) {
                            //     room.controller.activateSafeMode();
                            //     console.log("Activating Safe Mode")
                            // }
                            let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
                            // if(enemyCreep.pos.getRangeTo(rampart) <= 5 && enemyCreep.pos.getRangeTo(storage) <= 16) {
                                room.memory.danger = true;
                                found = true;
                            // }
                        });
                    }
                }
            }
            if(found == false) {
                room.memory.danger = false;
            }

            if(HostileCreeps.length > 1 && room.memory.danger && myCreeps.length > 1) {
                if(!Memory.DistressSignals) {
                    Memory.DistressSignals = {};
                }
                if(!Memory.DistressSignals.reinforce_me) {
                    Memory.DistressSignals.reinforce_me = room.name;
                }
            }



            let currentLowestRange = 100;
            let currentRampart;

            let found_creep = false;
            _.forEach(MyRamparts, function(rampart) {
                if(rampart.pos.lookFor(LOOK_CREEPS).length > 0 && rampart.pos.lookFor(LOOK_CREEPS)[0].memory.role == "RampartDefender" || rampart.pos.lookFor(LOOK_CREEPS).length > 0 && rampart.pos.lookFor(LOOK_CREEPS)[0].memory.role == "defender") {
                    room.memory.in_position = true;
                    found_creep = true;
                    return;
                }
                let closestHostileToRampart = rampart.pos.findClosestByRange(HostileCreeps);
                let rangeToEnemy = rampart.pos.getRangeTo(closestHostileToRampart)
                if(currentLowestRange > rangeToEnemy) {
                    currentLowestRange = rangeToEnemy;
                    currentRampart = rampart;
                    room.memory.rampartToMan = currentRampart.id;
                }
            });
            if(found_creep == false) {
                room.memory.in_position = false;
            }
        }
        else {
            room.memory.danger = false;
            room.memory.rampartToMan = false

            let myCreeps = room.find(FIND_MY_CREEPS);

            if(Memory.DistressSignals && Memory.DistressSignals.reinforce_me && room.name == Memory.DistressSignals.reinforce_me && room.memory.danger == false ||
                Memory.DistressSignals && Memory.DistressSignals.reinforce_me && room.name == Memory.DistressSignals.reinforce_me && myCreeps.length <= 1) {
                delete Memory.DistressSignals.reinforce_me;
            }
        }
        if(HostileCreeps.length > 0) {
            room.memory.blown_fuse = true;
        }
        else {
            room.memory.blown_fuse = false;
        }

    }
}
export default roomDefence;
// module.exports = roomDefence
