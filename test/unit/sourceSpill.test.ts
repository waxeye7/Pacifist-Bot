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

    it("does nothing without room for a real load", () => {
        assert.include(body, "if(free < RECLAIM_MIN) return false;");
        const m = EM.match(/const RECLAIM_MIN = (\d+);/);
        assert.isNotNull(m);
        // one CARRY part. Below this the intent costs more than it recovers.
        assert.isAtLeast(Number(m![1]), 50);
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

    it("rides the harvest tick, where the carry is actually free", () => {
        // The unload block is gated on free < potential: the miner batches its
        // transfers and only visits the link nearly full. Called from there the
        // reclaim got the ~9 free capacity a full miner has and recovered about
        // 9 energy per 20-tick cycle — measured live, the piles kept falling at
        // 2/t, which is pure decay.
        const at = EM.indexOf('creep.store.getFreeCapacity() >= creep.memory.potential && seatState !== "moving"');
        assert.isAbove(at, -1);
        const block = EM.slice(at, at + 1800);
        assert.include(block, "reclaimSpill(creep, srcLink);");
        assert.include(block, "creep.harvestEnergy();");
    });

    it("is NOT called from the batched unload block, which would delay the transfer", () => {
        const at = EM.indexOf("if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {");
        assert.isAbove(at, -1);
        const block = EM.slice(at, at + 600);
        assert.notInclude(block, "reclaimSpill");
        assert.include(block, "creep.transfer(closestLink, RESOURCE_ENERGY);");
    });

    it("costs no intent the miner was otherwise using", () => {
        // harvest is its own intent class, so on a harvest tick the
        // transfer-class intent (pickup/withdraw/transfer) is idle anyway.
        const at = EM.indexOf('creep.store.getFreeCapacity() >= creep.memory.potential && seatState !== "moving"');
        const block = EM.slice(at, at + 1800);
        assert.notInclude(block, "creep.transfer(");
        assert.notInclude(block, "creep.drop(");
    });

    it("only reclaims into a link it is standing next to", () => {
        const at = EM.indexOf('creep.store.getFreeCapacity() >= creep.memory.potential && seatState !== "moving"');
        const block = EM.slice(at, at + 1800);
        assert.include(block, "creep.pos.isNearTo(srcLink)");
        assert.include(block, 'srcLink.structureType === STRUCTURE_LINK');
    });
});
