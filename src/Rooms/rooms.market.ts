import { roomTickOffset } from "./rooms.remotes";
import { logVerbose } from "utils/Logger";
import { book, energyValue, fair, getOrdersCached, invalidateOrderCache } from "Market/pricing";
import {
    KEEP_FOR_REACTIONS,
    canSpend,
    ceilingFor,
    dealGuarded,
    empireStock,
    mktMem,
    note,
    noteSold,
    sellCapOf,
    soldOf
} from "Market/budget";

// weightedHistoryAvg lives in Market/pricing now; re-exported here so the
// existing importer (Random_Stuff/urgent_buy) keeps resolving.
export { weightedHistoryAvg } from "Market/pricing";

// ---------------------------------------------------------------------------
// market v1 policy constants. Everything the module is allowed to pay or
// accept is one of these; nothing is hardcoded further down.
// ---------------------------------------------------------------------------

/** Max units bought in one deal from the shopping list. */
const BUY_LOT = 1000;
/**
 * Skip a buy whose transaction fee, valued in credits (fee energy x energy
 * price), eats more than this share of the deal's credit value. Valued in
 * credits rather than "energy per unit" on purpose: X at ~170c from 25 rooms
 * out costs ~0.57 energy/unit (~9% of its price - fine), while Z at 12c from
 * the same distance would be ~130% (correctly refused). A flat energy-per-unit
 * cap could not tell those apart, and the live X book has no seller within 5
 * rooms of E37N59.
 */
const BUY_FEE_SHARE = 0.15;
/** Orders within this much of the best price are ranked by distance instead. */
const BUY_PRICE_BAND = 1.02;

/** bid >= SPIKE_MULT * fair() is a spike worth dumping into. */
const SPIKE_MULT = 1.5;
/** Max units sold into a spike in one deal. */
const SPIKE_LOT = 5000;
/**
 * Skip a sell whose fee, valued in credits, eats more than this of the gross.
 * Measured against the live H book on 2026-08-16: the best bid (223 @ E56N48,
 * 19 rooms out) costs 5.7% and the deep 330k bid at E51S33 costs 13.1%, so
 * anything tighter than ~0.15 refuses every bid on the board and the spike
 * sell never fires. Buys use the much tighter BUY_FEE_SHARE instead - there we
 * are not sitting on a 4x windfall and can simply wait.
 */
const SELL_FEE_SHARE = 0.15;

/** Terminal units of the room mineral needed before a standing sell order. */
const STANDING_SELL_MIN = 5000;
/** Size of the standing sell order. */
const STANDING_SELL_AMOUNT = 5000;
/** Screeps charges this fraction of price*amount to list or to raise a price. */
const ORDER_FEE = 0.05;

/**
 * Bootstrap energy buying only. Deliberately unreachable on shard3, where
 * energy asks sit near 27c: we do not convert credits into RCL energy at all
 * (762k credits is ~28k energy - irrelevant next to what the rooms mine).
 */
const ENERGY_BOOTSTRAP_PRICE = 3;
const ENERGY_BOOTSTRAP_BELOW = 300;

/** Hard per-unit cap for the low-value order crawler. */
const CRAWLER_MAX_PRICE = 3;

/**
 * Deposit / factory commodity sell floors, unchanged from the hardcoded ladder
 * this table replaced. Walked on t % 100 only - these never trade in volume.
 */
const COMMODITY_FLOORS: {res:ResourceConstant, floor:number}[] = [
    {res: RESOURCE_CONDENSATE,  floor: 999},
    {res: RESOURCE_CONCENTRATE, floor: 9999},
    {res: RESOURCE_EXTRACT,     floor: 80000},
    {res: RESOURCE_SPIRIT,      floor: 199999},
    {res: RESOURCE_EMANATION,   floor: 800000},
    {res: RESOURCE_ESSENCE,     floor: 2000000},
    {res: RESOURCE_WIRE,        floor: 999},
    {res: RESOURCE_SWITCH,      floor: 9999},
    {res: RESOURCE_TRANSISTOR,  floor: 80000},
    {res: RESOURCE_MICROCHIP,   floor: 199999},
    {res: RESOURCE_CIRCUIT,     floor: 800000},
    {res: RESOURCE_DEVICE,      floor: 2000000},
    {res: RESOURCE_CELL,        floor: 999},
    {res: RESOURCE_PHLEGM,      floor: 9999},
    {res: RESOURCE_TISSUE,      floor: 80000},
    {res: RESOURCE_MUSCLE,      floor: 199999},
    {res: RESOURCE_ORGANOID,    floor: 800000},
    {res: RESOURCE_ORGANISM,    floor: 2000000},
    {res: RESOURCE_ALLOY,       floor: 999},
    {res: RESOURCE_TUBE,        floor: 9999},
    {res: RESOURCE_FIXTURES,    floor: 80000},
    {res: RESOURCE_FRAME,       floor: 199999},
    {res: RESOURCE_HYDRAULICS,  floor: 800000},
    {res: RESOURCE_MACHINE,     floor: 2000000}
];

/** Inter-shard orders have no roomName - deal()/calcTransactionCost() cannot use them. */
function dealable(order:any):boolean {
    return !!order && !!order.roomName && order.amount > 0;
}

/** Price of the standing sell order: max(bid + 0.5, 0.9 * fair). */
function standingSellPrice(res:ResourceConstant):number {
    const avg = fair(res);
    const b = book(res);
    let price = 0;
    if(b.bid > 0) price = b.bid + 0.5;
    if(avg > 0) price = Math.max(price, avg * 0.9);
    return price;
}

/**
 * One buy per room per pass off Memory.mkt.want.
 *
 * Refuses to chase: the ceiling is 1.2x the weighted history average (or an
 * explicit override), which is exactly what makes X at 307 a no-trade while
 * fair sits at 169. Fee-capped, budget-capped, and among the orders within 2%
 * of the best price it takes the NEAREST one rather than the cheapest, because
 * the fee is paid in energy and energy is the scarce thing here.
 */
function shopWantList(room:any):boolean {
    const term = room.terminal;
    const termEnergy = term.store[RESOURCE_ENERGY] || 0;
    const eValueBuy = energyValue();
    const termFree = term.store.getFreeCapacity();
    if(termFree < 1000) return false;

    const m = mktMem();
    for(const res in m.want) {
        const target = m.want[res];
        if(!(target > 0)) continue;
        const resource = res as ResourceConstant;
        const have = empireStock(resource);
        if(have >= target) continue;

        const avg = fair(resource);
        const cap = ceilingFor(resource, avg);
        if(!(cap > 0)) continue;

        const want = Math.min(BUY_LOT, target - have, termFree);
        if(want < 100) continue;

        const orders = getOrdersCached(ORDER_SELL, resource);
        let candidates:any[] = [];
        let best = 0;
        for(const o of orders) {
            if(!dealable(o) || o.price > cap) continue;
            const amount = Math.min(want, o.amount);
            const feeEnergy = Game.market.calcTransactionCost(amount, room.name, o.roomName);
            if(feeEnergy > termEnergy) continue;
            if(feeEnergy * eValueBuy > BUY_FEE_SHARE * amount * o.price) continue;
            if(!canSpend(amount * o.price)) continue;
            if(best == 0 || o.price < best) best = o.price;
            candidates.push({order: o, amount: amount, feeEnergy: feeEnergy});
        }
        if(!candidates.length) {
            logVerbose(`mkt buy ${room.name}: no ${res} at or below ${cap.toFixed(1)} (fair ${avg.toFixed(1)}, ask ${book(resource).ask})`);
            continue;
        }

        candidates = candidates.filter(c => c.order.price <= best * BUY_PRICE_BAND);
        candidates.sort((a, b) =>
            Game.map.getRoomLinearDistance(room.name, a.order.roomName) -
            Game.map.getRoomLinearDistance(room.name, b.order.roomName));

        const pick = candidates[0];
        const cost = pick.amount * pick.order.price;
        const result = dealGuarded(pick.order.id, pick.amount, room.name);
        if(result == OK) {
            invalidateOrderCache();
            note(cost);
            logVerbose(`mkt buy ${room.name}: ${pick.amount} ${res} @ ${pick.order.price} = ${Math.round(cost)}c (cap ${cap.toFixed(1)}, fee ${pick.feeEnergy}e, stock ${have}/${target})`);
            return true;
        }
        logVerbose(`mkt buy ${room.name}: ${res} deal failed (${result})`);
    }
    return false;
}

/**
 * Dump into a price spike. Only fires while the best bid is >= 1.5x the
 * weighted history average, never sells below that same 1.5x floor, stops at
 * Memory.mkt.sellCaps[res] total and always leaves KEEP_FOR_REACTIONS behind.
 */
function spikeSell(room:any, res:ResourceConstant):boolean {
    const term = room.terminal;
    const avg = fair(res);
    if(!(avg > 0)) return false;
    const b = book(res);
    const floor = avg * SPIKE_MULT;
    if(!(b.bid >= floor)) return false;

    const cap = sellCapOf(res);
    const already = soldOf(res);
    if(already >= cap) return false;

    const spare = empireStock(res) - KEEP_FOR_REACTIONS;
    const inTerminal = term.store[res] || 0;
    const want = Math.min(SPIKE_LOT, inTerminal, spare, cap - already);
    if(want < 100) return false;

    const termEnergy = term.store[RESOURCE_ENERGY] || 0;
    const eValue = energyValue();
    const orders = getOrdersCached(ORDER_BUY, res);
    let candidates:any[] = [];
    for(const o of orders) {
        if(!dealable(o) || o.price < floor) continue;
        const amount = Math.min(want, o.amount);
        const feeEnergy = Game.market.calcTransactionCost(amount, room.name, o.roomName);
        if(feeEnergy > termEnergy) continue;
        // Fee is energy, revenue is credits - compare them in credits.
        if(feeEnergy * eValue > SELL_FEE_SHARE * amount * o.price) continue;
        candidates.push({order: o, amount: amount, feeEnergy: feeEnergy, net: amount * o.price - feeEnergy * eValue});
    }
    if(!candidates.length) return false;
    // Rank on NET proceeds, not headline price: two bids 0.01c apart can be 19
    // and 67 rooms away, which is a 2000+ energy difference on a 5000 lot.
    candidates.sort((a, b2) => b2.net - a.net);

    const pick = candidates[0];
    const result = dealGuarded(pick.order.id, pick.amount, room.name);
    if(result == OK) {
        invalidateOrderCache();
        noteSold(res, pick.amount);
        logVerbose(`mkt spike-sell ${room.name}: ${pick.amount} ${res} @ ${pick.order.price} = ${Math.round(pick.amount * pick.order.price)}c net ${Math.round(pick.net)}c (fair ${avg.toFixed(1)}, floor ${floor.toFixed(1)}, sold ${soldOf(res)}/${cap}, fee ${pick.feeEnergy}e)`);
        return true;
    }
    logVerbose(`mkt spike-sell ${room.name}: ${res} deal failed (${result})`);
    return false;
}

function market(room):any {
    // EVERY cadence in this function runs on the room's staggered clock `t`,
    // never on absolute Game.time. The caller (rooms.ts) only enters market()
    // on ticks where t % 10 == 0, so an absolute gate like Game.time % 400
    // could only ever fire for rooms whose stagger offset happens to be a
    // multiple of 10 - for every other room it would simply never be true.
    // One shared clock keeps all the inner cadences (%20 ... %10000) aligned
    // with the entry gate, and keeps a console-invoked market(room) throttled.
    const t = Game.time + roomTickOffset(room.name);
    if(room.terminal && room.terminal.cooldown == 0 && room.storage && room.memory.Structures.spawn && Game.getObjectById(room.memory.Structures.spawn) && t % 10 == 0 && Game.cpu.bucket > 1000) {
        let BaseResources = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_KEANIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST];
        let Mineral:any = Game.getObjectById(room.memory.mineral) || room.findMineral();



        let resourceToSell:ResourceConstant = Mineral.mineralType;

        // Panic dump: the terminal is nearly full of one mineral and blocking
        // every other market path. Sell it, but AT THE BOOK - the old loop
        // walked every bid in descending order and would happily have crossed
        // into a 0.001c order once the top ones were gone.
        if(room.terminal.store.getUsedCapacity() > 280000 && room.terminal.store[resourceToSell] > 100000) {
            const dumpBook = book(resourceToSell);
            const dumpFloor = dumpBook.bid * 0.95;
            let orders = getOrdersCached(ORDER_BUY, resourceToSell).slice();
            orders.sort(function(a,b){return b.price - a.price;});
            for(let order of orders) {
                if(!dealable(order) || order.price < dumpFloor) continue;
                let orderQuantity = Math.min(500, order.amount);
                if(Game.market.calcTransactionCost(orderQuantity, room.name, order.roomName) > room.terminal.store[RESOURCE_ENERGY]) continue;
                let result = dealGuarded(order.id, orderQuantity, room.name);
                if(result == 0) {
                    invalidateOrderCache();
                    logVerbose(`mkt panic-dump ${room.name}: ${orderQuantity} ${resourceToSell} @ ${order.price} (bid ${dumpBook.bid})`);
                    return;
                }
            }
        }

        if(!room.memory.market) {
            room.memory.market = {};
        }
        if(!room.memory.market.sellOrders) {
            room.memory.market.sellOrders = {};
        }
        if(!room.memory.market.sellOrders.roomMineral) {
            room.memory.market.sellOrders.roomMineral = {};
        }

        // (a) SPIKE SELL. Hits live bids, pays no listing fee, and is the only
        // path that should be moving the room mineral while H trades at ~4x
        // its own 14d average. One deal per pass - dealGuarded() puts the
        // terminal on TERMINAL_COOLDOWN, so a second deal this tick is ERR_TIRED.
        if(spikeSell(room, resourceToSell)) {
            return;
        }

        // (b) STANDING SELL ORDER, when there is no spike to hit.
        //
        // Priced at max(bid + 0.5, 0.9 * fair) instead of the old
        // "average - 6" ladder, which listed H at ~42 while the bid was 201.
        //
        // Two guards the old code did not have:
        //  - createOrder / changeOrderPrice(up) cost 5% of price*amount in
        //    CREDITS. Repricing 5000 H from 42 to 201 is ~40k credits, so the
        //    fee goes through the same budget as a purchase.
        //  - never list during a spike: the deal() path above is already
        //    selling into it for free, and a 5000-unit listing at spike price
        //    burns ~50k credits for an order that goes stale when it collapses.
        const standingAvg = fair(resourceToSell);
        const standingBook = book(resourceToSell);
        const spiking = standingAvg > 0 && standingBook.bid >= standingAvg * SPIKE_MULT;
        if(!spiking && room.terminal.store[resourceToSell] >= STANDING_SELL_MIN &&
           empireStock(resourceToSell) > KEEP_FOR_REACTIONS + STANDING_SELL_AMOUNT) {
            const recPrice = standingSellPrice(resourceToSell);
            if(recPrice > 0) {
                if(room.memory.market.sellOrders.roomMineral.ID && Game.market.orders[room.memory.market.sellOrders.roomMineral.ID]) {
                    let order = Game.market.orders[room.memory.market.sellOrders.roomMineral.ID];
                    if(order.remainingAmount <= 1000) {
                        // extendOrder is charged the same 5% of price*addAmount.
                        const extendFee = order.price * 4000 * ORDER_FEE;
                        if(canSpend(extendFee) && Game.market.extendOrder(order.id, 4000) == OK) {
                            note(extendFee);
                            logVerbose(`mkt sell-order ${room.name}: extended ${resourceToSell} by 4000 (fee ${Math.round(extendFee)}c)`);
                        }
                    }
                    else if(t % 400 == 0 && Math.abs(order.price - recPrice) > 2) {
                        // Only a price INCREASE is charged, and only on the increase.
                        const feeCredits = recPrice > order.price ? (recPrice - order.price) * order.remainingAmount * ORDER_FEE : 0;
                        if(feeCredits == 0 || canSpend(feeCredits)) {
                            if(Game.market.changeOrderPrice(order.id, recPrice) == OK) {
                                if(feeCredits > 0) note(feeCredits);
                                logVerbose(`mkt sell-order ${room.name}: repriced ${resourceToSell} ${order.price} -> ${recPrice.toFixed(2)} (fee ${Math.round(feeCredits)}c)`);
                            }
                        }
                        else {
                            logVerbose(`mkt sell-order ${room.name}: reprice ${resourceToSell} to ${recPrice.toFixed(2)} skipped, ${Math.round(feeCredits)}c fee over budget`);
                        }
                    }
                }
                else {
                    let foundOrder = false;
                    let Orders = Game.market.orders;
                    for(let orderID in Orders) {
                        let myOrder = Game.market.orders[orderID];
                        if(myOrder.resourceType == resourceToSell && myOrder.type == ORDER_SELL && myOrder.roomName == room.name) {
                            foundOrder = true;
                            room.memory.market.sellOrders.roomMineral.ID = orderID;
                            break;
                        }
                    }

                    if(!foundOrder) {
                        const feeCredits = recPrice * STANDING_SELL_AMOUNT * ORDER_FEE;
                        if(canSpend(feeCredits)) {
                            if(Game.market.createOrder({
                                type: ORDER_SELL,
                                resourceType: resourceToSell,
                                price: recPrice,
                                totalAmount: STANDING_SELL_AMOUNT,
                                roomName: room.name
                            }) == OK) {
                                note(feeCredits);
                                logVerbose(`mkt sell-order ${room.name}: listed ${STANDING_SELL_AMOUNT} ${resourceToSell} @ ${recPrice.toFixed(2)} (fee ${Math.round(feeCredits)}c)`);
                            }
                        }
                        else {
                            logVerbose(`mkt sell-order ${room.name}: listing ${resourceToSell} @ ${recPrice.toFixed(2)} skipped, ${Math.round(feeCredits)}c fee over budget`);
                        }
                    }
                }
            }
        }

//------------------------------------------------------------------------------------------------------------------------------------------------

        // buy section
        if(!Memory.my_goods) {
            Memory.my_goods = {
                "H":[],
                "O":[],
                "U":[],
                "K":[],
                "L":[],
                "Z":[],
                "X":[]
            }
        }
        if(t % 10000 == 0) {
            // A lone `= false` wiped the empire list and this room had
            // already passed its push, so every other room bought from
            // market until they next entered. Rebuild from live rooms.
            const goods: any = { "H":[], "O":[], "U":[], "K":[], "L":[], "Z":[], "X":[] };
            for (const name in Game.rooms) {
                const r: any = Game.rooms[name];
                if (!r.controller || !r.controller.my) continue;
                const mineral: any = (r.memory.mineral && Game.getObjectById(r.memory.mineral)) || (r.findMineral && r.findMineral());
                const mt = mineral && mineral.mineralType;
                if (mt && goods[mt] && goods[mt].indexOf(name) < 0) goods[mt].push(name);
            }
            Memory.my_goods = goods;
        }
        if(Memory.my_goods[Mineral.mineralType] && (Memory.my_goods[Mineral.mineralType].length == 0 || !Memory.my_goods[Mineral.mineralType].includes(room.name, 0))) {
            Memory.my_goods[Mineral.mineralType].push(room.name);
        }

        if(room.terminal.store[RESOURCE_ENERGY] >= 2000) {

            if(room.memory.Structures.spawn && Game.getObjectById(room.memory.Structures.spawn) && room.storage) {
                for(let resource of BaseResources) {
                    if(room.terminal.store[resource] < 8000 && resource != Mineral.mineralType) {
                        if(Memory.my_goods[resource] && Memory.my_goods[resource].length > 0) {
                            for(let room_with_mineral of Memory.my_goods[resource]) {
                                if(!Game.rooms[room_with_mineral]) {
                                    // filter() returns the pruned copy - it was
                                    // being discarded, so the dead room stayed
                                    // in the list forever; and the `break`
                                    // meant no live room BEHIND the dead entry
                                    // ever shipped this mineral again.
                                    Memory.my_goods[resource] = Memory.my_goods[resource].filter(function(r) {return r !== room_with_mineral;});
                                    continue;
                                }
                                let donorTerm = Game.rooms[room_with_mineral].terminal;
                                if(donorTerm && donorTerm.store[resource] >= 1000) {
                                    // Donor may be on cooldown or lack the send-fee energy;
                                    // a failed send used to `break` and skip every later donor.
                                    if(donorTerm.cooldown != 0) continue;
                                    if(donorTerm.store[RESOURCE_ENERGY] < Game.market.calcTransactionCost(1000, room_with_mineral, room.name)) continue;
                                    if(donorTerm.send(resource, 1000, room.name, "enjoy this " + resource + " other room!") == OK) {
                                        console.log("sending", room.name, "1000", resource)
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }





            // The `credits > 1M` rungs that used to live here bought ANY base
            // mineral the terminal was short of, at up to 500c/unit, on a
            // 10-tick clock - 1000 X at 307 every pass would have been ~300k
            // credits a minute. Replaced by the explicit shopping list: only
            // what the T3 chains actually need, only below 1.2x fair, one deal
            // per room per pass, under a rolling credit budget.
            if(shopWantList(room)) {
                return;
            }

            let SellResources = [RESOURCE_MIST, RESOURCE_GHODIUM_MELT, RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID,
            RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_ZYNTHIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_UTRIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_PURIFIER,
            RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_SILICON,RESOURCE_KEANIUM_ACID,RESOURCE_GHODIUM_HYDRIDE,RESOURCE_GHODIUM_ACID,RESOURCE_OPS];



            for(let resource of SellResources) {

                if(resource === RESOURCE_OPS && room.terminal.store[resource] < 35000) {
                    continue;
                }
                if(resource === RESOURCE_KEANIUM_ACID) {
                    // Hold KA while XKH2O is still under its 10k target —
                    // selling the feedstock made the catalyze rung unreachable.
                    const st = room.storage;
                    const term = room.terminal;
                    const xkh = ((st && st.store[RESOURCE_CATALYZED_KEANIUM_ACID]) || 0) + (term.store[RESOURCE_CATALYZED_KEANIUM_ACID] || 0);
                    const ka = ((st && st.store[RESOURCE_KEANIUM_ACID]) || 0) + (term.store[RESOURCE_KEANIUM_ACID] || 0);
                    if (xkh < 10000 && ka < 3000) continue;
                }
                if(resource === RESOURCE_GHODIUM_HYDRIDE || resource === RESOURCE_GHODIUM_ACID) {
                    // Same shape as the KA guard above: keep a reserve of the
                    // ghodium intermediates instead of dumping every gram at >=2c,
                    // and only sell the surplus on top of it.
                    //
                    // NB (checked against rooms.labs.ts ~694-715): the XGHO2 chain
                    // the labs actually run is G+O -> GO -> +OH -> GHO2 -> +X -> XGHO2,
                    // so its feedstock is GHODIUM_OXIDE / GHODIUM_ALKALIDE - neither of
                    // which is on this sell list. GH and GH2O feed the XGH2O rung, which
                    // is commented out in rooms.labs.ts today (energyManager even hauls
                    // them to the terminal as surplus). They are still five reaction
                    // steps deep, so hold a floor in case that rung comes back rather
                    // than let the ladder drain the room to zero.
                    const st = room.storage;
                    const term = room.terminal;
                    const xgh = ((st && st.store[RESOURCE_CATALYZED_GHODIUM_ACID]) || 0) + (term.store[RESOURCE_CATALYZED_GHODIUM_ACID] || 0);
                    const held = ((st && st.store[resource]) || 0) + (term.store[resource] || 0);
                    if (xgh < 10000 && held < 3000) continue;
                }

                if(room.terminal.store[resource] >= 1000) {
                    let result = sell_resource(resource, 2, 1000);
                    if(result == 0) {
                        return;
                    }
                }
                if(room.terminal.store[resource] >= 100 && t % 100 == 0) {
                    let result = sell_resource(resource, 2, 100);
                    if(result == 0) {
                        return;
                    }
                }
                if(room.terminal.store[resource] >= 1 && t % 1000 == 0) {
                    let result = sell_resource(resource, 2, 10);
                    if(result == 0) {
                        return;
                    }
                }
                if(room.terminal.store[resource] >= 1 && t % 10000 == 0) {
                    let result = sell_resource(resource, 2, 1);
                    if(result == 0) {
                        return;
                    }
                }
            }


        }

        /**
         * Floor-priced sell into the best bid at or above OrderPrice.
         * buy_resource() used to sit next to this; it only served the deleted
         * `credits > 1M` rungs and is gone - buying goes through shopWantList().
         */
        function sell_resource(resource:ResourceConstant, OrderPrice:number=5, OrderAmount=100):any | void {
            // The transaction fee comes out of THIS terminal's energy, so a
            // flat amount*8 budget happily picked deals the terminal could not
            // pay for - they came back as a bare console.log(result) and the
            // resource never moved.
            let OrderMaxEnergy = Math.min(OrderAmount * 8, room.terminal.store[RESOURCE_ENERGY]);
            let orders = getOrdersCached(ORDER_BUY, resource);
            orders = _.filter(orders, (order) => dealable(order) && order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price >= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => b.price - a.price);
                let orderID = orders[0].id;
                let result = dealGuarded(orderID, OrderAmount, room.name);
                if(result == 0) {
                    invalidateOrderCache();
                    logVerbose(`mkt sell ${room.name}: ${OrderAmount} ${resource} @ ${orders[0].price} = ${Math.round(OrderAmount * orders[0].price)}c (floor ${OrderPrice})`);
                    return result;
                }
                logVerbose(`mkt sell ${room.name}: ${resource} deal failed (${result})`);
            }
        }


        let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

        // ENERGY BUY-BY-DEAL, bootstrap only.
        //
        // Credits do NOT buy RCL energy here: shard3 asks sit near 27c, so the
        // whole 762k credit pile is ~28k energy. The valve is kept only for the
        // case where a terminal has no energy at all and therefore cannot pay a
        // transaction fee to do anything else - and even that is capped at 3c.
        // On shard3 both conditions together make this dead code, on purpose.
        if(room.terminal.store[RESOURCE_ENERGY] < ENERGY_BOOTSTRAP_BELOW && storage && storage.store[RESOURCE_ENERGY] < 40000) {
            let OrderAmount = 5000;
            // Fee is paid from terminal energy, and there is barely any.
            let OrderMaxEnergy = room.terminal.store[RESOURCE_ENERGY];
            let orders = getOrdersCached(ORDER_SELL, RESOURCE_ENERGY);
            orders = _.filter(orders, (order) => dealable(order) && order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= ENERGY_BOOTSTRAP_PRICE);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                const cost = OrderAmount * orders[0].price;
                if(canSpend(cost)) {
                    let result = dealGuarded(orders[0].id, OrderAmount, room.name);
                    if(result == 0) {
                        invalidateOrderCache();
                        note(cost);
                        logVerbose(`mkt energy-bootstrap ${room.name}: ${OrderAmount} energy @ ${orders[0].price} = ${Math.round(cost)}c`);
                        return;
                    }
                    logVerbose(`mkt energy-bootstrap ${room.name}: deal failed (${result})`);
                }
            }
        }



        if(!Memory.resource_requests) {
            Memory.resource_requests = {
                "XLHO2":[],
                "XKHO2":[],
                "XUH2O":[],
                "XLH2O":[],
                "XGHO2":[],
                "XZHO2":[],
                "XZH2O":[],
                "XKH2O":[],
            };
        }
        let boostsToNeed = [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
                            RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
                            RESOURCE_CATALYZED_UTRIUM_ACID,
                            RESOURCE_CATALYZED_LEMERGIUM_ACID,
                            RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
                            RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
                            RESOURCE_CATALYZED_ZYNTHIUM_ACID,
                            RESOURCE_CATALYZED_KEANIUM_ACID];

        for(let boost of boostsToNeed) {
            if(storage && storage.store[boost] < 10000 && room.terminal.store[boost] < 3000) {
                if(!Memory.resource_requests[boost].includes(room.name)) {
                    Memory.resource_requests[boost].push(room.name);
                }
            }
            else if(Memory.resource_requests[boost].length > 0) {
                Memory.resource_requests[boost] = Memory.resource_requests[boost].filter(function (roomName) {return roomName !== room.name;});
            }
        }


        for(let boost of boostsToNeed) {
            if(room.terminal && room.terminal.store[boost] > 500 && storage && storage.store[boost] > 18000) {
                if(Memory.resource_requests[boost].length > 0) {
                    // Requesters are our own visible rooms; dead/lost names stay
                    // in the list forever otherwise and every surplus tick walks them.
                    for(let i = Memory.resource_requests[boost].length - 1; i >= 0; i--) {
                        let reqName = Memory.resource_requests[boost][i];
                        if(!(Game.rooms[reqName] && Game.rooms[reqName].controller && Game.rooms[reqName].controller.my)) {
                            Memory.resource_requests[boost].splice(i, 1);
                        }
                    }
                    for(let roomName of Memory.resource_requests[boost]) {
                        if(roomName !== room.name && Game.rooms[roomName] && Game.rooms[roomName].memory.Structures.spawn && Game.getObjectById(Game.rooms[roomName].memory.Structures.spawn) && Game.rooms[roomName].storage) {
                            let roomObj = Game.rooms[roomName];
                            if(roomObj && roomObj.controller && roomObj.controller.level >= 6) {
                                let theirTerminal = roomObj.terminal;
                                let theirStorage:any = Game.getObjectById(roomObj.memory.Structures.storage);
                                if(theirTerminal && theirStorage && theirTerminal.store.getFreeCapacity() > 10000 && theirStorage.store.getFreeCapacity() > 10000) {
                                    // Send fee is paid from this terminal's energy; a failed
                                    // send must not return or later requesters never get served.
                                    if(room.terminal.store[RESOURCE_ENERGY] < Game.market.calcTransactionCost(500, room.name, roomName)) {
                                        continue;
                                    }
                                    if(room.terminal.send(boost, 500, roomName, "enjoy this " + boost + " other room!") == OK) {
                                        console.log("sending", roomName, "500", boost)
                                        return;
                                    }
                                }
                            }
                            else {
                                Memory.resource_requests[boost] = Memory.resource_requests[boost].filter(function (name) {return name !== roomName;});
                            }
                        }
                    }
                }
            }
        }




        // Deposit + factory commodity ladder. This was ~240 lines of hardcoded
        // if(store[X] >= n) sell_resource(X, floor, n) blocks; the floors are
        // unchanged, the amounts collapse to one descending ladder because the
        // high-tier commodities only ever have 1-10 unit bids on the book.
        // Walked on t % 100 - none of this trades often enough to poll harder.
        if(t % 100 == 0) {
            for(const row of COMMODITY_FLOORS) {
                const held = room.terminal.store[row.res] || 0;
                if(held <= 0) continue;
                let last = 0;
                for(const lot of [10, 5, 2, 1]) {
                    const amount = Math.min(held, lot);
                    if(amount <= 0 || amount == last) continue;
                    last = amount;
                    if(sell_resource(row.res, row.floor, amount) == 0) {
                        return;
                    }
                }
            }
        }


        if(Game.resources.pixel > 0 && room.terminal && t % 100 == 0) {
            let OrderPrice = 50000;

            let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: PIXEL});
            orders = _.filter(orders, (order) => order.amount >= 1 && order.price >= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => b.price - a.price);
                let orderID = orders[0].id;
                let result = dealGuarded(orderID, 1, room.name);
                if(result == 0) {
                    console.log(1, PIXEL, "Sold at Price:", orders[0].price, "=", 1 * orders[0].price);
                    return;
                }
                else {
                    console.log(result);
                }
            }
            else {
                console.log("no order found below price of", OrderPrice, "for", PIXEL);
            }

        }
    }
    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
    if(storage && storage.store[RESOURCE_ENERGY] > 300000 && t % 110 == 0 && Game.cpu.bucket > 9000 && room.terminal.cooldown == 0 && room.terminal.store.getFreeCapacity() > 50000) {
        // RESOURCE_ENERGY is deliberately NOT in this list. The crawler buys in
        // 50-unit lots and the transaction fee is itself paid in energy, so an
        // energy entry could burn hundreds of energy of fee plus credits to
        // receive 50 energy. Energy purchasing is handled properly elsewhere in
        // this file: the <=20c / 5000-unit block above (terminal-energy clamped)
        // and the standing ORDER_BUY maintained further down.
        let crawler_list = [
            RESOURCE_POWER,RESOURCE_HYDROGEN,RESOURCE_LEMERGIUM,RESOURCE_GHODIUM,
            RESOURCE_SILICON,RESOURCE_METAL,RESOURCE_BIOMASS,RESOURCE_MIST,RESOURCE_HYDROXIDE,RESOURCE_ZYNTHIUM_KEANITE,RESOURCE_UTRIUM_LEMERGITE,RESOURCE_UTRIUM_HYDRIDE,
            RESOURCE_UTRIUM_OXIDE,RESOURCE_KEANIUM_HYDRIDE,RESOURCE_KEANIUM_OXIDE,RESOURCE_LEMERGIUM_HYDRIDE,RESOURCE_LEMERGIUM_OXIDE,RESOURCE_ZYNTHIUM_HYDRIDE,
            RESOURCE_ZYNTHIUM_OXIDE,RESOURCE_GHODIUM_HYDRIDE,RESOURCE_GHODIUM_OXIDE,RESOURCE_UTRIUM_ACID,RESOURCE_UTRIUM_ALKALIDE,RESOURCE_KEANIUM_ACID,
            RESOURCE_KEANIUM_ALKALIDE,RESOURCE_LEMERGIUM_ACID,RESOURCE_LEMERGIUM_ALKALIDE,RESOURCE_ZYNTHIUM_ACID,RESOURCE_ZYNTHIUM_ALKALIDE,RESOURCE_GHODIUM_ACID,
            RESOURCE_GHODIUM_ALKALIDE,RESOURCE_CATALYZED_UTRIUM_ACID,RESOURCE_CATALYZED_UTRIUM_ALKALIDE,RESOURCE_CATALYZED_KEANIUM_ACID,RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
            RESOURCE_CATALYZED_LEMERGIUM_ACID,RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,RESOURCE_CATALYZED_ZYNTHIUM_ACID,RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
            RESOURCE_CATALYZED_GHODIUM_ACID,RESOURCE_CATALYZED_GHODIUM_ALKALIDE,RESOURCE_OPS,RESOURCE_UTRIUM_BAR,RESOURCE_LEMERGIUM_BAR,RESOURCE_ZYNTHIUM_BAR,
            RESOURCE_KEANIUM_BAR,RESOURCE_GHODIUM_MELT,RESOURCE_OXIDANT,RESOURCE_REDUCTANT,RESOURCE_PURIFIER,RESOURCE_BATTERY,RESOURCE_COMPOSITE,RESOURCE_CRYSTAL,
            RESOURCE_LIQUID,RESOURCE_WIRE,RESOURCE_SWITCH,RESOURCE_TRANSISTOR,RESOURCE_MICROCHIP,RESOURCE_CIRCUIT,RESOURCE_DEVICE,RESOURCE_CELL,RESOURCE_PHLEGM,
            RESOURCE_TISSUE,RESOURCE_MUSCLE,RESOURCE_ORGANOID,RESOURCE_ORGANISM,RESOURCE_ALLOY,RESOURCE_TUBE,RESOURCE_FIXTURES,RESOURCE_FRAME,RESOURCE_HYDRAULICS,
            RESOURCE_MACHINE,RESOURCE_CONDENSATE,RESOURCE_CONCENTRATE,RESOURCE_EXTRACT,RESOURCE_SPIRIT,RESOURCE_EMANATION,RESOURCE_ESSENCE
        ]

        // Walking the whole list meant ~77 getAllOrders() calls in a SINGLE tick.
        // Take a small rotating slice instead; the cursor lives in room memory so
        // successive passes still cover every entry, just spread over ~16 passes.
        const CRAWLER_SLICE = 5;
        if(!room.memory.market) {
            room.memory.market = {};
        }
        let crawlerIndex = room.memory.market.crawlerIndex || 0;
        if(!(crawlerIndex >= 0) || crawlerIndex >= crawler_list.length) {
            crawlerIndex = 0;
        }
        let crawler_slice:any[] = [];
        for(let i = 0; i < CRAWLER_SLICE && i < crawler_list.length; i++) {
            crawler_slice.push(crawler_list[(crawlerIndex + i) % crawler_list.length]);
        }
        room.memory.market.crawlerIndex = (crawlerIndex + CRAWLER_SLICE) % crawler_list.length;

        let shuffled_crawler_list = crawler_slice
            .map(value => ({ value, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ value }) => value);

        if(room.terminal.store[RESOURCE_ENERGY] >= 2000) {
            let count = 0;
            for(let resource of shuffled_crawler_list) {
                let result = buy_resource_crawler(resource);
                if(result == 0) {
                    return;
                }
                else if(!result) {
                    count += 1
                }
            }
            logVerbose(`mkt crawler ${room.name}: ${count}/${shuffled_crawler_list.length} nothing cheap enough`);
        }

        function buy_resource_crawler(resource:ResourceConstant):any | void {
            let OrderAmount = 50;
            // Per-unit cap is min(3, half of fair). The flat 3c let the crawler
            // pay 3c for things whose 14d average is 0.2c; anything at half of
            // fair is a genuine mispricing, anything above it is not.
            const avg = fair(resource);
            const OrderPrice = avg > 0 ? Math.min(CRAWLER_MAX_PRICE, avg * 0.5) : CRAWLER_MAX_PRICE;
            // calcTransactionCost() is always strictly below the amount moved, so
            // the old OrderAmount*8 (=400) budget was no budget at all - a 50-unit
            // lot could cost ~48 energy of fee from the far side of the map on top
            // of the credits. Require the fee to stay under half of what we
            // receive, and never above what the terminal actually holds.
            let OrderMaxEnergy = Math.min(Math.ceil(OrderAmount / 2), room.terminal.store[RESOURCE_ENERGY]);
            let orders = getOrdersCached(ORDER_SELL, resource);
            orders = _.filter(orders, (order) => dealable(order) && order.amount >= OrderAmount && Game.market.calcTransactionCost(OrderAmount, room.name, order.roomName) <= OrderMaxEnergy && order.price <= OrderPrice);
            if(orders.length > 0) {
                orders.sort((a,b) => a.price - b.price);
                const cost = OrderAmount * orders[0].price;
                if(!canSpend(cost)) {
                    return false;
                }
                let result = dealGuarded(orders[0].id, OrderAmount, room.name);
                if(result == 0) {
                    invalidateOrderCache();
                    note(cost);
                    logVerbose(`mkt crawler ${room.name}: ${OrderAmount} ${resource} @ ${orders[0].price} = ${Math.round(cost)}c (cap ${OrderPrice.toFixed(2)})`);
                    return result;
                }
                logVerbose(`mkt crawler ${room.name}: ${resource} deal failed (${result})`);
            }
            else {
                return false;
            }
        }
    }

    let targetRampRoom = Memory.targetRampRoom.room;
    if (
      targetRampRoom &&

      t % 1000 === 0 &&
      Game.rooms[targetRampRoom] &&
      Game.rooms[targetRampRoom].controller?.level === 8 &&
      Game.rooms[targetRampRoom].storage?.store[RESOURCE_ENERGY] >= 400000
    ) {
      // NOT `delete Memory.targetRampRoom`: MemoryManager only reseeds the
      // container at the START of the next tick, and this tick ~10 readers
      // (the RCL6-8 filler rungs in rooms.spawning, rooms.factory,
      // energyManager, rooms.ts) dereference .room/.urgent unguarded - so
      // deleting the object threw a TypeError in every room iterated after
      // this one and unwound rooms(), which also skipped RunAllCreepsManager:
      // every creep in the empire idled for a tick each time a ramp target
      // graduated. Clear the fields, keep the container.
      Memory.targetRampRoom.room = false;
      Memory.targetRampRoom.urgent = false;
      targetRampRoom = undefined;
    }
    if(targetRampRoom && t % 20 == 0 && room.name != targetRampRoom && Game.rooms[targetRampRoom] && Game.rooms[targetRampRoom].controller && Game.rooms[targetRampRoom].controller.my && Game.rooms[targetRampRoom].controller.level >= 6 &&
        Game.rooms[targetRampRoom].terminal && Game.rooms[targetRampRoom].terminal.store[RESOURCE_ENERGY] < 80000 && Game.rooms[targetRampRoom].terminal.store.getFreeCapacity() > 50000 && Game.rooms[targetRampRoom].memory.Structures.spawn && Game.getObjectById(Game.rooms[targetRampRoom].memory.Structures.spawn) && Game.rooms[targetRampRoom].storage) {
            let theirRoom:any = Game.rooms[targetRampRoom];
            let theirStorage = Game.getObjectById(theirRoom.memory.Structures.storage) || theirRoom.findStorage();
            // This send sits outside the main cooldown==0 market gate.
            if(room.terminal.cooldown == 0 && theirStorage && theirStorage.store[RESOURCE_ENERGY] < 455000 && room.terminal.store[RESOURCE_ENERGY] >= 40000 && storage && (storage.store[RESOURCE_ENERGY] > 200000 && Memory.CPU.reduce && theirStorage.store[RESOURCE_ENERGY] < 300000 || storage.store[RESOURCE_ENERGY] > 290000 && !Memory.CPU.reduce)) {
                room.terminal.send(RESOURCE_ENERGY, 10000, targetRampRoom, "enjoy this energy, other room!");
                console.log("sending room", targetRampRoom, "10000 energy")
            }
    }
    // Game.time % 10 == 0 && targetRampRoom && targetRampRoom == room.name && room.terminal.store[RESOURCE_ENERGY] < 150000 && Game.market.credits > 100000000 ||


    if(t % 1000 === 0 && storage && room.terminal && storage.store[RESOURCE_ENERGY] > 430000 && room.terminal.store[RESOURCE_ENERGY] > 30000) {
        // This block is outside the main t%10 market gate, so rooms that never
        // entered it have no market.sellOrders and threw here.
        if(!room.memory.market) {
            room.memory.market = {};
        }
        if(!room.memory.market.sellOrders) {
            room.memory.market.sellOrders = {};
        }
        if(!room.memory.market.sellOrders.energy) {
            room.memory.market.sellOrders.energy = {};
        }
        if(room.memory.market?.sellOrders?.energy?.ID) {
            let order = Game.market.orders[room.memory.market.sellOrders.energy.ID];
            if(order && order.remainingAmount < 20000) {
                Game.market.extendOrder(order.id, 20000 - order.remainingAmount);
                let newPrice = CalcPriceForOrder(RESOURCE_ENERGY);
                if(newPrice > order.price) Game.market.changeOrderPrice(order.id,newPrice);
            }

            if(!order) {
                delete room.memory.market.sellOrders.energy.ID;
            }
        }
        else if(!room.memory.market?.sellOrders?.energy?.ID) {
            let found = false;
            for(let orderID in Game.market.orders) {
                let order = Game.market.orders[orderID];
                if(order.roomName == room.name && order.resourceType == RESOURCE_ENERGY && order.type == ORDER_SELL) {
                    room.memory.market.sellOrders.energy.ID = orderID;
                    found = true;
                }
            }
            if(!found) {
                let result = Game.market.createOrder({
                    type: ORDER_SELL,
                    resourceType: RESOURCE_ENERGY,
                    price: CalcPriceForOrder(RESOURCE_ENERGY),
                    totalAmount: 20000,
                    roomName: room.name
                });
                if(result == 0) {
                    console.log("created order to sell energy");
                }
                else {
                    console.log(result, "error creating order to sell energy");
                }
            }
        }

        function CalcPriceForOrder(resourceToSell) {
            // fair() is the same weighted-history anchor everything else in
            // this module prices against; +1 puts this ask just above it.
            const avg = fair(resourceToSell);
            return avg > 0 ? avg + 1 : 5.889;
        }
    }

    // The standing energy BUY order that used to live here priced itself at
    // "history average + 1" and, at tick 82.16M, spent 582,393 credits on
    // 20,000 energy - 29c each, for the resource the rooms already dig out of
    // the ground. Credits exist to buy the T3 boost inputs the empire cannot
    // mine (X, K, L, Z). Deleted, not re-tuned.
    //
    // An order created by the old code can still be live and still filling, so
    // retire any of ours that survived the deploy.
    if(t % 100 == 0) {
        for(let orderID in Game.market.orders) {
            let order = Game.market.orders[orderID];
            if(order.type == ORDER_BUY && order.resourceType == RESOURCE_ENERGY && order.roomName == room.name) {
                if(Game.market.cancelOrder(orderID) == OK) {
                    logVerbose(`mkt ${room.name}: cancelled legacy energy BUY order (${order.remainingAmount} left @ ${order.price})`);
                }
            }
        }
    }
}
export default market;
