import { assert } from "chai";
import "Functions/creepFunctions";
import "Functions/roomFunctions";
import { managerErrand } from "../../src/Roles/energyManager";
import ExecuteCommandsInNTicks from "../../src/Managers/ExecuteCommandsInNTicks";
import RunPowerCreepManager from "../../src/Managers/RunPowerCreepManager";

/**
 * BEHAVIORAL COVER FOR THE DRIFTED-CREEP SWEEP.
 *
 * A creep can end a tick on an exit tile and run its role next tick standing
 * in a foreign room (swap shove, border handoff — see creepFunctions
 * SwapPositionWithCreep). Foreign room memory has no `Structures` key — it is
 * seeded inside the owned-room pass in rooms.ts — so `Structures.X` threw
 * undefined.X every tick.
 *
 * The rooms below deliberately have `memory: {}` and no controller.
 */

const g: any = global;

function foreignRoom(): any {
    return {
        name: "W9N9",
        memory: {},
        controller: undefined,
        energyAvailable: 0,
        energyCapacityAvailable: 0,
        storage: undefined,
        terminal: undefined,
        find: () => [],
        findBin: () => undefined,
        findNuker: () => undefined,
        findMineral: () => undefined,
    };
}

function driftedCreep(role: string): any {
    return {
        name: role + "-drifted",
        memory: { role, storage: "pinned-storage" },
        room: foreignRoom(),
        pos: { findClosestByRange: () => null, isNearTo: () => false, getRangeTo: () => 5 },
        store: { getFreeCapacity: () => 100, getUsedCapacity: () => 0 },
        body: [],
        ticksToLive: 1400,
        findStorage: () => undefined,
        findClosestLinkToStorage: () => undefined,
        findBin: () => undefined,
        MoveCostMatrixRoadPrio: () => {},
        withdraw: () => -1,
        transfer: () => -1,
        idlePark: () => {},
        recycle: () => {},
    };
}

function withGame(patch: (gg: any) => void, fn: () => void): void {
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    const game: any = Object.assign({}, prevGame, {
        time: 100000,
        creeps: {},
        powerCreeps: {},
        cpu: { limit: 20, bucket: 10000, tickLimit: 500, getUsed: () => 0 },
    });
    g.Game = game;
    g.Memory = { creeps: {} };
    patch(g);
    try {
        fn();
    } finally {
        g.Game = prevGame;
        g.Memory = prevMemory;
    }
}

describe("drifted creep: Structures reads on foreign rooms", () => {
    it("findFillerTarget returns false for a filler in a foreign room", () => {
        withGame(gg => {
            gg.Game.getObjectById = () => null;
        }, () => {
            const creep = driftedCreep("filler");
            const fn = (Creep.prototype as any).findFillerTarget;
            assert.isFunction(fn, "findFillerTarget not attached to Creep.prototype");
            assert.strictEqual(fn.call(creep), false);
        });
    });

    it("findFillerTarget returns false for a ControllerLinkFiller in a foreign room", () => {
        withGame(gg => {
            gg.Game.getObjectById = () => null;
        }, () => {
            const creep = driftedCreep("ControllerLinkFiller");
            const fn = (Creep.prototype as any).findFillerTarget;
            assert.strictEqual(fn.call(creep), false);
        });
    });

    it("managerErrand does not throw when the pinned storage resolves cross-room", () => {
        const storage = { id: "pinned-storage", structureType: STRUCTURE_STORAGE, store: {}, pos: { x: 25, y: 25, roomName: "E1N1" } };
        withGame(gg => {
            gg.Game.getObjectById = (id: any) => (id === "pinned-storage" ? storage : null);
        }, () => {
            const creep = driftedCreep("EnergyManager");
            assert.strictEqual(managerErrand(creep, 50), false);
        });
    });

    it("findBin seeds Structures on an unseeded room before writing", () => {
        const container = { id: "bin-1", structureType: STRUCTURE_CONTAINER };
        const prevLookFor = (RoomPosition.prototype as any).lookFor;
        (RoomPosition.prototype as any).lookFor = function () {
            return this.x === 25 && this.y === 26 ? [container] : [];
        };
        try {
            const room: any = { name: "W9N9", memory: {} };
            const found = (Room.prototype as any).findBin.call(room, { pos: { x: 25, y: 25 } });
            assert.strictEqual(found, container);
            assert.strictEqual(room.memory.Structures.bin, "bin-1");
        } finally {
            (RoomPosition.prototype as any).lookFor = prevLookFor;
        }
    });
});

describe("drifted creep: containment", () => {
    it("a throwing power-creep role does not wedge the manager or the next PC", () => {
        withGame(gg => {
            gg.Memory.features = { disablePower: false };
            gg.Game.powerCreeps = {
                "efficient-1": { ticksToLive: 100, room: { name: "W9N9" } },
                "efficient-2": { ticksToLive: 100, room: { name: "W9N9" } },
            };
        }, () => {
            let secondRan = false;
            const prevRoles = g.ROLES;
            g.ROLES = {
                efficient: {
                    run: (c: any) => {
                        if (c === g.Game.powerCreeps["efficient-1"]) throw new TypeError("undefined.powerSpawn");
                        secondRan = true;
                    },
                },
            };
            try {
                assert.doesNotThrow(() => RunPowerCreepManager());
                assert.isTrue(secondRan, "the second power creep never ran");
            } finally {
                g.ROLES = prevRoles;
            }
        });
    });

    it("a throwing queued command is dropped, not re-fired forever", () => {
        withGame(gg => {
            gg.Game.cpu.bucket = 10000;
            gg.Memory.commandsToExecute = [
                { delay: 0, bucketNeeded: 1, formation: "Singleton", homeRoom: "nowhere", targetRoom: "E2N2" },
                { delay: 0, bucketNeeded: 1, formation: "Duo", homeRoom: "E1N1", targetRoom: "E2N2" },
            ];
        }, () => {
            let duoFired = false;
            const prevSS = g.SS;
            const prevSD = g.SD;
            g.SS = () => { throw new TypeError("Structures unseeded"); };
            g.SD = () => { duoFired = true; };
            try {
                assert.doesNotThrow(() => ExecuteCommandsInNTicks());
                assert.isTrue(duoFired, "the healthy command behind the bad one never ran");
                assert.lengthOf(g.Memory.commandsToExecute, 0, "queue did not drain");
            } finally {
                g.SS = prevSS;
                g.SD = prevSD;
            }
        });
    });
});
