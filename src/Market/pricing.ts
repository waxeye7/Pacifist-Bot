/**
 * Market price reference.
 *
 * Everything that needs "what is X worth" goes through here so buy ceilings,
 * sell floors and the order crawler all anchor on the SAME numbers:
 *   weightedHistoryAvg() - slow anchor (14d, newest day heaviest)
 *   book()               - live top of book + depth
 *   fair()               - the number to price against (history, book mid last)
 *
 * All three are cached on the heap with a real lifetime (ORDER_CACHE_TTL /
 * HISTORY_CACHE_TTL), not per tick: only one room trades on any given tick, so
 * a per-tick cache was thrown away before a second reader could ever hit it.
 */

/**
 * Weighted average of Game.market.getHistory(), newest day heaviest.
 *
 * The weights are 1..n, so the divisor MUST be the sum of the weights that
 * were actually used (n*(n+1)/2). The old code divided by a hardcoded 105
 * (= 1+..+14), which is only correct when the API hands back exactly 14 days.
 * Thinly traded resources return far fewer, and the resulting average was
 * deflated up to 10x - and then fed straight into createOrder()/
 * changeOrderPrice(), i.e. sell orders priced at a tenth of the market.
 *
 * Returns null when there is no history to average at all; callers keep their
 * own fallback price for that case.
 */
export function weightedHistoryAvg(resource:any):{avg:number, stddev:number} | null {
    let resourceData:any = Game.market.getHistory(resource);
    // Private servers hand back {} (no market history endpoint), not an array.
    // {} is truthy and {}.length is undefined, so the old guard passed it and
    // .slice() threw â€” which, wrapped in guarded(room), silently killed the
    // REST of every RCL7+ room pass on the VPS every market tick: the whole
    // 2026-08-19 evening empire collapse started as this one line.
    if(!resourceData || !Array.isArray(resourceData) || resourceData.length == 0) {
        return null;
    }
    // Weight newest day heaviest regardless of the order the API hands the
    // days back in: sort oldest -> newest by the entry's own date string
    // (YYYY-MM-DD sorts lexically). Do not rely on the array order.
    resourceData = resourceData.slice().sort((a:any, b:any) => String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0);
    let myTotalAverage = 0;
    let myTotalStDevAverage = 0;
    let weightNumber = 1;
    let weightSum = 0;
    for(let day of resourceData) {
        myTotalAverage += day.avgPrice * weightNumber;
        myTotalStDevAverage += day.stddevPrice * weightNumber;
        weightSum += weightNumber;
        weightNumber ++;
    }
    if(weightSum <= 0) {
        return null;
    }
    return {avg: myTotalAverage / weightSum, stddev: myTotalStDevAverage / weightSum};
}

/*
 * A PER-TICK CACHE NEVER HIT, BECAUSE ONLY ONE ROOM TRADES PER TICK.
 *
 * getAllOrders() is the most expensive market call we make, and this cached it
 * keyed by Game.time so that the buy/sell ladders inside ONE room's pass share
 * one fetch. That much worked. What it missed is that rooms.ts enters market()
 * only on the room's own staggered `t % 10 == 0`, so across a seven-room
 * empire fewer than one room trades on any given tick — the cache was thrown
 * away before a second room could ever read it.
 *
 * Live shard3 2026-09-11, Memory.CPU.roomParts: `market` averaged 0.626 CPU a
 * tick, second only to `spawning` (0.856) and ahead of `defence` (0.514), on a
 * bot billing 19.5-20.6 against a 20 limit. That is 3% of the entire budget
 * for a module managing four sell orders, whose spend budget is locked at 158
 * credits by Memory.mkt.reserve and which therefore cannot list, extend or
 * reprice anything at all.
 *
 * So the cache gets a real lifetime. Order books move on the scale of hours;
 * a pass that only runs every 10 ticks per room cannot use freshness it is
 * not asking for. invalidateOrderCache() still drops everything the moment a
 * deal lands, which is the one event that genuinely changes what we are
 * looking at.
 */
export const ORDER_CACHE_TTL = 50;
/** getHistory() returns per-DAY aggregates; a tick-scale cache is pointless. */
export const HISTORY_CACHE_TTL = 1000;

let orderCacheTick = -1;
let orderCache: {[key:string]: any[]} = {};

export function getOrdersCached(type:any, resource:ResourceConstant):any[] {
    if(Game.time - orderCacheTick >= ORDER_CACHE_TTL || Game.time < orderCacheTick) {
        orderCacheTick = Game.time;
        orderCache = {};
        bookCache = {};
        bookCacheTick = Game.time;
    }
    let key = type + ":" + resource;
    if(!orderCache[key]) {
        orderCache[key] = Game.market.getAllOrders({type: type, resourceType: resource});
    }
    return orderCache[key];
}

export function invalidateOrderCache():void {
    orderCache = {};
    bookCache = {};
    // Re-stamp so the TTL window restarts from the deal, not from whenever the
    // stale window happened to begin.
    orderCacheTick = Game.time;
    bookCacheTick = Game.time;
}

/** Live top of book for one resource. Prices are 0 when that side is empty. */
export interface Book {
    /** best price a buyer is paying */
    bid: number;
    /** best price a seller is asking */
    ask: number;
    /** units bid for within 10% of the best bid */
    bidDepth: number;
    /** units offered within 10% of the best ask */
    askDepth: number;
}

/**
 * Inter-shard orders come back from getAllOrders() with NO roomName, and
 * calcTransactionCost()/deal() cannot be used against them from a terminal.
 * They must not set the bid/ask we then price ourselves against either.
 */
function tradable(order:any):boolean {
    return !!order && !!order.roomName && order.amount > 0;
}

let bookCacheTick = -1;
let bookCache: {[res:string]: Book} = {};

export function book(resource:ResourceConstant):Book {
    // Own guard: book() can be the first market call of the window, so it
    // cannot rely on getOrdersCached() having rolled the cache yet.
    if(Game.time - bookCacheTick >= ORDER_CACHE_TTL || Game.time < bookCacheTick) {
        bookCacheTick = Game.time;
        bookCache = {};
    }
    const cached = bookCache[resource as string];
    if(cached) {
        return cached;
    }
    const out:Book = {bid: 0, ask: 0, bidDepth: 0, askDepth: 0};

    const buys = getOrdersCached(ORDER_BUY, resource);
    for(let o of buys) {
        if(tradable(o) && o.price > out.bid) out.bid = o.price;
    }
    if(out.bid > 0) {
        const near = out.bid * 0.9;
        for(let o of buys) {
            if(tradable(o) && o.price >= near) out.bidDepth += o.amount;
        }
    }

    const sells = getOrdersCached(ORDER_SELL, resource);
    for(let o of sells) {
        if(tradable(o) && (out.ask == 0 || o.price < out.ask)) out.ask = o.price;
    }
    if(out.ask > 0) {
        const near = out.ask * 1.1;
        for(let o of sells) {
            if(tradable(o) && o.price <= near) out.askDepth += o.amount;
        }
    }

    bookCache[resource as string] = out;
    return out;
}

let fairCacheTick = -1;
let fairCache: {[res:string]: number} = {};

/**
 * The reference price to size ceilings and floors against.
 *
 * History first on purpose: it is exactly the number a spike has NOT moved,
 * which is what makes "never pay more than 1.2x fair" work. Book mid is only
 * used for resources with no trade history at all. 0 = no idea, caller must
 * refuse to trade.
 */
export function fair(resource:ResourceConstant):number {
    // fair() is history-first, and history is daily data. See HISTORY_CACHE_TTL.
    if(Game.time - fairCacheTick >= HISTORY_CACHE_TTL || Game.time < fairCacheTick) {
        fairCacheTick = Game.time;
        fairCache = {};
    }
    const key = resource as string;
    if(fairCache[key] !== undefined) {
        return fairCache[key];
    }
    let value = 0;
    const history = weightedHistoryAvg(resource);
    if(history && history.avg > 0) {
        value = history.avg;
    }
    else {
        const b = book(resource);
        if(b.bid > 0 && b.ask > 0) value = (b.bid + b.ask) / 2;
        else if(b.ask > 0) value = b.ask;
        else if(b.bid > 0) value = b.bid;
    }
    fairCache[key] = value;
    return value;
}

/**
 * Credits per unit of energy, used to price the transaction fee (which is paid
 * in energy) against the credits a deal earns or costs. Falls back to 20 when
 * energy has no history, which is roughly the shard3 floor.
 */
export function energyValue():number {
    const v = fair(RESOURCE_ENERGY);
    return v > 0 ? v : 20;
}
