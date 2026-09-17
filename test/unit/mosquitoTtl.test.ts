import { assert } from "chai";
import mosquito_manager from "../../src/Misc/mosquito_manager";

/**
 * A MOSQUITO DISPATCH ROW ONLY EVER DIED BY SPAWNING.
 *
 * dispatch pushes { n: target, ts: 2 } and mosquito_manager decrements `ts`
 * once per successful global.spawn_mosquito call. When no RCL8 room sits
 * within range 5 of the target, findClosestRooms returns [] and `ts` never
 * moves — and War/dispatch counts live rows against MAX_MOSQUITO (2), so TWO
 * such rows ended mosquito raids for the rest of the global. flight.ts's
 * mosquitoInFlight also reported the stuck target in flight forever.
 *
 * The fix is the same rule ExecuteCommandsInNTicks already runs: keep
 * waiting, never forever. Rows carry `at` (stamped on first sight, refreshed
 * on every successful spawn) and expire after MOSQUITO_TTL without progress.
 *
 * A row that HAS spawned (ts <= 0) is not finished — mosquito_attack keys
 * all in-room combat off it, so deleting it stranded the live wave in the
 * target room for its whole TTL. The %1000 janitor in mosquito_attack owns
 * ts<=0 cleanup (drops the row once no live creep targets it); the manager
 * keeps the row.
 */

const g: any = global;

function withGame(rooms: any, memory: any, time: number, bucket: number, fn: () => void): void {
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    const prevSpawn = g.spawn_mosquito;
    g.Game = { time, creeps: {}, rooms, cpu: { limit: 20, bucket } };
    g.Memory = memory;
    g.spawn_mosquito = () => false; // never spawns: the stuck-row scenario
    try {
        fn();
    } finally {
        g.Game = prevGame;
        g.Memory = prevMemory;
        g.spawn_mosquito = prevSpawn;
    }
}

describe("mosquito dispatch rows expire instead of living forever", () => {
    it("drops a row that has made no progress for MOSQUITO_TTL ticks", () => {
        const memory: any = { e: { mosquito: [{ n: "E9N9", ts: 2, at: 10000 }] } };
        withGame({}, memory, 16000, 9000, () => {
            mosquito_manager();
            assert.strictEqual(memory.e.mosquito.length, 0);
        });
    });

    it("keeps a young row", () => {
        const memory: any = { e: { mosquito: [{ n: "E9N9", ts: 2, at: 15900 }] } };
        withGame({}, memory, 16000, 9000, () => {
            mosquito_manager();
            assert.strictEqual(memory.e.mosquito.length, 1);
            assert.strictEqual(memory.e.mosquito[0].n, "E9N9");
        });
    });

    it("keeps spawned-out rows (ts <= 0) — they still drive the live wave", () => {
        // The row is the creeps' combat driver in mosquito_attack; dropping
        // it here idled every dispatched wave until death. The %1000 janitor
        // in mosquito_attack reaps it once no live creep targets the room.
        const memory: any = { e: { mosquito: [{ n: "E9N9", ts: 0, at: 1 }, { n: "E8N8", ts: 2, at: 16000 }] } };
        withGame({}, memory, 16001, 9000, () => {
            mosquito_manager();
            assert.strictEqual(memory.e.mosquito.length, 2);
            assert.strictEqual(memory.e.mosquito[0].n, "E9N9");
        });
    });

    it("stamps a legacy row with no `at` and gives it a fresh window", () => {
        const memory: any = { e: { mosquito: [{ n: "E9N9", ts: 2 }] } };
        withGame({}, memory, 16000, 9000, () => {
            mosquito_manager();
            assert.strictEqual(memory.e.mosquito.length, 1);
            assert.strictEqual(memory.e.mosquito[0].at, 16000);
        });
    });

    it("still collects stale rows while the bucket is too low to spawn", () => {
        const memory: any = { e: { mosquito: [{ n: "E9N9", ts: 2, at: 100 }] } };
        withGame({}, memory, 100000, 500, () => {
            mosquito_manager();
            assert.strictEqual(memory.e.mosquito.length, 0);
        });
    });

    it("survives Memory.e without a mosquito key and null rows", () => {
        const memory: any = { e: { other: true } };
        withGame({}, memory, 1000, 9000, () => {
            assert.doesNotThrow(() => mosquito_manager());
            assert.isArray(memory.e.mosquito);
        });
        const memory2: any = { e: { mosquito: [null, { n: "E9N9", ts: 2, at: 1000 }] } };
        withGame({}, memory2, 1000, 9000, () => {
            mosquito_manager();
            assert.strictEqual(memory2.e.mosquito.length, 1);
        });
    });
});
