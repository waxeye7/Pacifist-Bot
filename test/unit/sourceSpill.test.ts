/**
 * Energy that spills at a source in a link room is never collected by anyone.
 *
 * The spawn ladder stops buying carriers for a source as soon as
 * linkHaulBySource says its link reaches the hub (spawnLadder
 * linkHauledFromMemory -> LadderSource.linked). The filler's salvage leash
 * collapses to HUB_LOOT_RANGE the moment the hub can supply it, deliberately,
 * so it cannot walk the base for a source pile. The sweeper would do it, but
 * the sweeper sits on the optional roster and the CPU duty cycle keeps that
 * shut whenever the bucket is mid-band — live shard3 read _optRosterOpen false
 * on a 2,993 bucket.
 *
 * So a stalled link leaves a permanent scar. Live E37N59 2026-09-10: a wedged
 * EnergyManager backed the hub link up for 364 ticks, both source links pinned
 * at 800, both miners dumped on the floor. After the wedge was fixed the links
 * ran again but 3,237 energy was left rotting on two tiles, with a further
 * 2,000 stranded in each source container that transferAdjacentSink had filled
 * and nothing drains.
 *
 * The seated miner is the only creep standing there, and its link has spare
 * throughput (10 e/t in, up to 800 per cooldown out). It reclaims.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");
const EM = SRC("Roles/energyMiner.ts");
const FILLER = SRC("Roles/filler.ts");
const LADDER = SRC("Rooms/spawnLadder.ts");

const fn = (src: string, sig: string): string => {
    const i = src.indexOf(sig);
    assert.isAbove(i, -1, "missing: " + sig);
    return src.slice(i, src.indexOf("\n}", i));
};

describe("nobody else collects a source spill", () => {
    it("the ladder stops buying haulers for a link-hauled source", () => {
        assert.include(LADDER, "linkHauledFromMemory(room, s.id)");
        assert.match(LADDER, /linked: linkEra \|\| linkHauledFromMemory/);
    });

    it("the filler's salvage leash cannot reach a source while the hub supplies it", () => {
        assert.include(FILLER, "const lootRange = hubSupplies ? HUB_LOOT_RANGE : 10;");
        const m = FILLER.match(/const HUB_LOOT_RANGE = (\d+);/);
        assert.isNotNull(m);
        // a source is tens of tiles from the hub; this is a hub radius
        assert.isBelow(Number(m![1]), 8);
    });
});

describe("the seated miner reclaims its own spill", () => {
    const body = fn(EM, "function reclaimSpill(creep: any, link: any): boolean {");

    it("does nothing when it has no room to carry the energy", () => {
        assert.include(body, "if(free <= 0) return false;");
    });

    it("only reclaims what the link can take straight back off it", () => {
        // Without this bound the miner picks the pile up and puts it straight
        // back down when the link is the bottleneck — a pickup/drop cycle that
        // burns an intent a tick and recovers nothing.
        assert.include(body, "link.store.getFreeCapacity(RESOURCE_ENERGY) < free");
        assert.include(body, "return false;");
    });

    it("takes the decaying pile before the container that does not decay", () => {
        const pile = body.indexOf("FIND_DROPPED_RESOURCES");
        const box = body.indexOf("STRUCTURE_CONTAINER");
        assert.isAbove(pile, -1);
        assert.isAbove(box, pile, "pile first: it is the one losing value every tick");
    });

    it("reaches the tile it dumped on before it was seated, not the whole room", () => {
        assert.match(body, /findInRange\(FIND_DROPPED_RESOURCES, 1,/);
        assert.include(body, "st.pos.isNearTo(creep.pos)");
    });

    it("takes the biggest pile, and only energy", () => {
        assert.include(body, "r.resourceType === RESOURCE_ENERGY");
        assert.include(body, "piles.sort((a: any, b: any) => b.amount - a.amount)");
    });

    it("walks the per-tick cache, not a room-wide find", () => {
        // this runs on every seated miner on every tick
        assert.include(body, "cachedStructures(creep.room)");
        assert.notInclude(body, "room.find(");
    });

    it("is preferred over pushing this tick's harvest, which the next tick pushes anyway", () => {
        const at = EM.indexOf("if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {");
        assert.isAbove(at, -1);
        const block = EM.slice(at, at + 900);
        assert.include(block, "if(!reclaimSpill(creep, closestLink)) {");
        const guard = block.indexOf("reclaimSpill");
        const push = block.indexOf("creep.transfer(closestLink, RESOURCE_ENERGY);");
        assert.isBelow(guard, push, "reclaim is tried first");
    });

    it("only ever spends the intent the transfer would have spent", () => {
        // pickup/withdraw/transfer are one intent class: the reclaim replaces
        // the transfer for that tick, it does not add a second action.
        const at = EM.indexOf("if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {");
        const block = EM.slice(at, at + 900);
        assert.strictEqual((block.match(/creep\.transfer\(closestLink/g) || []).length, 1);
    });
});
