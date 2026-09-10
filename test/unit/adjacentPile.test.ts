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

const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");
const UP = SRC("Roles/upgrader.ts");
const CF = SRC("Functions/creepFunctions.ts");
const CLF = SRC("Roles/ControllerLinkFiller.ts");

const fn = (src: string, sig: string): string => {
    const i = src.indexOf(sig);
    assert.isAbove(i, -1, "missing: " + sig);
    return src.slice(i, src.indexOf("\n}", i));
};

describe("a creep takes a pile it is already standing next to", () => {
    const body = fn(CF, "Creep.prototype.grabAdjacentPile = function grabAdjacentPile():boolean {");

    it("range 1 only — it must never move the creep", () => {
        assert.include(body, "Math.abs(r.pos.x - this.pos.x) > 1");
        assert.include(body, "Math.abs(r.pos.y - this.pos.y) > 1");
        // no pathing, no lock, no target memory: those are the trek the cap bans
        assert.notInclude(body, "MoveCostMatrix");
        assert.notInclude(body, "moveTo");
        assert.notInclude(body, "memory");
    });

    it("energy only, and only a pile worth the intent", () => {
        assert.include(body, "r.resourceType !== RESOURCE_ENERGY || r.amount < ADJACENT_PILE_MIN");
        const m = CF.match(/const ADJACENT_PILE_MIN = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 50, "one CARRY part");
        assert.isAtMost(Number(m![1]), 300, "the live pile was 757; do not price real loot out");
    });

    it("...and only when there is room for one", () => {
        assert.include(body, "this.store.getFreeCapacity(RESOURCE_ENERGY) < ADJACENT_PILE_MIN) return false;");
    });

    it("takes the biggest, off the per-tick cache, in one pass", () => {
        assert.include(body, "cachedDropped(this.room)");
        assert.include(body, "if(!best || r.amount > best.amount) best = r;");
        assert.notInclude(body, "findInRange(");
        assert.notInclude(body, "room.find(");
        assert.notInclude(body, ".sort(");
    });

    it("runs on the FETCH leg only, so it cannot interrupt work in progress", () => {
        // !upgrading implies an empty store: the flip immediately below is the
        // only writer and it sets the flag whenever the store is not empty.
        assert.include(UP, "if(!creep.memory.upgrading && creep.grabAdjacentPile()) {");
        const call = UP.indexOf("if(!creep.memory.upgrading && creep.grabAdjacentPile()) {");
        const flip = UP.indexOf("if(creep.memory.upgrading && creep.store[RESOURCE_ENERGY] == 0) {");
        assert.isAbove(flip, call, "before the flips, where the store is still last tick's");
    });

    it("a PARKED upgrader takes it instead of topping up from the depot", () => {
        // A parked upgrader against a stocked depot never reaches an empty
        // store — it tops up at `store <= WORK`, so `upgrading` never flips
        // false and the fetch-leg grab above can never fire. Live E36N57: the
        // upgrader cycled 126 -> 18 -> 126 out of the controller link with 371
        // energy rotting one tile away.
        assert.include(UP, "creep.store[RESOURCE_ENERGY] <= creep.getActiveBodyparts(WORK) && !creep.grabAdjacentPile()");
        const at = UP.indexOf("!creep.grabAdjacentPile()");
        const block = UP.slice(at, at + 220);
        // ...and the depot top-up is the fallback, not the other way round
        assert.include(block, "creep.withdraw(controllerLink, RESOURCE_ENERGY);");
        assert.include(block, "creep.pos.isNearTo(controllerLink)");
    });

    it("the ControllerLinkFiller takes it on its collect leg too", () => {
        // It crosses the whole base twice a trip, storage to controller link
        // and back, which is exactly the route the live E37N58 pile sits on.
        const at = CLF.indexOf("if(!creep.memory.full) {");
        assert.isAbove(at, -1);
        const block = CLF.slice(at, at + 700);
        assert.include(block, "if(creep.grabAdjacentPile()) {");
        assert.include(block, "return;");
    });

    it("the trek cap it must not undo is still there", () => {
        assert.include(UP, "UPGRADER_TREK_RANGE");
        assert.include(UP, "acquireEnergyWithContainersAndOrDroppedEnergy");
    });
});
