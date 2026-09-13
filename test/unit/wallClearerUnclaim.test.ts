import { expect } from "chai";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const roleWallClearer = require("../../src/Roles/WallClearer").default;

function makeCreep(structures: any[], controller: any) {
    const creep: any = {
        memory: { targetRoom: "E2N2", homeRoom: "E1N1" },
        room: {
            name: "E2N2",
            controller,
            find: (type: number, opts: any) =>
                type === FIND_STRUCTURES && opts && opts.filter ? structures.filter(opts.filter) : [],
        },
        pos: { isNearTo: () => false, findClosestByRange: () => null },
        ticksToLive: 50,
        suicide: () => OK,
        recycle: () => OK,
        claimController: () => OK,
        signController: () => OK,
        MoveCostMatrixRoadPrio: () => OK,
        MoveCostMatrixRoadPrioAvoidEnemyCreepsMuch: () => OK,
    };
    return creep;
}

function makeController() {
    return {
        my: true,
        level: 1,
        pos: { getOpenPositionsIgnoreCreepsCheckStructs: () => [] },
        unclaimed: false,
        unclaim() { this.unclaimed = true; return OK; },
    };
}

describe("WallClearer destroy-then-unclaim", function () {
    beforeEach(function () {
        (Game as any).map = (Game as any).map || {};
        (Game as any).map.findRoute = () => ERR_NO_PATH;
    });

    it("unclaims when only neutral walls remain", function () {
        const wall: any = { my: false, structureType: STRUCTURE_WALL, pos: { x: 10, y: 10 }, destroy: () => ERR_NOT_OWNER };
        const controller = makeController();
        const creep = makeCreep([wall], controller);
        roleWallClearer.run(creep);
        expect(controller.unclaimed).to.equal(true);
    });

    it("destroys own structures before unclaiming", function () {
        const destroyed: string[] = [];
        const own: any = { my: true, structureType: STRUCTURE_SPAWN, pos: { x: 10, y: 10 }, destroy: () => { destroyed.push("spawn"); return OK; } };
        const wall: any = { my: false, structureType: STRUCTURE_WALL, pos: { x: 11, y: 10 }, destroy: () => { destroyed.push("wall"); return ERR_NOT_OWNER; } };
        const controller = makeController();
        const creep = makeCreep([own, wall], controller);
        roleWallClearer.run(creep);
        expect(destroyed).to.deep.equal(["spawn"]);
        expect(controller.unclaimed).to.equal(false);
    });

    it("never calls destroy on unowned structures", function () {
        let wallDestroys = 0;
        const wall: any = { my: false, structureType: STRUCTURE_WALL, pos: { x: 10, y: 10 }, destroy: () => { wallDestroys++; return ERR_NOT_OWNER; } };
        const controller = makeController();
        const creep = makeCreep([wall], controller);
        roleWallClearer.run(creep);
        expect(wallDestroys).to.equal(0);
    });
});
