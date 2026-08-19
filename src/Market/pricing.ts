/**
 * Market price reference.
 *
 * Everything that needs "what is X worth" goes through here so buy ceilings,
 * sell floors and the order crawler all anchor on the SAME numbers:
 *   weightedHistoryAvg() - slow anchor (14d, newest day heaviest)
 *   book()               - live top of book + depth
 *   fair()               - the number to price against (history, book mid last)
 *
 * All three are cached per tick; the raw getAllOrders() lists are cached too
 * because a single tick can ask for the same (type, resource) pair many times.
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
    if(!resourceData || resourceData.length == 0) {
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

// getAllOrders() is the most expensive market call we make, and the buy/sell
// ladders ask for the SAME (type, resource) pair several times in a single
// tick. Cache the raw result on the heap keyed by the tick; every caller
// re-filters into its own array so the cached list is never mutated. Any
// successful deal drops the cache so a later room in the same tick does not
// act on an order it just emptied.
let orderCacheTick = -1;
let orderCache: {[key:string]: any[]} = {};

export function getOrdersCached(type:any, resource:ResourceConstant):any[] {
    if(orderCacheTick !== Game.time) {
        orderCacheTick = Game.time;
        orderCache = {};
        bookCache = {};
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
    // Own tick guard: book() can be the first market call of the tick, so it
    // cannot rely on getOrdersCached() having rolled the cache yet.
    if(bookCacheTick !== Game.time) {
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
    if(fairCacheTick !== Game.time) {
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
