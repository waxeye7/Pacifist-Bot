import {bindSquadSlot, resolveMyCreep} from "./SquadHelperFunctions";
import {degradeQuadToDuo} from "./SquadDuo";

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
            let gatherA:any = resolveMyCreep(creep.memory.squad.a);
            if(gatherA) {
                creep.moveTo(new RoomPosition(gatherA.pos.x + dx, gatherA.pos.y + dy, gatherA.room.name));
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
        let a = bindSquadSlot(creep, "a", "SquadCreepA");
        let b = bindSquadSlot(creep, "b", "SquadCreepB");
        let y = bindSquadSlot(creep, "y", "SquadCreepY");
        let z = bindSquadSlot(creep, "z", "SquadCreepZ");



        if(creep.memory.go) {
            const liveNow = [a, b, y, z].filter(function(c) { return !!c; });
            if(liveNow.length == 2) {
                degradeQuadToDuo(liveNow[0], liveNow[1]);
                return;
            }
            if(!a && liveNow.length >= 3) {
                // A died: promote a survivor so the 3-creep formation still has a leader
                const promo = liveNow[0];
                promo.memory.role = "SquadCreepA";
                if(!promo.memory.targetPosition) {
                    promo.memory.targetPosition = new RoomPosition(25, 25, promo.memory.homeRoom || promo.room.name);
                }
                return;
            }


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


            if(liveNow.length >= 2 && liveNow.every(function(c) { return c.fatigue == 0; }) && a && a.memory.direction) {
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
    };

    return { run };
};

const roleSquadCreepB = makeFollower(1, 0, 1);
const roleSquadCreepY = makeFollower(0, 1, 2);
const roleSquadCreepZ = makeFollower(1, 1, 3);

export {roleSquadCreepB, roleSquadCreepY, roleSquadCreepZ};
