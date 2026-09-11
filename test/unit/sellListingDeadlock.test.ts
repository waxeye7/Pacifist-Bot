import { assert } from "chai";
import fs from "fs";
import { canList, LISTING_FLOOR } from "../../src/Market/budget";

/**
 * THE CREDIT RESERVE FROZE THE EMPIRE OUT OF SELLING.
 *
 * canSpend() is a PURCHASE brake: never drop below Memory.mkt.reserve buying
 * things. A sell listing fee is the opposite trade — 5% of price*amount paid
 * up front to collect 100% of it back as the order fills. Routing it through
 * the purchase reserve deadlocks the empire as soon as credits sit near the
 * reserve, because listing is the only thing that raises them.
 *
 * Live shard3 2026-09-11: credits 200,158.6 against the default reserve of
 * 200,000, so canSpend() had 158 credits of headroom and refused every fee.
 * Three of the four standing sell orders had run to amount 0 and could not be
 * extended (fee ~14,000c); no room could list a replacement (fee ~15,000c).
 * The seven terminals held 53,787 O and 56,000 U against a KEEP_FOR_REACTIONS
 * of 10,000, every room past STANDING_SELL_MIN — roughly 3M credits of stock
 * the bot had locked itself out of realising.
 *
 * This is the same shape as the maintainer and the remote budget before it:
 * two gates that have to agree and do not.
 */
const MKT = fs.readFileSync("src/Rooms/rooms.market.ts", "utf8");
const BUD = fs.readFileSync("src/Market/budget.ts", "utf8");
const CODE = MKT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function withMarket(credits: number, mkt: any, fn: () => void): void {
  const g: any = global;
  const pg = g.Game, pm = g.Memory;
  g.Game = { time: 1000, market: { credits } };
  g.Memory = { mkt };
  try { fn(); } finally { g.Game = pg; g.Memory = pm; }
}

describe("a sell listing fee does not answer to the purchase reserve", () => {
  it("lists when credits sit exactly on the reserve", () => {
    withMarket(200158.6, { reserve: 200000, budgetPer10k: 150000,
      spent: { day: 1000, amount: 0 } }, () => {
      assert.isTrue(canList(15000, 300000), "the live case that deadlocked");
    });
  });

  it("still refuses to spend the empire down to nothing", () => {
    withMarket(LISTING_FLOOR + 100, { reserve: 0, budgetPer10k: 150000,
      spent: { day: 1000, amount: 0 } }, () => {
      assert.isFalse(canList(500, 100000));
      assert.isTrue(canList(99, 100000));
    });
  });

  it("still answers to the rolling spend window", () => {
    // A listing is a real credit outflow. Dropping the reserve must not also
    // drop the only bound on how many of them fire in a window.
    withMarket(1000000, { reserve: 0, budgetPer10k: 10000,
      spent: { day: 1000, amount: 9000 } }, () => {
      assert.isFalse(canList(2000, 500000));
      assert.isTrue(canList(900, 500000));
    });
  });

  it("refuses a fee that is not small against what it lists", () => {
    // The whole argument is that the fee comes back as the order fills. A fee
    // that is a large fraction of the listing is not a listing fee.
    withMarket(1000000, { reserve: 0, budgetPer10k: 150000,
      spent: { day: 1000, amount: 0 } }, () => {
      assert.isFalse(canList(1000, 3000));
      assert.isTrue(canList(1000, 20000));
    });
  });

  it("rejects a zero or negative fee like canSpend does", () => {
    withMarket(1000000, { reserve: 0, budgetPer10k: 150000,
      spent: { day: 1000, amount: 0 } }, () => {
      assert.isFalse(canList(0, 100000));
      assert.isFalse(canList(-5, 100000));
    });
  });
});

describe("every sell-side fee in rooms.market uses it", () => {
  it("the standing-order listing", () => {
    assert.include(CODE, "canList(feeCredits, recPrice * STANDING_SELL_AMOUNT)");
  });

  it("the extension when an order runs down", () => {
    assert.include(CODE, "canList(extendFee, order.price * 4000)");
  });

  it("the paid reprice, which is only ever an increase now", () => {
    // The free DOWNWARD markdown moved above this rung and takes no budget at
    // all; what is left here always costs credits, so the `feeCredits == 0`
    // escape hatch the old two-directional branch needed is gone.
    assert.include(CODE, "canList(feeCredits, recPrice * order.remainingAmount)");
    assert.notInclude(CODE, "feeCredits == 0 ||");
  });

  it("leaves the BUY paths on canSpend", () => {
    // The reserve exists for these and must keep governing them.
    assert.include(CODE, "if(!canSpend(amount * o.price)) continue;");
    assert.match(CODE, /if\(!canSpend\(cost\)\)/);
    assert.match(BUD, /if \(Game\.market\.credits - credits < m\.reserve\) return false;/);
  });
});

describe("a stale ask is marked down before it is extended", () => {
  /*
   * changeOrderPrice is charged only on an INCREASE, and only on the
   * increase; lowering an ask costs nothing. extendOrder is charged 5% of
   * price*addAmount at the order's CURRENT price.
   *
   * Live shard3 2026-09-11, minutes after canList unfroze the sell side: O's
   * best ask was 53.216 and the bot held stale asks at 70.237 and 73.005.
   * Extending one cost 14,047c where the same 4,000 units at the book price
   * cost 10,743c, and it bought 4,000 units that could not sell. The reprice
   * that fixes it sat behind an `else if` AND a `t % 400` cadence, so it
   * could not run for up to 400 ticks after the extend.
   */
  it("puts the free markdown ahead of the extend", () => {
    const markdown = CODE.indexOf("if(recPrice < order.price - 2)");
    const extend = CODE.indexOf("order.remainingAmount <= 1000");
    assert.isAbove(markdown, 0, "the markdown rung must exist");
    assert.isAbove(extend, markdown, "the extend must come after it");
  });

  it("runs the markdown on any tick, not on the paid rung's cadence", () => {
    const block = CODE.slice(
      CODE.indexOf("if(recPrice < order.price - 2)"),
      CODE.indexOf("order.remainingAmount <= 1000"),
    );
    assert.notInclude(block, "t % 400");
    assert.notInclude(block, "canList");
    assert.notInclude(block, "note(");
    assert.include(block, "Game.market.changeOrderPrice(order.id, recPrice)");
  });

  it("keeps the paid INCREASE rare and on its own cadence", () => {
    assert.include(CODE, "else if(t % 400 == 0 && recPrice > order.price + 2)");
    // The old condition was Math.abs(...) > 2, which sent a DECREASE through
    // the paid branch and computed a zero fee for it. One direction each now.
    assert.notMatch(CODE, /Math\.abs\(order\.price - recPrice\) > 2/);
  });
});
