/**
 * DismantleControllerWalls' catch-all filter had no ownership check.
 *
 * The role runs `room.find(FIND_STRUCTURES, {filter: NOT container/road/
 * controller})` every tick while walking to the controller — transit rooms
 * return early, but a TARGET room that we claimed after the creep was
 * dispatched is full of `my` structures, and the creep dismantled one
 * adjacent own-building per tick on the way in. Every sibling catch-all
 * (SquadCreepA, SquadFollower, ram, remoteDismantler after the same fix)
 * carries `!s.my`.
 */
import { assert } from "chai";
import role from "../../src/Roles/DismantleControllerWalls";

const g: any = global;

function run(structures: any[]): { dismantled: any; suicided: boolean } {
    const out = { dismantled: null as any, suicided: false };
    const controller: any = { id: "ctrl", pos: { x: 25, y: 25 } };
    const creep: any = {
        memory: { targetRoom: "E2N2" },
        room: {
            name: "E2N2",
            controller,
            find: (_what: number, opts: any) => structures.filter(opts.filter),
        },
        pos: {
            isNearTo: (t: any) => t === controller,
            findInRange: (list: any[]) => list,
            getRangeTo: () => 1,
        },
        suicide: () => { out.suicided = true; return 0; },
        dismantle: (t: any) => { out.dismantled = t; return 0; },
        say: () => 0,
    };
    role.run(creep);
    return out;
}

function struct(id: string, my: boolean, type: string, distToController: number): any {
    return {
        id, my, hits: 1000, structureType: type,
        pos: { getRangeTo: (t: any) => distToController },
    };
}

describe("DismantleControllerWalls target filter", () => {
    it("never dismantles our own structures", () => {
        const mine = struct("own1", true, "spawn", 1);
        const neutral = struct("n1", false, "keeper_lair", 3);
        const out = run([mine, neutral]);
        assert.strictEqual(out.dismantled && out.dismantled.id, "n1");
    });

    it("dismantles nothing when only own structures remain", () => {
        const out = run([struct("own1", true, "spawn", 1), struct("own2", true, "tower", 2)]);
        assert.isNull(out.dismantled);
    });

    it("still dismantles enemy structures", () => {
        const enemy = struct("e1", false, "spawn", 1);
        enemy.my = false;
        const out = run([enemy]);
        assert.strictEqual(out.dismantled && out.dismantled.id, "e1");
    });
});
