import { expect } from "chai";
import roleSpecialCarry from "../../src/Roles/SpecialCarry";

/**
 * SpecialCarry read `creep.room.memory.Structures.storage` unguarded — a
 * TypeError every tick in any room where Structures was never seeded
 * (foreign rooms, reparsed memory, rooms reached before the seed pass).
 * The role now prefers room.storage and only falls back to the
 * Structures id when it exists.
 */
describe("SpecialCarry storage lookup", () => {
    const makeCreep = (room: any) => ({
        memory: { moving: false, full: false, suicide: false },
        ticksToLive: 1000,
        store: {
            getFreeCapacity: () => 10,
            [RESOURCE_ENERGY]: 0,
        },
        evacuate: () => false,
        recycle: () => {},
        room,
        pos: { isNearTo: () => false, getRangeTo: () => 5 },
        withdraw: () => 0,
        transfer: () => 0,
        drop: () => {},
        moveToSafePositionToRepairRampart: () => {},
    });

    it("uses room.storage when Structures memory was never seeded", () => {
        const storage = { id: "s1", store: {} };
        const creep = makeCreep({ storage, memory: {}, find: () => [] });
        expect(() => roleSpecialCarry.run(creep as any)).to.not.throw();
    });

    it("falls back to the Structures id when the room has no storage ref", () => {
        const seen: any[] = [];
        const orig = (Game as any).getObjectById;
        (Game as any).getObjectById = (id: any) => { seen.push(id); return null; };
        try {
            const creep = makeCreep({ storage: undefined, memory: { Structures: { storage: "sid-9" } }, find: () => [] });
            roleSpecialCarry.run(creep as any);
        } finally {
            (Game as any).getObjectById = orig;
        }
        expect(seen).to.include("sid-9");
    });

    it("survives a room with neither storage nor Structures memory", () => {
        const creep = makeCreep({ storage: undefined, memory: {}, find: () => [] });
        expect(() => roleSpecialCarry.run(creep as any)).to.not.throw();
    });
});
