
/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();


    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(!creep.memory.go && creep.memory.squad && creep.memory.squad.a) {
        let a:any = Game.getObjectById(creep.memory.squad.a);
        if(a) {
            creep.moveTo(new RoomPosition(a.pos.x,a.pos.y+1,a.room.name));
        }
    }


    let structures = creep.room.find(FIND_STRUCTURES, {filter: building => !building.my && building.structureType !== STRUCTURE_CONTAINER && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTROLLER && building.structureType !== STRUCTURE_KEEPER_LAIR});
    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    let enemyCreepInRangeThree = creep.pos.findInRange(enemyCreeps, 3);
    let targetCreep;
    if(enemyCreepInRangeThree.length > 0) {
        let attack_able = false;
        for(let e_creep of enemyCreepInRangeThree) {

            if(e_creep.pos.x == 0 || e_creep.pos.x == 49 || e_creep.pos.y == 0 || e_creep.pos.y == 49) {
                attack_able = true;
                targetCreep = e_creep;
            }
            else {
                let lookStructuresOnEnemyCreep = e_creep.pos.lookFor(LOOK_STRUCTURES);
                if(lookStructuresOnEnemyCreep.length > 0) {
                    for(let structure of lookStructuresOnEnemyCreep) {
                        if(structure.structureType == STRUCTURE_RAMPART) {
                            attack_able = false;
                        }
                    }
                }
                else {
                    attack_able = false;
                    targetCreep = e_creep;
                }
            }
        }

        if(targetCreep) {
            creep.rangedAttack(targetCreep)

            if(creep.pos.isNearTo(targetCreep)) {
                creep.rangedMassAttack();
            }
        }


    }
    if(structures.length > 0) {
        let closestStructure = creep.pos.findClosestByPath(structures);
        if(creep.pos.getRangeTo(closestStructure) <= 3 && !targetCreep) {
            creep.rangedAttack(closestStructure);
        }
        if(creep.pos.isNearTo(closestStructure) && closestStructure.structureType !== STRUCTURE_WALL && !targetCreep) {
            creep.rangedMassAttack();
        }
    }


    if(!creep.memory.squad) {
        creep.memory.squad = {};
    }
    let squad = [];
    if(!creep.memory.squad.a) {
        let squadcreepa = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepA");}});
        if(squadcreepa.length > 0) {
            squadcreepa.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.squad.a = squadcreepa[0].id;
        }
    }
    if(!creep.memory.squad.b) {
        let squadcreepb = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepB");}});
        if(squadcreepb.length > 0) {
            squadcreepb.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.squad.b = squadcreepb[0].id;
        }
    }
    if(!creep.memory.squad.y) {
        let squadcreepy = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepY");}});
        if(squadcreepy.length > 0) {
            squadcreepy.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.squad.y = squadcreepy[0].id;
        }
    }
    if(!creep.memory.squad.z) {
        let squadcreepz = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepZ");}});
        if(squadcreepz.length > 0) {
            squadcreepz.sort((a,b) => b.ticksToLive - a.ticksToLive);
            creep.memory.squad.z = squadcreepz[0].id;
        }
    }

    if(creep.memory.squad.a) {
        squad.push(Game.getObjectById(creep.memory.squad.a));
    }
    if(creep.memory.squad.b) {
        squad.push(Game.getObjectById(creep.memory.squad.b));
    }
    if(creep.memory.squad.y) {
        squad.push(Game.getObjectById(creep.memory.squad.y));
    }
    if(creep.memory.squad.z) {
        squad.push(Game.getObjectById(creep.memory.squad.z));
    }

    let a;
    let b;
    let y;
    let z;



    if(squad.length == 4 && creep.memory.go) {
        a = squad[0];
        b = squad[1];
        y = squad[2];
        z = squad[3];


        let aliveCreeps = [];

        if(a) {
            aliveCreeps.push(a);
        }
        if(b) {
            aliveCreeps.push(b);
        }
        if(y) {
            aliveCreeps.push(y);
        }
        if(z) {
            aliveCreeps.push(z);
        }



        if(aliveCreeps.length > 0) {
            let target;
            let lowest = creep.hitsMax;
            for(let squadmember of aliveCreeps) {
                if(squadmember.hits < lowest) {
                    lowest = squadmember.hits;
                    target = squadmember;
                }
            }
            if(target) {
                creep.heal(target);
            }
            else if(creep.hits < creep.hitsMax || enemyCreeps.length > 0 && enemyCreepInRangeThree.length > 0) {
                creep.heal(creep);
            }
        }

        if(a && a.memory.target && !targetCreep) {
            let targetStructure:any = Game.getObjectById(a.memory.target);
            if(targetStructure && (targetStructure.structureType == STRUCTURE_WALL || targetStructure.structureType == STRUCTURE_CONTAINER ||
                targetStructure.structureType == STRUCTURE_ROAD || creep.pos.getRangeTo(targetStructure) > 1)) {
                creep.rangedAttack(targetStructure)
            }
            else {
                creep.rangedMassAttack();
            }
        }



        if(a&&b&&y&&z && a.fatigue == 0 && b.fatigue == 0 && y.fatigue == 0 && z.fatigue == 0) {
            if(a.memory.direction) {
                if(a.memory.direction == 1) {
                    creep.move(TOP)
                }
                else if(a.memory.direction == 2) {
                    creep.move(TOP_RIGHT)
                }
                else if(a.memory.direction == 3) {
                    creep.move(RIGHT)
                }
                else if(a.memory.direction == 4) {
                    creep.move(BOTTOM_RIGHT)
                }
                else if(a.memory.direction == 5) {
                    creep.move(BOTTOM)
                }
                else if(a.memory.direction == 6) {
                    creep.move(BOTTOM_LEFT)
                }
                else if(a.memory.direction == 7) {
                    creep.move(LEFT)
                }
                else if(a.memory.direction == 8) {
                    creep.move(TOP_LEFT)
                }


                else if(a.memory.direction == "join") {
                    creep.moveTo(new RoomPosition(a.pos.x , a.pos.y + 1, a.room.name));
                }
            }
        }
    }

}


const roleSquadCreepY = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSquadCreepY;
