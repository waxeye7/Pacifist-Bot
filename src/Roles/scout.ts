/**
 * A little description of this function
 * @param {Creep} creep
 **/

const run = function (creep) {
    if(creep.room.name !== creep.memory.targetRoom) {
        // if(creep.memory.route = -2) creep.suicide()
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    if(!Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy) {
        Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy = {};
    }

    let sources = creep.room.find(FIND_SOURCES);

    // Function to check if a source is reachable
    const isSourceReachable = (source) => {
        const ret = PathFinder.search(
            creep.pos,
            { pos: source.pos, range: 1 },
            {
                roomCallback: (roomName) => {
                    let room = Game.rooms[roomName];
                    if (!room) return false;
                    let costs = new PathFinder.CostMatrix;

                    room.find(FIND_STRUCTURES).forEach(function(structure) {
                            costs.set(structure.pos.x, structure.pos.y, 255);
                    });

                    return costs;
                }
            }
        );

        return !ret.incomplete && ret.path.length > 0;
    };

    // Check if all sources are reachable
    let allSourcesReachable = sources.every(isSourceReachable);

    if(sources.length <= 2 && allSourcesReachable && creep.room.controller && creep.room.controller.level == 0 && !creep.room.controller.reservation) {
        for(let source of sources) {
            Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy[source.id] = {};
            Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].active = true;
        }
    }
    else {
        if(creep.room.controller?.level<3 && !creep.room.controller.my && !creep.room.controller.safeMode) {
            let newName = 'Annoyer-' + Math.floor(Math.random() * Game.time) + "-" + creep.memory.homeRoom;
            Memory.rooms[creep.memory.homeRoom].spawn_list.push([ATTACK, MOVE], newName, {memory: {role: 'annoy', homeRoom:creep.memory.homeRoom, targetRoom:creep.room.name}});
        }
        else {
            Memory.rooms[creep.memory.homeRoom].resources[creep.room.name].energy = {};
        }
    }

    creep.suicide();
}

const roleScout = {
    run,
    //run: run,
    //function2,
    //function3
};
export default roleScout;
