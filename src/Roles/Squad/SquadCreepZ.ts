
/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.memory.moving = false;


    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }

    if(!creep.memory.go && creep.memory.squad && creep.memory.squad.a) {
        let a:any = Game.getObjectById(creep.memory.squad.a);
        if(a) {
            creep.moveTo(new RoomPosition(a.pos.x + 1,a.pos.y+1,a.room.name));
        }
    }

    const creepBody = creep.body.filter(function(part) {return part.type !== "move";});
    function getMostFrequent(arr) {
        const hashmap = arr.reduce( (acc, val) => {
         acc[val.type] = (acc[val.type] || 0 ) + 1
         return acc
      },{})
     return Object.keys(hashmap).reduce((a, b) => hashmap[a] > hashmap[b] ? a : b)
     }

    let creepBodyType = getMostFrequent(creepBody);
     creep.memory.bodyType = creepBodyType;



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
                    if(lookStructuresOnEnemyCreep.length == 1 && lookStructuresOnEnemyCreep[0].structureType == STRUCTURE_ROAD ||
                        lookStructuresOnEnemyCreep.length == 1 && lookStructuresOnEnemyCreep[0].structureType == STRUCTURE_CONTAINER ||
                        lookStructuresOnEnemyCreep.length == 2 && lookStructuresOnEnemyCreep[0].structureType == STRUCTURE_ROAD && lookStructuresOnEnemyCreep[1].structureType == STRUCTURE_CONTAINER ||
                        lookStructuresOnEnemyCreep.length == 2 && lookStructuresOnEnemyCreep[0].structureType == STRUCTURE_CONTAINER && lookStructuresOnEnemyCreep[1].structureType == STRUCTURE_ROAD) {

                        attack_able = true;
                        targetCreep = e_creep;
                    }
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

        if(targetCreep && (creepBodyType == "ranged_attack" || creepBodyType == "attack")) {
            creep.rangedAttack(targetCreep)
            creep.attack(targetCreep);

            if(creep.pos.isNearTo(targetCreep)) {
                creep.rangedMassAttack();
                creep.attack(targetCreep);
            }
        }


    }
    if(structures.length > 0) {
        let closestStructure = creep.pos.findClosestByRange(structures);
        if(creep.pos.getRangeTo(closestStructure) <= 3 && !targetCreep) {
            creep.rangedAttack(closestStructure);
            creep.attack(closestStructure);
            creep.dismantle(closestStructure);
        }
        if(creep.pos.isNearTo(closestStructure) && closestStructure.structureType !== STRUCTURE_WALL && !targetCreep) {
            creep.rangedMassAttack();
            creep.attack(closestStructure);
            creep.dismantle(closestStructure);
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
            else if(creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            else {
                if(a) {
                    let lastHealCreep = Game.getObjectById(a.memory.lastHeal)
                    if(lastHealCreep && creep.pos.isNearTo(lastHealCreep)) {
                        creep.heal(lastHealCreep)
                    }
                }

            }
        }


        if(a && a.memory.target && !targetCreep) {
            let targetStructure:any = Game.getObjectById(a.memory.target);
            if(targetStructure && (targetStructure.structureType == STRUCTURE_WALL || targetStructure.structureType == STRUCTURE_CONTAINER ||
                targetStructure.structureType == STRUCTURE_ROAD || creep.pos.getRangeTo(targetStructure) > 1)) {
                creep.rangedAttack(targetStructure);
                creep.attack(targetStructure);
                creep.dismantle(targetStructure);
            }
            else {
                creep.rangedMassAttack();
                creep.attack(targetStructure);
                creep.dismantle(targetStructure);
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
                    // creep.MoveCostMatrixRoadPrio(new RoomPosition(a.pos.x + 1, a.pos.y + 1, a.room.name), 0);
                    creep.moveTo(new RoomPosition(a.pos.x + 1, a.pos.y + 1, a.room.name));
                }
            }
        }
    }

}


const roleSquadCreepZ = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleSquadCreepZ;
