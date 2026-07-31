/**
 * A little description of this function
 * @param {Creep} creep
 **/

const run = function (creep) {
    if(creep.room.name !== creep.memory.targetRoom) {
        // if(creep.memory.route = -2) creep.suicide()
        return creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
    }

    const homeMem = Memory.rooms[creep.memory.homeRoom];
    if(!homeMem || !homeMem.resources) {
        creep.suicide();
        return;
    }
    if(!homeMem.resources[creep.room.name]) {
        homeMem.resources[creep.room.name] = {};
    }
    if(!homeMem.resources[creep.room.name].energy) {
        homeMem.resources[creep.room.name].energy = {};
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

                    // Walkable structures must NOT be walls here. This used to
                    // block EVERY structure, so the moment we built our own
                    // remote road + source container the next scout declared
                    // the source unreachable and retired the remote.
                    room.find(FIND_STRUCTURES).forEach(function(structure:any) {
                        if (structure.structureType === STRUCTURE_ROAD) return;
                        if (structure.structureType === STRUCTURE_CONTAINER) return;
                        if (structure.structureType === STRUCTURE_RAMPART && (structure.my || structure.isPublic)) return;
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

    // A verdict is ALWAYS written here: `energy` with >=1 source id means the
    // room is minable, an EMPTY `energy` means rejected. manageRemotes reads
    // exactly that, so a scout must never return without deciding — otherwise
    // the target stays "queued for a scout" forever.
    // Our OWN reservation must not disqualify a room — a remote we are already
    // reserving is the best possible remote, and rejecting it here retired
    // working remotes a few hundred ticks after they came online.
    const reservation = creep.room.controller && creep.room.controller.reservation;
    const reservedByOther = !!reservation && reservation.username !== creep.owner.username;

    if(sources.length >= 1 && sources.length <= 2 && allSourcesReachable && creep.room.controller && creep.room.controller.level == 0 && !reservedByOther) {
        for(let source of sources) {
            homeMem.resources[creep.room.name].energy[source.id] = {};
        }
        homeMem.resources[creep.room.name].active = true;
        console.log("[remotes] scout scored", creep.room.name, "for", creep.memory.homeRoom, sources.length, "sources");
    }
    else {
        // Only harass a room that is actually OWNED. A merely reserved room is
        // someone else's remote, not a target — the old code spawned an
        // Annoyer at every reserved neighbour (level 0 < 3).
        if(creep.room.controller && creep.room.controller.owner && !creep.room.controller.my && creep.room.controller.level < 3 && !creep.room.controller.safeMode) {
            let newName = 'Annoyer-' + Math.floor(Math.random() * Game.time) + "-" + creep.memory.homeRoom;
            homeMem.spawn_list.push([ATTACK, MOVE], newName, {memory: {role: 'annoy', homeRoom:creep.memory.homeRoom, targetRoom:creep.room.name}});
        }
        homeMem.resources[creep.room.name].energy = {};
        homeMem.resources[creep.room.name].active = false;
        console.log("[remotes] scout rejected", creep.room.name, "for", creep.memory.homeRoom);
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
