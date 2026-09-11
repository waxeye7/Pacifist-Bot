import { assert } from "chai";
import fs from "fs";
import { terminalFloat } from "../../src/Roles/energyManager";

/**
 * A ZERO TERMINAL FLOAT TURNS THE WHOLE TERMINAL OFF.
 *
 * terminalFloat's tiers are each 20-25% of the combined storage+terminal bank:
 * 200k -> 40,000, 100k -> 20,000, 20k -> 5,000. Below 20,000 it dropped
 * straight to ZERO, so a room banking 19,999 held no terminal energy at all.
 *
 * Every ACTIVE market path is priced in terminal energy, because the transfer
 * fee is paid from it. spikeSell, shopWantList and the mineral-balancing send
 * each test calcTransactionCost(...) > termEnergy and give up. A standing SELL
 * order still fills - the buyer pays the transfer - which is exactly why the
 * empire kept earning credits and this stayed invisible.
 *
 * Live shard3 2026-09-11, terminal energy by room: E37N59 71, E37N58 143,
 * E36N57 238, E35N59 351, E38N56 450, E39N58 624. Six of seven terminals inert,
 * all of them under the 20,000 rung; the only room above it, E35N58, held its
 * full 5,013.
 *
 * rooms.market's energy-bootstrap valve is documented as being for "a terminal
 * [that] has no energy at all and therefore cannot pay a transaction fee to do
 * anything else" - a state this ladder was manufacturing on purpose. Two gates
 * that had to agree and did not.
 */
const EM = fs.readFileSync("src/Roles/energyManager.ts", "utf8");

function bank(storageE: number, terminalE: number): number {
  return terminalFloat({}, { store: { energy: storageE } }, { store: { energy: terminalE } });
}

describe("terminalFloat has no zero cliff", () => {
  it("keeps every tier it already had", () => {
    assert.strictEqual(bank(200000, 0), 40000);
    assert.strictEqual(bank(100000, 0), 20000);
    assert.strictEqual(bank(20000, 0), 5000);
  });

  it("gives a room just under the old cliff a working terminal", () => {
    assert.strictEqual(bank(19999, 0), 2000);
    assert.strictEqual(bank(10000, 0), 2000);
  });

  it("keeps a smaller room trading rather than inert", () => {
    assert.strictEqual(bank(9999, 0), 1000);
    assert.strictEqual(bank(5000, 0), 1000);
  });

  it("still asks for nothing from a room with no bank to spare", () => {
    assert.strictEqual(bank(4999, 0), 0);
    assert.strictEqual(bank(0, 0), 0);
  });

  it("reads the COMBINED bank, so filling the terminal cannot change the target", () => {
    // Otherwise the fill and drain rungs chase each other.
    assert.strictEqual(bank(9000, 1000), bank(10000, 0));
    assert.include(EM, "storeAmt(storage, RESOURCE_ENERGY) + storeAmt(terminal, RESOURCE_ENERGY)");
  });

  it("never sits inside the drain rung's hysteresis", () => {
    // energyManager drains only above target + 5000, so a freshly filled
    // terminal must not immediately qualify to be emptied again.
    assert.include(EM, "terminal.store[RESOURCE_ENERGY] > terminalEnergyTarget + 5000");
    assert.isBelow(bank(10000, 0), 5000);
  });
});
