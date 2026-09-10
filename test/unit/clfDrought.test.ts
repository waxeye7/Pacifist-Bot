/**
 * Five ControllerLinkFillers, two of them doing nothing at all.
 *
 * Live shard3 2026-09-11. Controller links across the empire, with the hub link
 * and the source links in each room:
 *
 *   E37N59  ctrlLink 800   E37N58  ctrlLink 800   E35N58  ctrlLink 800
 *   E35N59  ctrlLink 512   E36N57  ctrlLink 506   E38N56  ctrlLink 500
 *
 * Every one of those is fed by SOURCE links, for free, by
 * energyMiner.forwardToControllerLink: it tops the controller link up whenever
 * it sits at or below 400, and a source link 29 tiles away delivers 800 every
 * 29 ticks — 27 energy/tick against the 12 a 12-WORK upgrader burns.
 *
 * Of the five fillers alive at that moment, read out of Memory.creeps:
 *   E37N59  bankParked  (the role's own 10k floor: no withdraw, no haul)
 *   E37N58  bankParked
 *   E35N58  full, no sink, _noSink 6 and counting to its 150-tick suicide
 *   E36N57  working
 *   E35N59  working
 *
 * The spawn rung's only shortfall test was `getFreeCapacity() > 200`, an
 * instantaneous read taken on the 35-tick roster cadence — one evaluation tick
 * landing in the normal dip between two source-link pushes bought a 1,200
 * energy body for 1,500 ticks. Same shape as the fillerless EnergyManager latch
 * in Roles/energyManager: a momentary condition buying a whole creep.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SP = fs
    .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("a controller LINK must stay short before it is worth a body", () => {
    it("the rung is gated on the latch, not on one read", () => {
        assert.include(SP, "const worthABody = !ctrlTarget || ctrlTarget.structureType != STRUCTURE_LINK");
        assert.include(SP, "|| persistedShort || nearlyEmpty;");
        assert.include(SP, "if(feedable && worthABody && ControllerLinkFillers < clfCap");
    });

    it("a CONTAINER depot is deliberately untouched", () => {
        // nothing but a creep fills a container, so one read of it IS a
        // shortage there and the old behaviour is correct.
        assert.include(SP, "!ctrlTarget || ctrlTarget.structureType != STRUCTURE_LINK");
    });

    it("the drought clock only runs while nobody is on the job", () => {
        // With a filler alive the depot is attended and the measurement means
        // nothing; leaving it running would let a stamp go stale under a live
        // filler and fire the moment that filler died.
        assert.include(SP, "if(ControllerLinkFillers > 0) room.memory._clFullT = Game.time;");
        assert.include(SP, "if(!shortNow) room.memory._clFullT = Game.time;");
        assert.include(SP, "else if(room.memory._clFullT === undefined) room.memory._clFullT = Game.time;");
        assert.include(SP, "const persistedShort = Game.time - room.memory._clFullT >= CLF_SHORT_GRACE;");
    });

    it("a nearly EMPTY link skips the wait — but only if the room feeds its controller", () => {
        // At RCL7+ the upgrader has no fallback: an empty controller link is a
        // creep standing next to it doing nothing. But with no upgrader alive
        // forwardToControllerLink deliberately DRAINS this link back to the hub,
        // so "empty" there is the design working and must not buy a body.
        assert.include(SP, "ctrlTarget.store[RESOURCE_ENERGY] < CLF_URGENT_ENERGY");
        assert.include(SP, "&& roomFeedsController(room);");
        assert.include(SP, 'import { roomFeedsController } from "Roles/energyMiner";');
    });

    it("the grace covers several evaluation ticks and a fraction of a life", () => {
        const g = SP.match(/const CLF_SHORT_GRACE = (\d+);/);
        assert.isNotNull(g);
        // the rung evaluates every 35 ticks from RCL6 up
        assert.isAtLeast(Number(g![1]), 105, "at least three evaluation ticks");
        assert.isAtMost(Number(g![1]), 400, "an upgrader must not starve waiting");
        const u = SP.match(/const CLF_URGENT_ENERGY = (\d+);/);
        assert.isNotNull(u);
        assert.isAtMost(Number(u![1]), 400, "must be under the 400 refill bar, or it never latches");
    });
});
