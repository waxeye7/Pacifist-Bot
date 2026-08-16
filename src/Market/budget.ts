/**
 * Credit budget + shopping list.
 *
 * One place decides how many credits the empire is allowed to burn and on
 * what, so no single market path can repeat the 582,393-credits-for-20k-energy
 * accident. Two independent brakes:
 *   reserve       - credits we never drop below, whatever the deal looks like
 *   budgetPer10k  - rolling spend cap over a 10,000 tick window
 *
 * Console: mkt() for status, mkt("want", "X", 30000) / mkt("reserve", 300000).
 */

import { book, fair } from "./pricing";

export interface MarketMemory {
    /** never spend the empire below this many credits */
    reserve: number;
    /** credits allowed per rolling 10,000 tick window */
    budgetPer10k: number;
    /** rolling window: day = tick the window opened, amount = credits spent in it */
    spent: { day: number; amount: number };
    /** lifetime units sold per resource, so a spike-sell cap cannot overshoot */
    sold: { [res: string]: number };
    /** shopping list: resource -> empire-wide stock target (storage + terminal) */
    want: { [res: string]: number };
    /** optional hard price ceilings; default is 1.2x fair() */
    ceilings: { [res: string]: number };
    /** total units we are willing to spike-sell per resource */
    sellCaps: { [res: string]: number };
    /**
     * Spends booked by note() that have not yet been checked against a real
     * credit movement: c = credits booked, k = Game.market.credits when
     * booked, t = tick booked. See settle().
     */
    pending?: Array<{ c: number; k: number; t: number }>;
    /** order id -> tick we last dealt against it (phantom-deal cooldown) */
    dealt?: { [orderId: string]: number };
}

declare global {
    interface Memory {
        /** market v1 budget + shopping list - see Market/budget.ts */
        mkt?: MarketMemory;
    }
    // eslint-disable-next-line no-var
    var mkt: (cmd?: string, a?: any, b?: any) => string;
}

/** Rolling budget window length in ticks. */
export const BUDGET_WINDOW = 10000;

/** Units of a room mineral kept in storage+terminal for the reaction chains. */
export const KEEP_FOR_REACTIONS = 10000;

/**
 * T3 combat boosts are the goal, and X is 36-62% of every one of them. The
 * empire mines H, O and U only, so K/L/Z/X have to be bought. UH2O and GHO2
 * are optional T2 shortcuts (their ceilings below are the owner's numbers).
 */
const DEFAULT_WANT: { [res: string]: number } = {
    [RESOURCE_CATALYST]: 30000,
    [RESOURCE_LEMERGIUM]: 10000,
    [RESOURCE_KEANIUM]: 10000,
    [RESOURCE_ZYNTHIUM]: 10000,
    [RESOURCE_UTRIUM_ACID]: 5000,
    [RESOURCE_GHODIUM_ALKALIDE]: 5000
};

const DEFAULT_CEILINGS: { [res: string]: number } = {
    [RESOURCE_UTRIUM_ACID]: 200,
    [RESOURCE_GHODIUM_ALKALIDE]: 345
};

const DEFAULT_SELL_CAPS: { [res: string]: number } = {
    [RESOURCE_HYDROGEN]: 30000
};

/** Default buy ceiling as a multiple of fair() - never chase a spike. */
export const CEILING_MULT = 1.2;

function clone(src: { [k: string]: number }): { [k: string]: number } {
    const out: { [k: string]: number } = {};
    for (const k in src) out[k] = src[k];
    return out;
}

/**
 * Memory accessor. Heals field by field rather than replacing the object, so a
 * knob the owner set from console survives a code change that adds a new one.
 */
export function mktMem(): MarketMemory {
    let m: any = Memory.mkt;
    if (!m || typeof m !== "object") {
        m = {};
        Memory.mkt = m;
    }
    if (!(m.reserve >= 0)) m.reserve = 200000;
    if (!(m.budgetPer10k >= 0)) m.budgetPer10k = 150000;
    if (!m.spent || typeof m.spent !== "object") m.spent = { day: Game.time, amount: 0 };
    if (!(m.spent.day >= 0)) m.spent.day = Game.time;
    if (!(m.spent.amount >= 0)) m.spent.amount = 0;
    if (!m.sold || typeof m.sold !== "object") m.sold = {};
    if (!m.want || typeof m.want !== "object") m.want = clone(DEFAULT_WANT);
    if (!m.ceilings || typeof m.ceilings !== "object") m.ceilings = clone(DEFAULT_CEILINGS);
    if (!m.sellCaps || typeof m.sellCaps !== "object") m.sellCaps = clone(DEFAULT_SELL_CAPS);
    return m as MarketMemory;
}

/** Roll the rolling-spend window forward when it has expired. */
function rollWindow(m: MarketMemory): void {
    if (Game.time - m.spent.day >= BUDGET_WINDOW || Game.time < m.spent.day) {
        m.spent.day = Game.time;
        m.spent.amount = 0;
        m.pending = [];
    }
    settle(m);
}

/*
 * PHANTOM DEALS.
 *
 * Game.market.deal() answers OK synchronously and the trade resolves at the
 * end of the tick. If the order was emptied by someone else since
 * getAllOrders() was sampled, or the terminal cannot pay the transfer at
 * resolution, NOTHING happens: no transaction, no credit movement, no error.
 * Every note() site in this bot books the cost on `deal() == OK`, so a stale
 * order that keeps showing up in getAllOrders() is "bought" pass after pass
 * and the rolling budget fills with money that never left. Live shard3:
 * spent 17,568 -> 144,350 booked with Game.market.credits unchanged to the
 * seventh decimal and zero incoming transactions in the window; the ledger
 * then refused every REAL buy as over budget.
 *
 * Two brakes: (1) settle() compares each booked spend with the credit
 * movement observed a tick later and un-books the ones that never happened;
 * (2) dealGuarded() refuses to deal against an order id we already dealt in
 * the last DEAL_COOLDOWN ticks, so a phantom is tried once, not every pass.
 * A phantom that coincides with a real spend the same tick is counted as
 * real - the error is in the safe direction (over-booking keeps the brake).
 */
const PHANTOM_TOLERANCE = 0.9;
export const DEAL_COOLDOWN = 100;
function settle(m: MarketMemory): void {
    if (!m.pending || !m.pending.length) return;
    const now = Game.market.credits;
    const keep: Array<{ c: number; k: number; t: number }> = [];
    let phantom = 0;
    for (const p of m.pending) {
        if (p.t >= Game.time) { keep.push(p); continue; } // resolves at end of its tick
        // Real spends move credits by at least ~all of the booked cost.
        if (now <= p.k - p.c * PHANTOM_TOLERANCE) continue;
        phantom += p.c;
    }
    m.pending = keep;
    if (phantom > 0) {
        m.spent.amount = Math.max(0, m.spent.amount - phantom);
        console.log(`mkt: un-booked ${Math.round(phantom)}c of deals that never resolved (credits ${Math.round(now)})`);
    }
}
export function recentlyDealt(orderId: string): boolean {
    const m = mktMem();
    return !!(m.dealt && m.dealt[orderId] !== undefined && Game.time - m.dealt[orderId] < DEAL_COOLDOWN);
}
/**
 * Game.market.deal with the phantom-deal cooldown. Same return values, plus
 * ERR_TIRED when the order was dealt within DEAL_COOLDOWN ticks. Every deal
 * in this bot goes through here so the cooldown cannot be forgotten.
 */
export function dealGuarded(orderId: string, amount: number, roomName?: string): ScreepsReturnCode {
    if (recentlyDealt(orderId)) return ERR_TIRED;
    const r = roomName === undefined ? Game.market.deal(orderId, amount) : Game.market.deal(orderId, amount, roomName);
    if (r === OK) {
        const m = mktMem();
        if (!m.dealt) m.dealt = {};
        m.dealt[orderId] = Game.time;
        // prune: keep the map small
        for (const id in m.dealt) if (Game.time - m.dealt[id] > DEAL_COOLDOWN * 5) delete m.dealt[id];
    }
    return r;
}

/** Credits already committed inside the current window. */
export function spentThisWindow(): number {
    const m = mktMem();
    rollWindow(m);
    return m.spent.amount;
}

/**
 * Both brakes. `credits` is the FULL cost of the deal being considered
 * (amount * price, or the 5% listing fee for createOrder/changeOrderPrice).
 */
export function canSpend(credits: number): boolean {
    if (!(credits > 0)) return false;
    const m = mktMem();
    rollWindow(m);
    if (Game.market.credits - credits < m.reserve) return false;
    if (m.spent.amount + credits > m.budgetPer10k) return false;
    return true;
}

/** Book a spend against the rolling window. Call only after a deal succeeded. */
export function note(credits: number): void {
    if (!(credits > 0)) return;
    const m = mktMem();
    rollWindow(m);
    m.spent.amount += credits;
    if (!m.pending) m.pending = [];
    m.pending.push({ c: credits, k: Game.market.credits, t: Game.time });
}

/** Units of `res` already sold under the spike-sell cap. */
export function soldOf(res: ResourceConstant): number {
    const m = mktMem();
    return m.sold[res as string] || 0;
}

export function noteSold(res: ResourceConstant, amount: number): void {
    if (!(amount > 0)) return;
    const m = mktMem();
    m.sold[res as string] = (m.sold[res as string] || 0) + amount;
}

/** Total units of `res` this empire will ever spike-sell. 0 = do not sell. */
export function sellCapOf(res: ResourceConstant): number {
    const m = mktMem();
    const v = m.sellCaps[res as string];
    return v >= 0 ? v : 0;
}

/**
 * Highest price we will pay per unit. An explicit ceiling wins; otherwise
 * 1.2x fair, which is what refuses X at 307 while fair is 169.
 */
export function ceilingFor(res: ResourceConstant, fairPrice: number): number {
    const m = mktMem();
    const override = m.ceilings[res as string];
    if (override > 0) return override;
    return fairPrice > 0 ? fairPrice * CEILING_MULT : 0;
}

let stockCacheTick = -1;
let stockCache: { [res: string]: number } = {};

/** Empire-wide storage+terminal holdings of one resource, cached per tick. */
export function empireStock(res: ResourceConstant): number {
    if (stockCacheTick !== Game.time) {
        stockCacheTick = Game.time;
        stockCache = {};
    }
    const key = res as string;
    if (stockCache[key] !== undefined) return stockCache[key];
    let total = 0;
    for (const name in Game.rooms) {
        const r: any = Game.rooms[name];
        if (!r.controller || !r.controller.my) continue;
        if (r.storage) total += r.storage.store[res] || 0;
        if (r.terminal) total += r.terminal.store[res] || 0;
    }
    stockCache[key] = total;
    return total;
}

function fmt(n: number): string {
    return Math.round(n).toString();
}

function status(): string {
    const m = mktMem();
    rollWindow(m);
    const lines: string[] = [];
    lines.push(`=== market v1 === credits ${fmt(Game.market.credits)} | reserve ${fmt(m.reserve)} | window ${fmt(m.spent.amount)}/${fmt(m.budgetPer10k)} per ${BUDGET_WINDOW}t (opened t+${Game.time - m.spent.day})`);
    lines.push("want            have    target  fair    ask     ceiling  buy?");
    for (const res in m.want) {
        const target = m.want[res];
        const have = empireStock(res as ResourceConstant);
        const f = fair(res as ResourceConstant);
        const b = book(res as ResourceConstant);
        const cap = ceilingFor(res as ResourceConstant, f);
        const ok = have < target && b.ask > 0 && cap > 0 && b.ask <= cap;
        lines.push(
            `${res.padEnd(8)}${fmt(have).padStart(10)}${fmt(target).padStart(9)}` +
            `${f.toFixed(1).padStart(8)}${(b.ask || 0).toFixed(1).padStart(8)}` +
            `${cap.toFixed(1).padStart(9)}  ${ok ? "YES" : "no"}`
        );
    }
    const soldKeys = Object.keys(m.sold);
    if (soldKeys.length) {
        const parts: string[] = [];
        for (const res of soldKeys) parts.push(`${res} ${fmt(m.sold[res])}/${fmt(sellCapOf(res as ResourceConstant))}`);
        lines.push("sold (spike cap): " + parts.join(", "));
    }
    console.log(lines.join("\n"));
    return `mkt("want",res,n) mkt("reserve",n) mkt("budget",n) mkt("ceiling",res,n) mkt("sellcap",res,n) mkt("sold",res,n)`;
}

const g = global as any;

/** Console: mkt() status; mkt("want","X",30000); mkt("reserve",300000). */
g.mkt = function (cmd?: string, a?: any, b?: any): string {
    const m = mktMem();
    if (!cmd) return status();
    switch (String(cmd).toLowerCase()) {
        case "want":
            if (typeof a !== "string") return "mkt(\"want\", resource, amount)";
            if (typeof b !== "number") return `want ${a} = ${m.want[a] || 0}`;
            if (b > 0) m.want[a] = b;
            else delete m.want[a];
            return `want ${a} = ${b > 0 ? b : "(removed)"}`;
        case "reserve":
            if (typeof a !== "number") return `reserve = ${m.reserve}`;
            m.reserve = Math.max(0, a);
            return `reserve = ${m.reserve}`;
        case "budget":
            if (typeof a !== "number") return `budgetPer10k = ${m.budgetPer10k}`;
            m.budgetPer10k = Math.max(0, a);
            return `budgetPer10k = ${m.budgetPer10k}`;
        case "ceiling":
            if (typeof a !== "string") return "mkt(\"ceiling\", resource, pricePerUnit)";
            if (typeof b !== "number") return `ceiling ${a} = ${m.ceilings[a] || "(1.2x fair)"}`;
            if (b > 0) m.ceilings[a] = b;
            else delete m.ceilings[a];
            return `ceiling ${a} = ${b > 0 ? b : "(1.2x fair)"}`;
        case "sellcap":
            if (typeof a !== "string") return "mkt(\"sellcap\", resource, units)";
            if (typeof b !== "number") return `sellCap ${a} = ${m.sellCaps[a] || 0}`;
            m.sellCaps[a] = Math.max(0, b);
            return `sellCap ${a} = ${m.sellCaps[a]}`;
        case "sold":
            if (typeof a !== "string") return "mkt(\"sold\", resource, units)";
            if (typeof b !== "number") return `sold ${a} = ${m.sold[a] || 0}`;
            m.sold[a] = Math.max(0, b);
            return `sold ${a} = ${m.sold[a]}`;
        case "reset":
            delete Memory.mkt;
            mktMem();
            return "market memory reset to defaults";
        default:
            return status();
    }
};
