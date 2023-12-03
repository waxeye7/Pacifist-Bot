function urgent_buy(terminal: StructureTerminal, resource: ResourceConstant, amount: number) {
  if (!terminal.cooldown) {
    let orderPrice = 2000;
    let orders = Game.market.getAllOrders({ type: ORDER_SELL, resourceType: resource });
    orders = _.filter(orders, order => order.price <= orderPrice);
    console.log(orders);
    if (orders.length > 0) {
      orders.sort((a, b) => a.price - b.price);
      amount = Math.min(orders[0].amount, amount);
      let orderID = orders[0].id;
      let result = Game.market.deal(orderID, amount, terminal.room.name);
      if (result === 0) {
        console.log(
          orders[0].amount,
          resource,
          "Bought at Price:",
          orders[0].price,
          "=",
          orders[0].amount * orders[0].price
        );
        return;
      } else {
        console.log("failed to buy", resource, "becuase", result);
      }
    }
  }
}

export default urgent_buy;
