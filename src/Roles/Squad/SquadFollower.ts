/**
 * Shared follower logic for SquadCreepB/Y/Z. The three roles are identical
 * apart from their slot in the 2x2 formation relative to the leader (A):
 *   B = (+1, 0), Y = (0, +1), Z = (+1, +1)
 * slotIndex spreads pre-heal intents across targets that tie on exposure.
 **/
const makeFollower = function (dx: number, dy: number, slotIndex: number) {

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
                creep.moveTo(new RoomPosition(a.pos.x + dx, a.pos.y + dy, a.room.name));
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

        let creepBodyType = creepBody.length > 0 ? getMostFrequent(creepBody) : "move";
         creep.memory.bodyType = creepBodyType;


        let structures = creep.room.find(FIND_STRUCTURES, {filter: building => !building.my && building.structureType !== STRUCTURE_CONTAINER && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTROLLER && building.structureType !== STRUCTURE_KEEPER_LAIR && building.structureType !== STRUCTURE_EXTRACTOR && building.structureType !== STRUCTURE_TERMINAL});
        let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
        let enemyCreepInRangeThree = creep.pos.findInRange(enemyCreeps, 3);
        let targetCreep;
        if(enemyCreepInRangeThree.length > 0) {
            for(let e_creep of enemyCreepInRangeThree) {

                let enemyCombatBody = e_creep.body.filter(function(part) {return part.type !== "move";});
                let enemyBodyType = enemyCombatBody.length > 0 ? getMostFrequent(enemyCombatBody) : "move";

                if (enemyBodyType !== "heal" || creepBodyType !== "ranged_attack") {
                    let underRampart = false;
                    for (let structure of e_creep.pos.lookFor(LOOK_STRUCTURES)) {
                        if (structure.structureType == STRUCTURE_RAMPART) {
                            underRampart = true;
                        }
                    }
                    if (!underRampart && (!targetCreep || creep.pos.getRangeTo(e_creep) < creep.pos.getRangeTo(targetCreep))) {
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
            if(creep.pos.getRangeTo(closestStructure) <= 3) {
                if(creepBodyType == "ranged_attack" && !targetCreep) {
                    creep.rangedAttack(closestStructure);
                }
                else if(creepBodyType == "attack" && !targetCreep) {
                    creep.attack(closestStructure);
                }
                else if(creepBodyType == "work") {
                    creep.dismantle(closestStructure);
                }
            }
            if(creep.pos.isNearTo(closestStructure) && closestStructure.structureType !== STRUCTURE_WALL) {
                if(creepBodyType == "ranged_attack" && !targetCreep) {
                    creep.rangedMassAttack();
                }
                else if(creepBodyType == "attack" && !targetCreep) {
                    creep.attack(closestStructure);
                }
                else if(creepBodyType == "work") {
                    creep.dismantle(closestStructure);
                }
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
                let lowest = Infinity;
                for(let squadmember of aliveCreeps) {
                    if(squadmember.hits < squadmember.hitsMax && squadmember.hits < lowest) {
                        lowest = squadmember.hits;
                        target = squadmember;
                    }
                }

                // pre-heal: nobody damaged yet, but we are in the hot room with a
                // threat present, so a heal lands the same tick the first damage does
                if(!target && a && a.memory.targetPosition && creep.room.name == a.memory.targetPosition.roomName) {
                    let hostileTowers = creep.room.find(FIND_HOSTILE_STRUCTURES, {
                        filter: (s:any) => s.structureType == STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] >= 10
                    });
                    if(hostileTowers.length > 0 || enemyCreepInRangeThree.length > 0) {
                        let threat = hostileTowers.length > 0
                            ? creep.pos.findClosestByRange(hostileTowers)
                            : creep.pos.findClosestByRange(enemyCreepInRangeThree);
                        if(threat) {
                            let closest = Infinity;
                            for(let squadmember of aliveCreeps) {
                                closest = Math.min(closest, squadmember.pos.getRangeTo(threat));
                            }
                            let mostExposed = aliveCreeps.filter(member => member.pos.getRangeTo(threat) == closest);
                            target = mostExposed[slotIndex % mostExposed.length];
                        }
                    }
                }

                if(target) {
                    if(creep.pos.isNearTo(target)) {
                        creep.heal(target);
                    }
                    else {
                        creep.rangedHeal(target);
                    }
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


            if(a && a.memory.target) {
                let targetStructure:any = Game.getObjectById(a.memory.target);
                if(targetStructure && (targetStructure.structureType == STRUCTURE_WALL || targetStructure.structureType == STRUCTURE_CONTAINER ||
                    targetStructure.structureType == STRUCTURE_ROAD || creep.pos.getRangeTo(targetStructure) > 1)) {
                    if(creepBodyType == "ranged_attack" && !targetCreep) {
                        creep.rangedAttack(targetStructure);
                    }
                    else if(creepBodyType == "attack" && !targetCreep) {
                        creep.attack(targetStructure);
                    }
                    else if(creepBodyType == "work") {
                        creep.dismantle(targetStructure);
                    }
                }
                else {
                    if(creepBodyType == "ranged_attack" && !targetCreep) {
                        creep.rangedMassAttack();
                    }
                    else if(creepBodyType == "attack" && !targetCreep) {
                        creep.attack(targetStructure);
                    }
                    else if(creepBodyType == "work") {
                        creep.dismantle(targetStructure);
                    }
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
                        creep.moveTo(new RoomPosition(a.pos.x + dx, a.pos.y + dy, a.room.name));
                    }
                }


            }
        }
    };

    return { run };
};

const roleSquadCreepB = makeFollower(1, 0, 1);
const roleSquadCreepY = makeFollower(0, 1, 2);
const roleSquadCreepZ = makeFollower(1, 1, 3);

export {roleSquadCreepB, roleSquadCreepY, roleSquadCreepZ};
