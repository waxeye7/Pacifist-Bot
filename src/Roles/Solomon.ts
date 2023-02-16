const run = function (creep:Creep) {

    creep.memory.moving = false;

    if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
        let result = creep.Boost();
        if(!result) {
            return;
        }
    }


    let hostilesInRoom = creep.room.find(FIND_HOSTILE_CREEPS);

    if(creep.room.name !== creep.memory.targetRoom) {
        if(hostilesInRoom.length > 0) {
            let closestHostile = creep.pos.findClosestByRange(hostilesInRoom);
            if(creep.pos.isNearTo(closestHostile)) {
                creep.heal(creep);
                creep.rangedMassAttack()
            }
            else if(creep.pos.getRangeTo(closestHostile) <= 3) {
                creep.heal(creep);
                creep.rangedAttack(closestHostile);
            }
        }
        else if(creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    creep.heal(creep);

    let hostilesInRangeThree;
    if(hostilesInRoom.length > 0) {
        hostilesInRangeThree = hostilesInRoom.filter(function(eC) {return creep.pos.getRangeTo(eC) <= 3;});
        if(hostilesInRangeThree.length > 0) {
            let closestEnemyCreep = creep.pos.findClosestByRange(hostilesInRangeThree);
            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.rangedMassAttack();
            }
            else {
                hostilesInRangeThree.sort((a,b) => a.hits - b.hits);
                creep.rangedAttack(hostilesInRangeThree[0]);
            }
        }
    }

    if(hostilesInRangeThree && hostilesInRangeThree.length == 0) {
        let structures = creep.room.find(FIND_STRUCTURES).filter(function(s) {
            return s.structureType !== STRUCTURE_CONTROLLER &&
            s.structureType !== STRUCTURE_CONTAINER &&
            s.structureType !== STRUCTURE_INVADER_CORE &&
            s.structureType !== STRUCTURE_KEEPER_LAIR &&
            s.structureType !== STRUCTURE_ROAD
        });
        let structuresInRangeThree = creep.pos.findInRange(structures, 3);
        let structuresNextToMe = creep.pos.findInRange(structuresInRangeThree, 1);
        if(structuresNextToMe.length > 0) {
            structuresNextToMe.sort((a,b) => a.hits - b.hits);
            if(structuresNextToMe[0].structureType !== STRUCTURE_WALL) {
                creep.rangedMassAttack();
            }
            else {
                creep.rangedAttack(structuresNextToMe[0]);
            }
        }
        else if(structuresInRangeThree.length > 0) {
            structuresInRangeThree.sort((a,b) => a.hits - b.hits);
            creep.rangedAttack(structuresInRangeThree[0]);
        }
    }


    let enemySpawns = creep.room.find(FIND_HOSTILE_SPAWNS);
    if(enemySpawns.length > 0) {
        let closestSpawn = creep.pos.findClosestByRange(enemySpawns);
        if(!creep.pos.isNearTo(closestSpawn)) {
            GoToClosestSpawn(creep, closestSpawn, 1);
        }
    }
    else if(hostilesInRoom.length > 0) {
        creep.MoveCostMatrixRoadPrio(creep.pos.findClosestByRange(hostilesInRoom), 1);
    }
    else {
        let myCreeps = creep.room.find(FIND_MY_CREEPS);
        myCreeps.sort((a,b) => a.hitsMax - b.hitsMax);
        for(let mC of myCreeps) {
            if(mC.hits < mC.hitsMax) {
                if(creep.pos.isNearTo(mC)) {
                    creep.heal(mC);
                }
                else if(creep.pos.getRangeTo(mC) <= 3) {
                    creep.MoveCostMatrixRoadPrio(mC, 1);
                    creep.rangedHeal(mC);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(mC);
                }
            }
        }
    }

}

const roleSolomon = {
    run,
};
export default roleSolomon;


function GoToClosestSpawn(creep, target, range) {
    if(target && creep.fatigue == 0 && creep.pos.getRangeTo(target) > range) {
        if(creep.memory.path && creep.memory.path.length > 0 && (Math.abs(creep.pos.x - creep.memory.path[0].x) > 1 || Math.abs(creep.pos.y - creep.memory.path[0].y) > 1)) {
            creep.memory.path = false;
        }
        if(!creep.memory.path || creep.memory.path.length == 0 || !creep.memory.MoveTargetId || creep.memory.MoveTargetId != target.id || target.roomName !== creep.room.name) {
            let costMatrix = GoToTheClosestSpawn;

            let path = PathFinder.search(
                creep.pos, {pos:target, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 1,
                    roomCallback: (roomName) => costMatrix(roomName)
                }
            );
            creep.memory.path = path.path;
            creep.memory.MoveTargetId = target.id;
        }


        let pos = creep.memory.path[0];
        let direction = creep.pos.getDirectionTo(pos);
        creep.move(direction);
        creep.memory.moving = true;
        creep.memory.path.shift();
    }
}



const GoToTheClosestSpawn = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 0; y <= 49; y++) {
        for(let x = 0; x <= 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 10;
            }
            else if(tile == 0){
                weight = 2;
            }
            costs.set(x, y, weight);
        }
    }

    let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
    for(let eCreep of EnemyCreeps) {
        costs.set(eCreep.pos.x, eCreep.pos.y, 10);
    }

    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });


    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 1);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else {
            if(struct.hits >= 5000000) {
                costs.set(struct.pos.x, struct.pos.y, 175);
            }
            else if(struct.hits >= 2500000) {
                costs.set(struct.pos.x, struct.pos.y, 150);
            }
            else if(struct.hits >= 1000000) {
                costs.set(struct.pos.x, struct.pos.y, 100);
            }
            else if(struct.hits >= 500000) {
                costs.set(struct.pos.x, struct.pos.y, 75);
            }
            else {
                costs.set(struct.pos.x, struct.pos.y, 50);
            }

        }
    });
    return costs;
}