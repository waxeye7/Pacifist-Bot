/**
 * claimer's dying-tick follow-up. On ticksToLive == 1 a claimer standing in
 * its target room pushes a DismantleControllerWalls entry onto the HOME
 * room's spawn_list. The old code dereferenced Game.rooms[homeRoom] with no
 * guard — a lost or invisible home threw TypeError on the creep's last tick
 * and the replacement was never queued. controller.upgradeBlocked was read
 * unguarded too, which throws in any target room without a controller.
 */
import { assert } from "chai";
import roleClaimer from "../../src/Roles/claimer";

const g: any = global;

function fakeClaimer(room: any, ticksToLive: number = 1): any {
    return {
        memory: { homeRoom: "E1N1", targetRoom: room.name },
        room,
        ticksToLive,
        owner: { username: "me" },
        heal: () => 0,
        claimController: () => ERR_NOT_IN_RANGE,
        attackController: () => 0,
        moveTo: () => 0,
        suicide: () => 0,
        pos: { isNearTo: () => false },
    };
}

function withGame(rooms: any, fn: () => void): void {
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    g.Game = { time: 1, creeps: {}, rooms, cpu: { limit: 20, bucket: 7000 } };
    g.Memory = {};
    try {
        fn();
    } finally {
        g.Game = prevGame;
        g.Memory = prevMemory;
    }
}

describe("claimer dying-tick DismantleControllerWalls push", () => {
    it("does not throw when the home room is off Game.rooms", () => {
        const room = { name: "E2N2", controller: { level: 8, my: true, upgradeBlocked: 0, reservation: null } };
        withGame({}, () => {
            assert.doesNotThrow(() => roleClaimer.run(fakeClaimer(room)));
        });
    });

    it("does not throw when the home room has no spawn_list yet", () => {
        const home: any = { name: "E1N1", memory: {}, energyCapacityAvailable: 550 };
        const room = { name: "E2N2", controller: { level: 8, my: true, upgradeBlocked: 0, reservation: null } };
        withGame({ E1N1: home }, () => {
            assert.doesNotThrow(() => roleClaimer.run(fakeClaimer(room)));
            assert.isArray(home.memory.spawn_list);
            assert.strictEqual(home.memory.spawn_list.length, 3);
        });
    });

    it("queues the replacement when the home room is visible", () => {
        const home = { name: "E1N1", memory: { spawn_list: [] }, energyCapacityAvailable: 550 };
        const room = { name: "E2N2", controller: { level: 8, my: true, upgradeBlocked: 0, reservation: null } };
        withGame({ E1N1: home }, () => {
            roleClaimer.run(fakeClaimer(room));
            assert.strictEqual(home.memory.spawn_list.length, 3);
            assert.strictEqual(home.memory.spawn_list[1], "DismantleControllerWalls-E1N1-E2N2");
            assert.strictEqual(home.memory.spawn_list[2].memory.role, "DismantleControllerWalls");
            assert.strictEqual(home.memory.spawn_list[2].memory.homeRoom, "E1N1");
            assert.strictEqual(home.memory.spawn_list[2].memory.targetRoom, "E2N2");
        });
    });

    it("does not throw when the target room has no controller", () => {
        const room = { name: "E2N2", controller: undefined };
        withGame({}, () => {
            assert.doesNotThrow(() => roleClaimer.run(fakeClaimer(room)));
        });
    });

    it("does not push while the creep still has ticks to live", () => {
        const home = { name: "E1N1", memory: { spawn_list: [] }, energyCapacityAvailable: 550 };
        const room = { name: "E2N2", controller: { level: 8, my: true, upgradeBlocked: 0, reservation: null } };
        withGame({ E1N1: home }, () => {
            roleClaimer.run(fakeClaimer(room, 100));
            assert.strictEqual(home.memory.spawn_list.length, 0);
        });
    });
});
