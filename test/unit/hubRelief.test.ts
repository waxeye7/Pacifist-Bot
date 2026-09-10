/**
 * The hub link had no relief valve, and exactly one creep in the room can
 * empty it.
 *
 * Nothing but an EnergyManager ever withdraws from the hub link, and no
 * structure action can move energy from a link into a storage. So while that
 * one creep is missing, dead, busy or wedged, the hub fills and stays full —
 * and every source link in the room routes to it, so every source link pins at
 * 800 and every miner starts dumping on the floor at 10 energy a tick.
 *
 * Live E37N59 2026-09-10: one EnergyManager wedged on a stale path head for
 * 364 ticks. Hub link 787/800, both source links 800/800, 1,797 energy rotting
 * on the two source tiles, storage down to 1,253 and the upgrader idle at an
 * empty controller link. Seven symptoms, one creep, no relief valve.
 *
 * Link-to-link IS a structure action, so the controller link is a sink the
 * room can reach with no creep at all.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const EM = fs
    .readFileSync(path.join(__dirname, "../../src/Roles/energyMiner.ts"), "utf8")
    .replace(/\r\n/g, "\n");

const fn = (sig: string): string => {
    const i = EM.indexOf(sig);
    assert.isAbove(i, -1, "missing: " + sig);
    return EM.slice(i, EM.indexOf("\n}", i));
};

describe("hubLinkStuck — the measured bar", () => {
    const body = fn("function hubLinkStuck(room:any, hub:any):boolean {");

    it("counts CONSECUTIVE ticks, and a single drained tick resets it", () => {
        assert.include(body, "M._hubStuck = (M._hubStuck || 0) + 1;");
        assert.include(body, "if(M._hubStuck) delete M._hubStuck;");
        // the reset must be the low-energy arm, not the high one
        const low = body.indexOf("< HUB_BACKED_UP");
        const reset = body.indexOf("delete M._hubStuck");
        const bump = body.indexOf("M._hubStuck = (M._hubStuck || 0) + 1;");
        assert.isBelow(low, reset);
        assert.isBelow(reset, bump);
    });

    it("the bar is above anything a healthy room was ever measured at", () => {
        // 175 live room-ticks across all seven owned rooms: the hub link never
        // read 600 (max 526), and a landing 800 falls in 200-300 steps as the
        // EnergyManager carries it to storage one load at a time.
        const m = EM.match(/const HUB_BACKED_UP = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 600, "under the measured healthy max");
        assert.isBelow(Number(m![1]), 800, "800 is only reachable for one tick");
    });

    it("...and long enough that a slow drainer cannot trip it", () => {
        // An EnergyManager alternates withdraw and transfer, so 800 can sit at
        // or above 600 for up to four ticks while being drained correctly.
        const m = EM.match(/const HUB_STUCK_TICKS = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 8, "a 200-carry alternating drain takes ~4");
        // ...and still an order of magnitude faster than the 364-tick outage
        assert.isBelow(Number(m![1]), 60);
    });

    it("says so on the console — this is the symptom nothing else reports", () => {
        assert.include(body, "console.log(");
        assert.include(body, "hub link stuck at");
        // once when it trips, then rarely: not every tick for 364 ticks
        assert.include(body, "M._hubStuck === HUB_STUCK_TICKS || M._hubStuck % 100 === 0");
    });
});

describe("the relief valve", () => {
    const body = fn("export function forwardToControllerLink(room:any):void {");

    it("counts every tick — the counter runs before any early return", () => {
        const count = body.indexOf("hubLinkStuck(room, hub)");
        const bail = body.indexOf("if(!ctrlLink) return;");
        assert.isAbove(count, -1);
        assert.isAbove(bail, count, "a counter that skips ticks measures nothing");
    });

    it("drains the hub into the controller link, not the other way", () => {
        assert.include(body, "hub.transferEnergy(ctrlLink, send)");
    });

    it("only while something drains the controller link", () => {
        // Otherwise this just moves the jam one link along.
        const at = body.indexOf("if(stuck && hub &&");
        assert.isAbove(at, -1);
        assert.include(body.slice(at, at + 120), "roomFeedsController(room)");
        assert.include(body.slice(at, at + 120), "hub.cooldown === 0");
    });

    it("cannot ping-pong with the no-upgrader drain-back", () => {
        // The two directions are mutually exclusive on the same predicate:
        // relief needs roomFeedsController true, drain-back needs it false.
        const relief = body.indexOf("if(stuck && hub &&");
        const back = body.indexOf("if(!roomFeedsController(room)) {");
        assert.isAbove(relief, -1);
        assert.isAbove(back, relief);
    });

    it("is NOT gated on the bank reserve, and says why", () => {
        // bankBelowReserve means "bank before you upgrade", which presumes
        // banking is possible. A stuck hub link is exactly the state where it
        // is not: the EnergyManager is the only link->storage route and it is
        // the thing that has stopped.
        const at = body.indexOf("if(stuck && hub &&");
        const end = body.indexOf("---- the return path", at);
        assert.isAbove(end, at);
        assert.notInclude(body.slice(at, end), "bankBelowReserve");
        assert.include(EM, "DELIBERATELY NOT GATED ON bankBelowReserve");
    });

    it("does not burn the hub cooldown on a dribble", () => {
        assert.include(body, "if(free >= 100) {");
        assert.include(body, "Math.min(hub.store[RESOURCE_ENERGY], free)");
    });

    it("the hub search behind the key stays throttled", () => {
        // findStorageLink() is a room-wide find plus two sorts, and hoisting
        // it out of the no-upgrader branch put it on every owned room's every
        // tick.
        assert.include(body, "let hub:any = Game.getObjectById(S.StorageLink);");
        assert.match(body, /Game\.time - \(room\.memory\._hubFindT \|\| 0\) > \d+/);
    });

    it("a hub that IS the controller link is not a hub", () => {
        // live VPS W1N2 collided the two keys; link-to-itself is
        // ERR_INVALID_TARGET, and the relief valve would be a no-op forever.
        assert.include(body, "(ctrlLink && hub.id === ctrlLink.id)) hub = null;");
    });
});
