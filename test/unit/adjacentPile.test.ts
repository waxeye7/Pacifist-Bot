/**
 * Energy on the floor AWAY FROM THE HUB has no collector at all.
 *
 * The spawn ladder stops buying carriers once a source's link reaches the hub.
 * The filler's salvage leash collapses to HUB_LOOT_RANGE (3) whenever the hub
 * can supply it, deliberately, so it cannot lock onto a distant pile and walk
 * the base for it. The sweeper — whose actual job this is — sits on the
 * optional roster, and the CPU duty cycle keeps that shut whenever the bucket
 * is mid-band. Roles/upgrader's own trek cap then forbids the room-wide
 * shuttle for exactly the reasons its header gives.
 *
 * Live E37N58 2026-09-10: 757 energy at (31,13), decaying 1 a tick, no
 * collector in the room. The upgrader stood at (30,14) — range 1 — with an
 * EMPTY store, and walked past it to take 150 from the controller container
 * seven tiles away. The pile sits on its route, so it does that every trip.
 *
 * A range-1 pickup is the trek-free subset of the shuttle: it never moves the
 * creep, so it cannot reintroduce what the trek cap prevents.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const UP = fs
    .readFileSync(path.join(__dirname, "../../src/Roles/upgrader.ts"), "utf8")
    .replace(/\r\n/g, "\n");

const fn = (sig: string): string => {
    const i = UP.indexOf(sig);
    assert.isAbove(i, -1, "missing: " + sig);
    return UP.slice(i, UP.indexOf("\n}", i));
};

describe("the upgrader takes a pile it is already standing next to", () => {
    const body = fn("function grabAdjacentPile(creep: any): boolean {");

    it("range 1 only — it must never move the creep", () => {
        assert.include(body, "Math.abs(r.pos.x - creep.pos.x) > 1");
        assert.include(body, "Math.abs(r.pos.y - creep.pos.y) > 1");
        // no pathing, no lock, no target memory: those are the trek the cap bans
        assert.notInclude(body, "MoveCostMatrix");
        assert.notInclude(body, "moveTo");
        assert.notInclude(body, "memory");
    });

    it("energy only, and only a pile worth the intent", () => {
        assert.include(body, "r.resourceType !== RESOURCE_ENERGY || r.amount < ADJACENT_PILE_MIN");
        const m = UP.match(/const ADJACENT_PILE_MIN = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 50, "one CARRY part");
        assert.isAtMost(Number(m![1]), 300, "the live pile was 757; do not price real loot out");
    });

    it("...and only when there is room for one", () => {
        assert.include(body, "creep.store.getFreeCapacity(RESOURCE_ENERGY) < ADJACENT_PILE_MIN) return false;");
    });

    it("takes the biggest, off the per-tick cache, in one pass", () => {
        assert.include(body, "cachedDropped(creep.room)");
        assert.include(body, "if(!best || r.amount > best.amount) best = r;");
        assert.notInclude(body, "findInRange(");
        assert.notInclude(body, "room.find(");
        assert.notInclude(body, ".sort(");
    });

    it("runs on the FETCH leg only, so it cannot interrupt work in progress", () => {
        // !upgrading implies an empty store: the flip immediately below is the
        // only writer and it sets the flag whenever the store is not empty.
        assert.include(UP, "if(!creep.memory.upgrading && grabAdjacentPile(creep)) {");
        const call = UP.indexOf("if(!creep.memory.upgrading && grabAdjacentPile(creep)) {");
        const flip = UP.indexOf("if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {");
        assert.isAbove(flip, call, "before the flips, where the store is still last tick's");
    });

    it("the trek cap it must not undo is still there", () => {
        assert.include(UP, "UPGRADER_TREK_RANGE");
        assert.include(UP, "acquireEnergyWithContainersAndOrDroppedEnergy");
    });
});
