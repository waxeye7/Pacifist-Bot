import { assert } from "chai";
import fs from "fs";

/**
 * SELLING OUT LOCKED THE ROOM OUT OF RE-LISTING.
 *
 * The standing sell-order block sat behind
 *   room.terminal.store[mineral] >= STANDING_SELL_MIN (5000)
 * which is a CREATE rule - do not open a 5,000-unit listing out of a terminal
 * that cannot cover it. It was also gating the two MAINTAIN rungs, and those
 * have the opposite sign: an order that has just done its job has drained the
 * terminal it sold from, by construction.
 *
 * Live shard3 2026-09-11, hours after the free-markdown fix started clearing
 * oxygen: E39N58 and E36N57 both ran their O orders to remainingAmount 0, both
 * terminals fell to ~3.5k O, and neither order could be extended or even
 * marked down again. The empire held 45,787 O against KEEP_FOR_REACTIONS of
 * 10,000 at that moment - the stock was there, in the other five terminals.
 *
 * Same defect shape as the credit reserve that blocked the listing fee
 * (sellListingDeadlock.test): a threshold guarding the only action that
 * clears it.
 */
const MKT = fs.readFileSync("src/Rooms/rooms.market.ts", "utf8");
const CODE = MKT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("a sold-out standing order can still be maintained", () => {
  it("computes whether an order already exists before the gate", () => {
    assert.include(CODE, "const liveOrderID = room.memory.market.sellOrders.roomMineral.ID;");
    assert.include(CODE, "const maintaining = !!(liveOrderID && Game.market.orders[liveOrderID]);");
  });

  it("the terminal minimum only applies when there is nothing to maintain", () => {
    assert.match(
      CODE,
      /\(maintaining \|\| room\.terminal\.store\[resourceToSell\] >= STANDING_SELL_MIN\)/,
    );
    assert.notMatch(
      CODE,
      /!spiking && room\.terminal\.store\[resourceToSell\] >= STANDING_SELL_MIN/,
      "the bare terminal gate is what locked the room out",
    );
  });

  it("keeps the empire-wide stock gate unconditional", () => {
    // This is the rung that actually protects the reaction reserve, and it
    // must apply to creating AND to extending.
    assert.match(
      CODE,
      /empireStock\(resourceToSell\) > KEEP_FOR_REACTIONS \+ STANDING_SELL_AMOUNT/,
    );
  });

  it("still refuses to list into a spike", () => {
    assert.match(CODE, /if\(!spiking &&/);
  });

  it("the maintain branch reads the same flag, so the two cannot drift", () => {
    assert.match(CODE, /if\(maintaining\) \{\s*\n\s*let order = Game\.market\.orders\[liveOrderID\];/);
  });

  it("the create branch is still the else of that flag", () => {
    const gate = CODE.indexOf("if(maintaining) {");
    const create = CODE.indexOf("Game.market.createOrder({");
    assert.isAbove(gate, 0);
    assert.isAbove(create, gate, "createOrder stays on the no-order path");
  });
});
