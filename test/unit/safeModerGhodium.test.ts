/**
 * SafeModer GATED generateSafeMode ON A FULL STORE, NOT ON HAVING THE
 * GHODIUM.
 *
 * generateSafeMode consumes 1000 ghodium — the real prerequisite is
 * store.getUsedCapacity(RESOURCE_GHODIUM) >= 1000. The role instead asked
 * getFreeCapacity() === 0, which is only the same thing when capacity is
 * exactly 1000 AND the store holds nothing else. Two stalls fell out:
 *
 *  - A creep holding >=1000 ghodium with spare capacity (console-spawned
 *    with a wider body) fell through every branch and stood still forever —
 *    never moved to the controller, never recycled.
 *  - A creep full of the wrong cargo could never top up: withdraw answered
 *    ERR_FULL every tick and it parked at the storage for its whole life.
 *
 * The generate branches now gate on ghodium >= 1000, and a full store that
 * is short of ghodium recycles.
 */
import { assert } from "chai";
import roleSafeModer from "../../src/Roles/SafeModer";

const g: any = global;
const G = (g as any).RESOURCE_GHODIUM;

interface Cfg {
    ghodium: number;
    free: number;
    roomName: string;
    targetRoom?: string;
    storageGhodium?: number;
    nearStorage?: boolean;
    nearController?: boolean;
    safeModeAvailable?: number;
}

function run(cfg: Cfg): any {
    const calls: any = { withdraw: 0, generate: 0, recycle: 0, moveToStorage: 0, moveToController: 0, travel: 0 };
    const controller = { safeModeAvailable: cfg.safeModeAvailable === undefined ? 0 : cfg.safeModeAvailable };
    const storage = cfg.storageGhodium === undefined ? undefined : { store: { [G]: cfg.storageGhodium } };
    const creep: any = {
        memory: { targetRoom: cfg.targetRoom },
        room: { name: cfg.roomName, controller, storage },
        store: {
            getUsedCapacity: (r: string) => (r === G ? cfg.ghodium : 0),
            getFreeCapacity: () => cfg.free,
        },
        pos: {
            isNearTo: (t: any) => (t === storage ? !!cfg.nearStorage : t === controller ? !!cfg.nearController : false),
        },
        withdraw: () => { calls.withdraw++; return 0; },
        generateSafeMode: () => { calls.generate++; return 0; },
        recycle: () => { calls.recycle++; return 0; },
        MoveCostMatrixRoadPrio: (t: any) => { if (t === storage) calls.moveToStorage++; else calls.moveToController++; return 0; },
        moveToRoomAvoidEnemyRooms: () => { calls.travel++; return 0; },
    };
    roleSafeModer.run(creep);
    return calls;
}

describe("SafeModer ghodium gating", () => {
    it("generates safe mode at the controller with 1000 ghodium and spare capacity", () => {
        const calls = run({ ghodium: 1000, free: 500, roomName: "E1N1", targetRoom: "E1N1", nearController: true });
        assert.strictEqual(calls.generate, 1, "carrying enough ghodium must reach generateSafeMode");
    });

    it("walks to the controller with 1000 ghodium and spare capacity", () => {
        const calls = run({ ghodium: 1000, free: 500, roomName: "E2N2", targetRoom: "E1N1" });
        assert.strictEqual(calls.travel, 1, "carrying enough ghodium must travel to the target");
        assert.strictEqual(calls.generate, 0);
    });

    it("recycles a full store that is short of ghodium instead of parking at storage", () => {
        const calls = run({ ghodium: 200, free: 0, roomName: "E2N2", targetRoom: "E1N1", storageGhodium: 2000, nearStorage: true });
        assert.strictEqual(calls.recycle, 1, "full of the wrong cargo must recycle, not withdraw ERR_FULL forever");
        assert.strictEqual(calls.withdraw, 0);
    });

    it("still withdraws when short of ghodium with space and stocked storage", () => {
        const calls = run({ ghodium: 200, free: 800, roomName: "E2N2", targetRoom: "E1N1", storageGhodium: 2000, nearStorage: true });
        assert.strictEqual(calls.withdraw, 1);
        assert.strictEqual(calls.recycle, 0);
    });

    it("no-targetRoom: generates with >=1000 ghodium regardless of spare capacity", () => {
        const calls = run({ ghodium: 1200, free: 300, roomName: "E1N1", nearController: true });
        assert.strictEqual(calls.generate, 1);
    });

    it("no-targetRoom: recycles when full but short of ghodium", () => {
        const calls = run({ ghodium: 500, free: 0, roomName: "E1N1", storageGhodium: 5000 });
        assert.strictEqual(calls.recycle, 1);
        assert.strictEqual(calls.withdraw, 0);
    });
});
