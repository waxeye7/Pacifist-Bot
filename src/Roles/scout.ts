/**
 * A little description of this function
 * @param {Creep} creep
 **/
import { rescoutDelay } from "../Rooms/rooms.remotes";

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

        // `path.length > 0` was also required here, which is a false negative
        // for the one creep most likely to be asking: a scout that happens to
        // stand within range 1 of the source already gets a zero-step path,
        // and PathFinder reports that as a complete search with an empty path.
        // The room was then written off as "sources unreachable" — permanently,
        // before `retryAt` existed. Completeness is the whole question.
        return !ret.incomplete;
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
            // MERGE, never replace. pathLength (the ONLY input to remote
            // scoring and carrier sizing), lastSpawn, lastSpawnCarrier and
            // _pathGuess all live on this entry — a rescout that overwrote it
            // with {} reset an already-producing remote to "unknown distance"
            // and un-scored it until Build_Remote_Roads next got vision.
            const entry = homeMem.resources[creep.room.name].energy[source.id] || {};
            // Source coordinates outlive vision. Build_Remote_Roads cannot use
            // Game.getObjectById(sourceId) without a creep standing in the room,
            // so it paths at these instead.
            entry.x = source.pos.x;
            entry.y = source.pos.y;
            homeMem.resources[creep.room.name].energy[source.id] = entry;
        }
        homeMem.resources[creep.room.name].active = true;
        delete homeMem.resources[creep.room.name].retryAt;
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
        // Emptying `energy` here is the REJECTION SIGNAL, not a clobber:
        // manageRemotes reads `sourceIds.length === 0` as "scouted and
        // rejected". Losing pathLength/x/y with it is correct — we are not
        // mining this room, and a later accept re-derives both.
        homeMem.resources[creep.room.name].energy = {};
        homeMem.resources[creep.room.name].active = false;

        // WHY we said no decides whether we will ever ask again.
        //
        // A missing controller or a source count outside 1..2 is a fact about
        // the map and will not change for the life of the shard — that verdict
        // stands forever, and it is what keeps the world-border rooms on the
        // VPS (W2N0, W1N0, W0N2 ... 40 of 121 rooms are ungenerated) from
        // being re-probed on a timer. Everything else here — a player living
        // there, someone else's reservation, a structure standing between us
        // and a source — is a snapshot of today, so it gets an expiry and
        // manageRemotes takes another look later. Without this, W2N1's only
        // possible future remote (W2N2, currently a rival's commune) was
        // written off for the life of the server.
        // retryAt 0 is an explicit "never again" — NOT a missing field, which
        // manageRemotes reads as "written before this field existed, take one
        // more look".
        // A remote that has DELIVERED to this home before gets the short leash
        // (rescoutDelay) — the map facts above are permanent, everything else is
        // a snapshot, and a room that paid us is worth re-probing soon.
        const permanent = !creep.room.controller || sources.length === 0 || sources.length > 2;
        const delay = rescoutDelay(creep.memory.homeRoom, creep.room.name);
        homeMem.resources[creep.room.name].retryAt = permanent ? 0 : Game.time + delay;
        console.log("[remotes] scout rejected", creep.room.name, "for", creep.memory.homeRoom,
            permanent ? "(permanent)" : "(retry in " + delay + ")");
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
