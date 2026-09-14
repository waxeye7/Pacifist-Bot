import { expect } from "chai";
import roleSpecialRepair from "../../src/Roles/SpecialRepair";

/**
 * SpecialRepair collected `memory.targets` ids through getObjectById and
 * pushed the results unfiltered, then sorted by .hits. A rampart destroyed
 * since the list was built resolves null — sort dereferences null.hits and
 * the role crashes every tick, mid-siege, exactly when it matters.
 */
describe("SpecialRepair targets sort", () => {
    it("skips destroyed ramparts instead of sorting null.hits", () => {
        const orig = (Game as any).getObjectById;
        const repairs: any[] = [];
        // "lock1" is the held rampart lock; "dead" is a destroyed list entry;
        // "live" is the repairable one the sort should reach.
        const wall = (id: string, hits: number) => ({
            id, hits, hitsMax: 1000,
            pos: { roomName: "R", x: 10, y: 10, lookFor: () => [] },
        });
        (Game as any).getObjectById = (id: any) =>
            id === "lock1" ? wall("lock1", 50)
            : id === "live" ? wall("live", 100)
            : null;
        const creep = {
            memory: {
                moving: false,
                rampart_to_repair: "lock1",
                targets: ["dead", "live"],
            },
            room: {
                name: "R",
                storage: undefined,
                memory: { Structures: {} },
                find: () => [],
                controller: { my: true, level: 8 },
            },
            pos: {
                getRangeTo: () => 0,
                isNearTo: () => true,
                findInRange: () => [],
                lookFor: () => [],
                roomName: "R",
                x: 10, y: 10,
            },
            store: { [RESOURCE_ENERGY]: 500 },
            repair: (t: any) => { repairs.push(t); return 0; },
            evacuate: () => false,
        };
        try {
            roleSpecialRepair.run(creep as any);
        } finally {
            (Game as any).getObjectById = orig;
        }
        expect(repairs.length).to.be.greaterThan(0, "no repair intent issued");
        expect(repairs[0].id).to.equal("live");
    });
});
