/**
 * Power-sweep follow-up in observe(): on `Game.time % 128 == 3` it reads
 * `memory.observe.lastRoomObservedForPower` into `adj` and calls
 * areRoomsNormalToThisRoom(room.name, adj) — which feeds adj straight into
 * Game.map.findRoute. Until the first power observation fires, `adj` is
 * undefined; for a sector-centre room (both coords % 10 == 5, e.g. E15N15)
 * the ±4 sweep box contains no highway room, so listOfRoomsForPower = []
 * and `adj` stays undefined FOREVER — a whole-map findRoute BFS (or an
 * engine throw on the bad name) every 128 ticks for the life of the room.
 * The intel follow-up at the top of the same function already guards `adj`.
 */
import { assert } from "chai";
import observe from "../../src/Rooms/rooms.observe";

const g: any = global;

function withGame(opts: { time: number; rooms?: any }, fn: () => void): void {
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    g.Game = {
        time: opts.time,
        creeps: {},
        rooms: opts.rooms || {},
        cpu: { limit: 20, bucket: 9000 },
        getObjectById: () => null,
        map: {
            findRoute: (from: any, to: any) => {
                findRouteCalls.push([from, to]);
                return -2;
            },
            getRoomStatus: () => ({ status: "normal" }),
            describeExits: () => ({}),
        },
    };
    g.Memory = {};
    try {
        fn();
    } finally {
        g.Game = prevGame;
        g.Memory = prevMemory;
    }
}

let findRouteCalls: any[] = [];

function fakeRoom(observe: any): any {
    return {
        name: "E15N15",
        controller: { level: 8, my: true },
        memory: { Structures: {}, observe },
        findObserver: () => ({ observeRoom: () => 0 }),
        find: () => [],
    };
}

describe("observe power-sweep follow-up", () => {
    beforeEach(() => { findRouteCalls = []; });

    it("never calls findRoute when no power room has been observed yet", () => {
        // % 128 == 3 tick, empty power list, no lastRoomObservedForPower.
        const room = fakeRoom({ listOfRoomsForPower: [] });
        withGame({ time: 131, rooms: { E15N15: room } }, () => {
            assert.doesNotThrow(() => observe(room));
        });
        assert.deepEqual(findRouteCalls, [], "findRoute must not run with an undefined target");
    });

    it("never calls findRoute when the power list exists but is empty", () => {
        // Same shape, list built and empty — the old code called
        // findRoute(home, undefined) every 128 ticks in this state.
        const room = fakeRoom({ listOfRoomsForPower: ["W10N15"], lastRoomObservedForPower: undefined });
        withGame({ time: 259, rooms: { E15N15: room } }, () => {
            observe(room);
        });
        assert.deepEqual(findRouteCalls, [], "findRoute must not run with an undefined target");
    });

    it("still runs the follow-up when a power room was observed last tick", () => {
        // % 128 == 3 tick with a real lastRoomObservedForPower: findRoute
        // runs with a defined target (returns -2 -> guard false -> no spawn).
        const room = fakeRoom({ listOfRoomsForPower: ["W10N15"], lastRoomObservedForPower: "W10N15" });
        withGame({ time: 259, rooms: { E15N15: room } }, () => {
            observe(room);
        });
        assert.deepEqual(findRouteCalls, [["E15N15", "W10N15"]]);
    });
});
