import { expect } from "chai";
import { calc_incoming_damage } from "../../src/Misc/calc_incoming_damage";

// The BOOST_MULTIPLIERS table is keyed by the boost compound name the engine
// writes on part.boost: ranged-attack tiers are KH (T1), KH2O (T2), XKHO2
// (T3). "KO" is keanium oxide — the ranged-heal family — and "KHO2" is not a
// compound at all, so the old table silently rated T1/T2 boosted raiders as
// unboosted.
describe("calc_incoming_damage boost tiers", function () {
    const pos: any = { getRangeTo: () => 1 };
    const raider = (boost?: string): any => ({
        body: [{ type: RANGED_ATTACK, boost }],
        fatigue: 0,
        ticksToLive: 100,
    });
    it("counts a KH (T1) boosted ranged part as x2", function () {
        // range 1 → in range; one boosted RA part = 1 * 2 * 10 = 20
        expect(calc_incoming_damage(pos, [], [raider("KH")])).to.equal(20);
    });
    it("counts a KH2O (T2) boosted ranged part as x3", function () {
        expect(calc_incoming_damage(pos, [], [raider("KH2O")])).to.equal(30);
    });
    it("counts an XKHO2 (T3) boosted ranged part as x4", function () {
        expect(calc_incoming_damage(pos, [], [raider("XKHO2")])).to.equal(40);
    });
    it("counts an unboosted ranged part as x1", function () {
        expect(calc_incoming_damage(pos, [], [raider()])).to.equal(10);
    });
});
