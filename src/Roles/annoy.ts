/**
 * A little description of this function
 * @param {Creep} creep
 **/
 const run = function (creep:Creep) {
    creep.Speak();

    let enemyCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    let Structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
        filter: object => object.structureType != STRUCTURE_CONTROLLER && object.structureType != STRUCTURE_KEEPER_LAIR && object.structureType != STRUCTURE_STORAGE && object.structureType != STRUCTURE_TERMINAL});
    let ConstructionSites = creep.room.find(FIND_HOSTILE_CONSTRUCTION_SITES, {filter: site => site.structureType != STRUCTURE_ROAD});
    if(enemyCreeps.length > 0) {
        let closestEnemyCreep = creep.pos.findClosestByRange(enemyCreeps);
            if(creep.pos.isNearTo(closestEnemyCreep)) {
                creep.attack(closestEnemyCreep);
            }
            else {
                if(closestEnemyCreep.pos.x != 0 && closestEnemyCreep.pos.x != 49 && closestEnemyCreep.pos.y != 0 && closestEnemyCreep.pos.y != 49) {
                    creep.moveTo(closestEnemyCreep, {swampCost:2, reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
                }
            }

            if(creep.attack(closestEnemyCreep) == 0) {
                if(closestEnemyCreep.pos.x != 0 && closestEnemyCreep.pos.x != 49 && closestEnemyCreep.pos.y != 0 && closestEnemyCreep.pos.y != 49) {
                    creep.moveTo(closestEnemyCreep, {swampCost:2, reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
                }
                return;
            }
            return;
        }

    else if(Structures.length > 0) {
        let closestStructure = creep.pos.findClosestByRange(Structures)
        if(creep.pos.isNearTo(closestStructure)) {
            creep.attack(closestStructure)
        }
        else {
            creep.moveTo(closestStructure, {swampCost:2, reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
        }
    }

    else if(ConstructionSites.length > 0) {
        ConstructionSites.sort((a,b) => b.progress - a.progress);
        if(creep.pos.x != ConstructionSites[0].pos.x || creep.pos.y != ConstructionSites[0].pos.y) {
            creep.moveTo(ConstructionSites[0], {swampCost:2, reusePath:20, visualizePathStyle: {stroke: '#ffffff'}});
        }
        // .pos.x, ConstructionSites[0].pos.y
    }



    else {
        let buildings = creep.room.find(FIND_STRUCTURES, {filter: building => building.structureType == STRUCTURE_WALL});
        if(buildings.length > 0) {
            let closestWall = creep.pos.findClosestByRange(buildings);
            if(creep.pos.isNearTo(closestWall)) {
                creep.attack(closestWall);
            }
            else {
                creep.moveTo(closestWall);
            }
        }
        else {
            creep.moveTo(24,25);
        }
    }

    if(creep.room.name != creep.memory.targetRoom) {
        return creep.moveToRoom(creep.memory.targetRoom);
    }
}


const roleAnnoy = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleAnnoy;
