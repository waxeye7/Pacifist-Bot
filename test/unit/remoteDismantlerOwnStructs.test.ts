import { expect } from "chai";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const roleRemoteDismantler = require("../../src/Roles/remoteDismantler").default;

function makeCreep(structures: any[]) {
    const creep: any = {
        memory: { targetRoom: "E2N2", homeRoom: "E1N1", persistent: false },
        room: {
            name: "E2N2",
            find: (type: number, opts: any) => {
                if (type === FIND_HOSTILE_STRUCTURES) return [];
                if (type === FIND_STRUCTURES) {
                    return opts && opts.filter ? structures.filter(opts.filter) : structures;
                }
                return [];
            },
        },
        pos: { findClosestByRange: (list: any[]) => (list.length ? list[0] : null), findInRange: () => [] },
        ticksToLive: 500,
        say: () => OK,
        dismantle: () => OK,
        moveTo: () => OK,
    };
    return creep;
}

describe("remoteDismantler catch-all target filter", function () {
    it("does not lock our own structures", function () {
        const ourSpawn: any = { id: "spawn1", my: true, structureType: STRUCTURE_SPAWN };
        const wall: any = { id: "wall1", structureType: STRUCTURE_WALL };
        const byId: any = { spawn1: ourSpawn, wall1: wall };
        (Game as any).getObjectById = (id: string) => byId[id] || null;
        const creep = makeCreep([ourSpawn, wall]);
        roleRemoteDismantler.run(creep);
        expect(creep.memory.locked).to.equal("wall1");
    });

    it("leaves locked false when only our structures remain", function () {
        const ourSpawn: any = { id: "spawn1", my: true, structureType: STRUCTURE_SPAWN };
        const byId: any = { spawn1: ourSpawn };
        (Game as any).getObjectById = (id: string) => byId[id] || null;
        const creep = makeCreep([ourSpawn]);
        roleRemoteDismantler.run(creep);
        expect(creep.memory.locked).to.equal(undefined);
    });

    it("still locks neutral unowned structures", function () {
        const wall: any = { id: "wall1", structureType: STRUCTURE_WALL };
        const byId: any = { wall1: wall };
        (Game as any).getObjectById = (id: string) => byId[id] || null;
        const creep = makeCreep([wall]);
        roleRemoteDismantler.run(creep);
        expect(creep.memory.locked).to.equal("wall1");
    });
});
