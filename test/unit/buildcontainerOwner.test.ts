import { expect } from "chai";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const roleBuildContainer = require("../../src/Roles/buildcontainer").default;

function makeCreep(structures: any[]) {
    const repaired: any[] = [];
    const creep: any = {
        memory: { targetRoom: "W1N1", building: true },
        room: {
            name: "W1N1",
            memory: {},
            controller: { my: false, level: 1, upgradeBlocked: true, ticksToDowngrade: 99999 },
            find: (type: number, opts: any) => {
                if (type === FIND_STRUCTURES) {
                    return opts && opts.filter ? structures.filter(opts.filter) : structures;
                }
                return [];
            },
            lookForAt: () => [],
            getTerrain: () => ({ get: () => 0 }),
        },
        pos: {
            x: 10, y: 10,
            findClosestByRange: (list: any[]) => (list.length ? list[0] : null),
            findInRange: () => [],
            isEqualTo: () => false,
            isNearTo: () => false,
            getRangeTo: () => 99,
        },
        store: { energy: 50, getFreeCapacity: () => 0 },
        holdForFlee: () => false,
        findStorage: () => null,
        build: () => ERR_NOT_IN_RANGE,
        repair: (t: any) => { repaired.push(t); return ERR_NOT_IN_RANGE; },
        withdraw: () => ERR_NOT_IN_RANGE,
        transfer: () => OK,
        upgradeController: () => ERR_NOT_IN_RANGE,
        moveToRoomAvoidEnemyRooms: () => OK,
        MoveCostMatrixRoadPrio: () => OK,
        move: () => OK,
        ticksToLive: 500,
        say: () => OK,
    };
    return { creep, repaired };
}

describe("buildcontainer repair target ownership", function () {
    it("does not repair an invader core or enemy structure", function () {
        const core: any = { id: "core1", structureType: STRUCTURE_INVADER_CORE, owner: { username: "Invader" }, my: false, hits: 10, hitsMax: 100 };
        const enemyTower: any = { id: "etow", structureType: STRUCTURE_TOWER, owner: { username: "foe" }, my: false, hits: 10, hitsMax: 100 };
        const box: any = { id: "box1", structureType: STRUCTURE_CONTAINER, hits: 10, hitsMax: 100 };
        (Game as any).getObjectById = () => null;
        const { creep, repaired } = makeCreep([core, enemyTower, box]);
        roleBuildContainer.run(creep);
        // The closest-first pick must be the unowned container, not the
        // unrepairable invader core or the enemy tower.
        expect(repaired.length).to.equal(1);
        expect(repaired[0].id).to.equal("box1");
    });
});
