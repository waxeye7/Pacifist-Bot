import { expect } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

const DUO = readFileSync(resolve(__dirname, "../../src/Roles/Squad/SquadDuo.ts"), "utf8");
const SQUAD = readFileSync(resolve(__dirname, "../../src/Roles/Squad/SquadCreepA.ts"), "utf8");

// findRoute's ERR_NO_PATH (-2) is sticky in creep.memory.route — the route
// condition reads it as "needs a recompute" and fires findRoute again every
// tick, per traveller, forever, against a target that cannot be reached.
// moveToRoomAvoidEnemyRooms grew a retry backoff for exactly this; the two
// squad movers had the same shape with none.
describe("squad travel: findRoute -2 retry backoff", () => {
  it("SquadDuo.travelToRoom stamps a retry deadline on -2", () => {
    const call = DUO.indexOf("Game.map.findRoute");
    expect(call).to.be.greaterThan(-1);
    const before = DUO.slice(Math.max(0, call - 1200), call);
    expect(before).to.include("routeRetryAt");
    expect(before).to.include("Game.time < creep.memory.routeRetryAt");
    const after = DUO.slice(call, call + 1200);
    expect(after).to.include("route === -2) creep.memory.routeRetryAt = Game.time + DUO_ROUTE_RETRY_TICKS");
  });

  it("SquadCreepA route pass stamps a retry deadline on -2", () => {
    const call = SQUAD.indexOf("creep.memory.route = Game.map.findRoute");
    expect(call).to.be.greaterThan(-1);
    const before = SQUAD.slice(Math.max(0, call - 1500), call);
    expect(before).to.include("routeRetryAt");
    expect(before).to.include("Game.time < creep.memory.routeRetryAt");
    const after = SQUAD.slice(call, call + 1200);
    expect(after).to.include("route == -2) creep.memory.routeRetryAt = Game.time + 50");
  });
});
