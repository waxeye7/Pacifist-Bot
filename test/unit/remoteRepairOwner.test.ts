import { expect } from "chai";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const roleRemoteRepair = require("../../src/Roles/remoteRepair").default;

function makeCreep(structures: any[], sources: any[]) {
    const creep: any = {
        memory: { targetRoom: "W1N1", homeRoom: "E1N1", working: true },
        room: {
            name: "W1N1",
            memory: { keepTheseRoads: [] },
            find: (type: number, opts: any) => {
                if (type === FIND_STRUCTURES) {
                    return opts && opts.filter ? structures.filter(opts.filter) : structures;
                }
                if (type === FIND_SOURCES) return sources;
                if (type === FIND_MY_CONSTRUCTION_SITES) return [];
                return [];
            },
        },
        pos: { findClosestByRange: (list: any[]) => (list.length ? list[0] : null) },
        store: { energy: 100, getFreeCapacity: () => 0 },
        fleeHomeIfInDanger: () => undefined,
        say: () => OK,
        repair: () => ERR_NOT_IN_RANGE,
        build: () => ERR_NOT_IN_RANGE,
        MoveCostMatrixRoadPrio: () => OK,
        moveTo: () => OK,
        moveToRoomAvoidEnemyRooms: () => OK,
        ticksToLive: 500,
        recycle: () => OK,
    };
    return creep;
}

describe("remoteRepair allowed_repairs ownership", function () {
    it("excludes enemy-owned structures, keeps ours and unowned", function () {
        const source: any = { id: "src1" };
        const nearPos = {
            isNearTo: () => true,
            findClosestByRange: (list: any[]) => (list.length ? list[0] : null),
        };
        const container: any = { id: "box1", structureType: STRUCTURE_CONTAINER, pos: nearPos, hits: 50, hitsMax: 100 };
        const enemySpawn: any = { id: "espawn", structureType: STRUCTURE_SPAWN, owner: { username: "foe" }, my: false, pos: nearPos, hits: 50, hitsMax: 100 };
        const ourSpawn: any = { id: "ospawn", structureType: STRUCTURE_SPAWN, owner: { username: "me" }, my: true, pos: nearPos, hits: 50, hitsMax: 100 };
        const core: any = { id: "core1", structureType: STRUCTURE_INVADER_CORE, owner: { username: "Invader" }, my: false, pos: nearPos, hits: 50, hitsMax: 100 };
        const byId: any = { box1: container, espawn: enemySpawn, ospawn: ourSpawn, core1: core };
        (Game as any).getObjectById = (id: string) => byId[id] || null;
        const creep = makeCreep([container, enemySpawn, ourSpawn, core], [source]);
        roleRemoteRepair.run(creep);
        expect(creep.memory.allowed_repairs).to.include("box1");
        expect(creep.memory.allowed_repairs).to.include("ospawn");
        expect(creep.memory.allowed_repairs).to.not.include("espawn");
        expect(creep.memory.allowed_repairs).to.not.include("core1");
    });
});
