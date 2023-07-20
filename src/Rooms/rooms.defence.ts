function roomDefence(room) {
    if(!room.memory.defence) {
        room.memory.defence = {
            towerShotsInRow:0
        }
    }
    // if(room.name == "E42N59") {
    //     room.controller.activateSafeMode();
    // }
    if(Game.time % 250 == 0) {
        let nukes = room.find(FIND_NUKES);
        if(nukes.length > 0) {
            room.memory.defence.nuke = true;
        }
        else {
            room.memory.defence.nuke = false;
            room.memory.defence.evacuate = false;
        }
    }
    if(room.memory.danger_timer == 0) {
        room.memory.defence.towerShotsInRow = 0;
    }

    if(room.memory.danger && room.memory.danger_timer >= 1750) {
        let enemyCreepsInRoom = room.find(FIND_HOSTILE_CREEPS);
        if(enemyCreepsInRoom.length > 3) {
            for(let eCreep of enemyCreepsInRoom) {
                if(eCreep.owner.username !== "Invader") {
                    room.controller.activateSafeMode();
                    room.memory.danger_timer = 1
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
            if(tower) {
                towerCount = towerCount + 1;

                let isDanger = room.memory.danger;

                if(isDanger) {
                    let rampartDefenders = room.find(FIND_MY_CREEPS, {filter: creep => creep.memory.role == "RampartDefender" || creep.memory.role == "RRD"});
                    let rampartDefendersLength = rampartDefenders.length;
                    if(rampartDefendersLength <= 2) {
                        let rampartToMan = room.memory.rampartToMan;
                        let rampart:any = Game.getObjectById(rampartToMan);
                        if(rampart) {
                            if(rampart && rampartDefenders[0] && ((rampartDefenders[0].pos.getRangeTo(rampart) == 2 || rampartDefenders[0].pos.getRangeTo(rampart) == 1) && (rampartDefenders[0].pos.lookFor(LOOK_STRUCTURES).length == 0) || rampartDefenders[0].pos.lookFor(LOOK_STRUCTURES).length == 1 && rampartDefenders[0].pos.lookFor(LOOK_STRUCTURES)[0].structureType== STRUCTURE_ROAD)) {
                                if(rampartDefenders[0].pos.getRangeTo(rampart) < 6) {
                                    tower.heal(rampartDefenders[0]);
                                    return;
                                }
                            }
                        }
                    }

                    let damagedCreeps = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits+300 < damagedCreep.hitsMax && damagedCreep.room.name == room.name && damagedCreep.memory.role !== "attacker");
                    if(damagedCreeps.length > 0) {
                        tower.heal(damagedCreeps[0]);
                        return;
                    }
                }

                if(isDanger && tower && tower.store[RESOURCE_ENERGY] > 200 && canWeShoot == room.memory.Structures.towers.length && Game.cpu.bucket > 250) {
                    let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
                    let rampartDefenders = room.find(FIND_MY_CREEPS, {filter: creep => creep.memory.role == "RampartDefender"});
                    let rampartDefendersLength = rampartDefenders.length;
                    let rampartID = room.memory.rampartToMan
                    let rampart:any = Game.getObjectById(rampartID);
                    let closestHostile = tower.pos.findClosestByRange(HostileCreeps);
                    if(closestHostile && HostileCreeps.length > 1 && rampartDefendersLength >= 1 && room.memory.in_position || closestHostile && HostileCreeps.length == 1 || rampartDefendersLength == 0 && closestHostile) {
                        room.memory.defence.towerShotsInRow += 1;
                        let attackTarget = room.memory.attack_target;
                        let target = Game.getObjectById(attackTarget);
                        if(rampart && rampart.pos.getRangeTo(target) < 2 && (target && Game.time % 17 == 0 || target && Game.time % 17 == 1 || target && Game.time % 17 == 2 || target && Game.time % 17 == 3 || target && Game.time % 17 == 4
                            || target && Game.time % 17 == 5 || target && Game.time % 17 == 6 || target && Game.time % 17 == 7 || target && Game.time % 17 == 8)) {
                            tower.attack(target);
                            return;
                        }
                        else if(Game.time % 150 >= 0 && Game.time % 150 < 30) {
                            if(room.memory.defence.towerShotsInRow % 800 >= 0 && room.memory.defence.towerShotsInRow % 800 < 60) {
                                if(closestHostile.ticksToLive > 50) {
                                    tower.attack(closestHostile);
                                }
                            }

                        }
                        else if(HostileCreeps.length > 1 && target && rampart && rampart.pos.getRangeTo(target) < 2 ){
                            if(room.memory.defence.towerShotsInRow % 800 >= 0 && room.memory.defence.towerShotsInRow % 800 < 60) {
                                if(closestHostile.ticksToLive > 50) {
                                    tower.attack(closestHostile);
                                }
                            }

                            return;
                        }
                        else if(HostileCreeps.length == 1){
                            if(room.memory.defence.towerShotsInRow % 800 >= 0 && room.memory.defence.towerShotsInRow % 800 < 60) {
                                if(closestHostile.ticksToLive > 50) {
                                    tower.attack(closestHostile);
                                }
                            }

                        }
                        else {
                            if(room.memory.defence.towerShotsInRow % 800 >= 0 && room.memory.defence.towerShotsInRow % 800 < 60) {
                                if(closestHostile.ticksToLive > 50) {
                                    tower.attack(closestHostile);
                                }
                            }

                        }
                    }
                }

                if(Game.time % 12 == 0) {
                    let damagedCreeps = _.filter(Game.creeps, (damagedCreep) => damagedCreep.hits < damagedCreep.hitsMax && damagedCreep.room.name == room.name && !damagedCreep.memory.suicide && damagedCreep.memory.role !== "attacker");
                    if(damagedCreeps.length > 0) {
                        tower.heal(damagedCreeps[0]);
                        return;
                    }
                    if(room.controller.level == 8) {
                        let damagedPowerCreeps = _.filter(Game.powerCreeps, (damagedPowerCreep) => damagedPowerCreep.hits < damagedPowerCreep.hitsMax && damagedPowerCreep.room.name == room.name);
                        if(damagedPowerCreeps.length > 0) {
                            tower.heal(damagedPowerCreeps[0]);
                            return;
                        }
                    }
                }
            }


       });
    }


    if(Game.time % 5 == 0 || room.memory.danger && Game.time % 1 == 0) {
        let HostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        let storage:any = Game.getObjectById(room.memory.Structures.storage);
        if(HostileCreeps.length > 0) {
            room.memory.danger = true;

            let MyRamparts = room.find(FIND_MY_STRUCTURES, {filter: structure => structure.structureType == STRUCTURE_RAMPART});
            if(storage) {
                MyRamparts = MyRamparts.filter(function(r) {return r.pos.getRangeTo(storage) <= 10});
            }
            let myCreeps = room.find(FIND_MY_CREEPS);

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
                if(rampart.pos.lookFor(LOOK_CREEPS).length > 0 && rampart.pos.lookFor(LOOK_CREEPS)[0].memory.role == "RampartDefender" || rampart.pos.lookFor(LOOK_CREEPS).length > 0 && rampart.pos.lookFor(LOOK_CREEPS)[0].memory.role == "RRD") {
                    room.memory.in_position = true;
                    found_creep = true;
                    return;
                }
                let myRampartDefenders = myCreeps.filter(function(c) {return c.memory.role == "RampartDefender" || c.memory.role === "RRD";});
                if(myRampartDefenders.length > 0) {
                    let closestRampartDefender = rampart.pos.findClosestByRange(myRampartDefenders);
                    if(rampart.pos.getRangeTo(closestRampartDefender) <= 1) {
                        return;
                    }
                }
                let closestHostileToRampart = rampart.pos.findClosestByRange(HostileCreeps);
                let rangeToEnemy = rampart.pos.getRangeTo(closestHostileToRampart)
                if(currentLowestRange > rangeToEnemy) {
                    currentLowestRange = rangeToEnemy;
                    currentRampart = rampart;
                    if(room.memory.rampartToMan) {
                        let rampartBefore:any = Game.getObjectById(room.memory.rampartToMan);
                        if(rampartBefore && rampartBefore.pos.findInRange(HostileCreeps, 1).length > 0) {
                            // do nothing
                        }
                        else {
                            room.memory.rampartToMan = currentRampart.id;
                        }
                    }
                    else {
                        room.memory.rampartToMan = currentRampart.id;
                    }
                }
            });
            if(found_creep == false) {
                room.memory.in_position = false;
            }
        }
        else {
            room.memory.danger = false;
            room.memory.rampartToMan = false

            // let myCreeps = room.find(FIND_MY_CREEPS);

            // if(Memory.DistressSignals && Memory.DistressSignals.reinforce_me && room.name == Memory.DistressSignals.reinforce_me && room.memory.danger == false ||
            //     Memory.DistressSignals && Memory.DistressSignals.reinforce_me && room.name == Memory.DistressSignals.reinforce_me && myCreeps.length <= 1) {
            //     delete Memory.DistressSignals.reinforce_me;
            // }
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
