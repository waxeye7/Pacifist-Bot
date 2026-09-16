import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import roleEnergyManager from "../../src/Roles/energyManager";

/**
 * `room.memory.spawn_list` is seeded only for owned rooms (spawning() runs
 * inside the `controller && controller.my` branch). A displaced creep that
 * pushes/unshifts into the spawn list of whatever room it STANDS in throws
 * `TypeError` on an enemy, lost, or freshly-claimed room — and even when it
 * does not throw, the foreign room's queue is never consumed by us.
 *
 * energyManager.run() self-replaces at ticksToLive == body*3: it found
 * `roomNeedsManager` true on ENEMY RCL8 rooms (the >= 8 arm has no `.my`)
 * and then unshifted into `spawn_list` — undefined there. Six sites.
 */

const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");

function managerCreep(room: any): any {
    const creep: any = {
        name: "EnergyManager-1-W5N5",
        memory: { role: "EnergyManager", moving: false, suicide: true },
        body: [{ type: CARRY }, { type: CARRY }, { type: CARRY }],
        ticksToLive: 9, // == body.length * 3 -> the respawn tick
        store: {},
        room,
        evacuate: () => false,
        recycle: () => { (creep as any).recycled = true; return 0; },
    };
    return creep;
}

function roomFind(self: any) {
    return (type: any, opts: any) =>
        type === FIND_MY_CREEPS ? [self].filter(opts.filter) : [];
}

describe("spawn_list writes on rooms that are not ours", () => {
    it("a dying manager in an enemy RCL8 room neither throws nor queues", () => {
        // enemy room: controller exists (level 8) but is not mine, so
        // spawning() never seeded spawn_list. roomNeedsManager returns true
        // on the >=8 arm — the old code unshifted into undefined.
        const enemyRoom: any = {
            name: "W5N5",
            controller: { level: 8, my: false, owner: { username: "e" } },
            memory: {},
            terminal: { store: { [RESOURCE_BATTERY]: 2000 } },
        };
        const creep = managerCreep(enemyRoom);
        enemyRoom.find = roomFind(creep);

        assert.doesNotThrow(() => roleEnergyManager.run(creep));
        assert.isUndefined(enemyRoom.memory.spawn_list, "queued into a foreign room's list");
        assert.isTrue((creep as any).recycled, "role flow should continue past the respawn block");
    });

    it("a dying manager in its own RCL8 room still queues a replacement", () => {
        const ownRoom: any = {
            name: "W6N5",
            controller: { level: 8, my: true },
            memory: { spawn_list: [] },
            terminal: { store: { [RESOURCE_BATTERY]: 2000 } },
        };
        const creep = managerCreep(ownRoom);
        ownRoom.find = roomFind(creep);

        const oldCpu = (Game as any).cpu;
        (Game as any).cpu = { bucket: 10000 }; // the >= 5000 arm; other tests mutate this
        try {
            roleEnergyManager.run(creep);
        } finally {
            (Game as any).cpu = oldCpu;
        }
        // spawn_list is a flat stream — each entry is three consecutive
        // elements: body array, name, options
        assert.strictEqual(ownRoom.memory.spawn_list.length, 3);
        assert.strictEqual(ownRoom.memory.spawn_list[2].memory.role, "EnergyManager");
    });

    it("every spawn_list write in the respawn block sits behind the owned gate", () => {
        const src = SRC("Roles/energyManager.ts");
        const runStart = src.indexOf(" const run = function");
        const block = src.slice(runStart, runStart + 3500);
        assert.include(block, "creep.room.controller && creep.room.controller.my &&");
        assert.include(block, "if(!creep.room.memory.spawn_list) creep.room.memory.spawn_list = [];");
        const writes = block.match(/creep\.room\.memory\.spawn_list\.(unshift|push)/g) || [];
        assert.strictEqual(writes.length, 6, "expected the six respawn unshifts");
    });

    it("Escort gates its claimer push on an existing spawn_list", () => {
        const e = SRC("Roles/Escort.ts");
        const i = e.indexOf("ticksToLive === 1499");
        const block = e.slice(i, i + 1400);
        assert.include(block, "if(room.memory.spawn_list) {");
        // the charges and the log must sit inside the guard too — a skipped
        // push with live charges leaves a phantom boost owner to be filled
        const pushIdx = block.indexOf("spawn_list.push");
        const chargeIdx = block.indexOf("chargeBoostSlot");
        const guardEnd = block.indexOf("\n    }", pushIdx);
        assert.isBelow(pushIdx, guardEnd);
        assert.isBelow(chargeIdx, guardEnd, "chargeBoostSlot must be inside the spawn_list guard");
    });
});
