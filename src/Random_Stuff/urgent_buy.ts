import { fair } from "Market/pricing";
import { canSpend, ceilingFor, dealGuarded, note } from "Market/budget";
import { logAlways } from "utils/Logger";

const BASE_MINERALS: any[] = [
  RESOURCE_HYDROGEN,
  RESOURCE_OXYGEN,
  RESOURCE_UTRIUM,
  RESOURCE_KEANIUM,
  RESOURCE_LEMERGIUM,
  RESOURCE_ZYNTHIUM,
  RESOURCE_CATALYST,
  RESOURCE_GHODIUM
];

/**
 * Hard per-class price ceiling, used only when Game.market.getHistory() gives
 * us nothing to anchor on. The old code accepted a flat 2000 credits per unit
 * with no relation to what anything is worth: spawn_mosquito asks for 5000
 * units of a T3 boost, so one bad deal could have cost ~10M credits.
 */
function fallbackCeiling(resource: ResourceConstant): number {
  if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) return 20;
  if (BASE_MINERALS.indexOf(resource) >= 0) return 100;
  if (resource === RESOURCE_POWER || resource === RESOURCE_OPS) return 1000;
  // Catalyzed (T3) boosts are all "X" + four characters; the plain T1/T2
  // reaction products are the remaining short codes (OH, UH, UH2O, GHO2, ...).
  const code = resource as string;
  if (code.length === 5 && code.charAt(0) === "X") return 500;
  if (code.length <= 4) return 300;
  // Commodities keep the historical ceiling.
  return 2000;
}

/**
 * Console/emergency purchase. Signature unchanged, but the price ceiling and
 * the credit budget now come from Market/pricing + Market/budget so a manual
 * "urgent" buy cannot quietly drain the reserve the automated paths respect.
 *
 * "Urgent" still means it is allowed to pay over the normal 1.2x-fair shopping
 * ceiling - 3x fair - but never more, and never below Memory.mkt.reserve.
 */
function urgent_buy(terminal: StructureTerminal, resource: ResourceConstant, amount: number) {
  if (!terminal.cooldown) {
    // 3x fair, an explicit Memory.mkt.ceilings override if the owner set one,
    // or a per-class ceiling when the resource has no history to anchor on.
    const avg = fair(resource);
    const configured = ceilingFor(resource, 0);
    let orderPrice = configured > 0 ? configured
      : (avg > 0 ? Math.max(avg * 3, 1) : fallbackCeiling(resource));
    const terminalEnergy = terminal.store[RESOURCE_ENERGY];
    let orders = Game.market.getAllOrders({ type: ORDER_SELL, resourceType: resource });
    orders = _.filter(
      orders,
      order =>
        // Inter-shard orders have no roomName; calcTransactionCost()/deal()
        // cannot be used against them from a terminal.
        !!order.roomName &&
        order.amount > 0 &&
        order.price <= orderPrice &&
        // The transaction fee is paid out of THIS terminal's energy. Without
        // the check a deal we cannot fund gets picked, Game.market.deal fails,
        // and the urgent buy silently does nothing.
        Game.market.calcTransactionCost(
          Math.min(order.amount, amount),
          terminal.room.name,
          order.roomName as string
        ) <= terminalEnergy
    );
    if (orders.length > 0) {
      orders.sort((a, b) => a.price - b.price);
      amount = Math.min(orders[0].amount, amount);
      const cost = amount * orders[0].price;
      if (!canSpend(cost)) {
        logAlways(
          `urgent_buy: ${amount} ${resource} @ ${orders[0].price} = ${Math.round(cost)}c refused ` +
          `(reserve/budget - see mkt())`
        );
        return;
      }
      let result = dealGuarded(orders[0].id, amount, terminal.room.name);
      if (result === 0) {
        note(cost);
        logAlways(`urgent_buy: ${amount} ${resource} @ ${orders[0].price} = ${Math.round(cost)}c (cap ${orderPrice.toFixed(1)})`);
        return;
      } else {
        logAlways("urgent_buy: failed to buy", resource, "because", result);
      }
    } else {
      logAlways(`urgent_buy: no ${resource} at or below ${orderPrice.toFixed(1)}`);
    }
  }
}

export default urgent_buy;
