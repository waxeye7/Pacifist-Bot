
/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:any) {
    creep.Speak();

    if(!creep.memory.go) {
        creep.moveTo(new RoomPosition(38,40,"E45N59"));
        return;
    }


    let structures = creep.room.find(FIND_STRUCTURES, {filter: building => !building.my && building.structureType !== STRUCTURE_CONTAINER && building.structureType !== STRUCTURE_ROAD && building.structureType !== STRUCTURE_CONTROLLER && building.structureType !== STRUCTURE_KEEPER_LAIR});
    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    let closestEnemyCreep;
    if(enemyCreeps.length > 0) {
        closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
        if(creep.pos.getRangeTo(closestEnemyCreep) <= 3) {
            creep.rangedAttack(closestEnemyCreep)
        }
        if(creep.pos.isNearTo(closestEnemyCreep)) {
            creep.rangedMassAttack();
        }

    }
    if(structures.length > 0) {
        let closestStructure = creep.pos.findClosestByRange(structures);
        if(creep.pos.getRangeTo(closestStructure) <= 3) {
            creep.rangedAttack(closestStructure);
        }
        if(creep.pos.isNearTo(closestStructure) && closestStructure.structureType !== STRUCTURE_WALL) {
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
            creep.memory.squad.a = squadcreepa[0].id;
        }
    }
    if(!creep.memory.squad.b) {
        let squadcreepb = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepB");}});
        if(squadcreepb.length > 0) {
            creep.memory.squad.b = squadcreepb[0].id;
        }
    }
    if(!creep.memory.squad.y) {
        let squadcreepy = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepY");}});
        if(squadcreepy.length > 0) {
            creep.memory.squad.y = squadcreepy[0].id;
        }
    }
    if(!creep.memory.squad.z) {
        let squadcreepz = creep.room.find(FIND_MY_CREEPS, {filter: (myCreep) => {return (myCreep.memory.role == "SquadCreepZ");}});
        if(squadcreepz.length > 0) {
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

    if(squad.length == 4) {
        a = squad[0];
        b = squad[1];
        y = squad[2];
        z = squad[3];


        if(a && b && y && z) {
            let target;
            let lowest = creep.hitsMax;
            for(let squadmember of squad) {
                if(squadmember.hits < lowest) {
                    lowest = squadmember.hits;
                    target = squadmember;
                }
            }
            if(target) {
                creep.heal(target);
            }
            else if(creep.hits < creep.hitsMax || enemyCreeps.length > 0 && creep.pos.getRangeTo(closestEnemyCreep) <= 4) {
                creep.heal(creep);
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
