import { assert } from "chai";
import fs from "fs";

/**
 * A PER-TICK CACHE THAT COULD NEVER BE HIT TWICE.
 *
 * Market/pricing cached getAllOrders(), the order book and the fair price
 * keyed on Game.time, so that one room's buy and sell ladders shared a single
 * fetch. That part worked. What it missed is that rooms.ts enters market()
 * only on the room's OWN staggered clock, `t % 10 == 0` — so across a
 * seven-room empire fewer than one room trades on any given tick, and the
 * cache was thrown away before a second room could ever read it.
 *
 * Live shard3 2026-09-11, Memory.CPU.roomParts: `market` averaged 0.626 CPU a
 * tick — second only to `spawning` at 0.856, ahead of `defence` at 0.514 —
 * on a bot billing 19.5-20.6 against a 20 limit. Three per cent of the entire
 * budget, for a module managing four sell orders whose spend budget is locked
 * at 158 credits by Memory.mkt.reserve, so it cannot list, extend or reprice
 * anything at all.
 *
 * Order books move on the scale of hours and getHistory() returns per-DAY
 * aggregates. A pass that runs once per ten ticks per room cannot use
 * freshness it never asks for.
 */
const P = fs.readFileSync("src/Market/pricing.ts", "utf8");
const CODE = P.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the market price caches have a real lifetime", () => {
  it("no longer keys any cache on the bare tick", () => {
    assert.notMatch(CODE, /CacheTick !== Game\.time/);
  });

  it("orders and book share one window", () => {
    assert.include(CODE, "export const ORDER_CACHE_TTL = 50;");
    assert.match(CODE, /Game\.time - orderCacheTick >= ORDER_CACHE_TTL/);
    assert.match(CODE, /Game\.time - bookCacheTick >= ORDER_CACHE_TTL/);
  });

  it("history gets a much longer one, because it is daily data", () => {
    assert.include(CODE, "export const HISTORY_CACHE_TTL = 1000;");
    assert.match(CODE, /Game\.time - fairCacheTick >= HISTORY_CACHE_TTL/);
    const order = Number((CODE.match(/ORDER_CACHE_TTL = (\d+);/) || [])[1]);
    const hist = Number((CODE.match(/HISTORY_CACHE_TTL = (\d+);/) || [])[1]);
    assert.isAbove(hist, order);
  });

  it("survives a global reset going backwards in time", () => {
    // Game.time only ever increases on a live shard, but the heap survives a
    // reset and the unit suite and console tools set Game.time freely. A
    // negative difference must refresh, not freeze the cache forever.
    assert.match(CODE, /Game\.time < orderCacheTick/);
    assert.match(CODE, /Game\.time < bookCacheTick/);
    assert.match(CODE, /Game\.time < fairCacheTick/);
  });

  it("a deal still drops everything immediately", () => {
    /*
     * A filled order is the one event that genuinely changes what we are
     * looking at, and it is the reason the per-tick cache existed: a later
     * room must not act on an order this one just emptied. The window has to
     * restart from the deal, not from whenever the stale window began.
     */
    const fn = CODE.slice(
      CODE.indexOf("export function invalidateOrderCache"),
      CODE.indexOf("export function invalidateOrderCache") + 400,
    );
    assert.include(fn, "orderCache = {};");
    assert.include(fn, "bookCache = {};");
    assert.include(fn, "orderCacheTick = Game.time;");
    assert.include(fn, "bookCacheTick = Game.time;");
  });

  it("the TTL is short enough that a spike is not traded on stale depth", () => {
    // spikeSell hits live bids and is the only free path out of a mineral
    // stock. A spike lasts hundreds of ticks; 50 is well inside that, and a
    // successful deal refreshes anyway.
    const order = Number((CODE.match(/ORDER_CACHE_TTL = (\d+);/) || [])[1]);
    assert.isAtMost(order, 200);
    assert.isAtLeast(order, 10, "below the market entry cadence it saves nothing");
  });
});
