/**
 * Audit pin (2026-09-19, market fee-energy floor):
 *
 * Every deal initiator in rooms.market pays its transaction fee in ENERGY out
 * of the room's terminal, and the terminal refills from storage — so an
 * unfloored sell or bargain-buy pass keeps pulling fee energy out of a bank
 * that every spending path already refuses to touch. Live E35N58: bank slid
 * 12.8k -> 6.6k through a sell wave while MAINT_BANK_FLOOR correctly froze
 * repairs/upgrades; nothing capped the fee side.
 *
 * The three routine deal paths now cap fee energy at bank - 10000:
 *   - sell_resource(): OrderMaxEnergy gains a bank-headroom term
 *   - spikeSell():   candidates with feeEnergy above headroom are skipped
 *   - buy_resource_crawler(): same OrderMaxEnergy headroom term
 * Deliberately exempt: the energy-bootstrap buy (it refills the terminal —
 * gating it deadlocks a zero-energy room), the panic dump (corrective —
 * unblocks a stuffed terminal), and standing-order fills (the counterparty
 * pays the fee).
 */
import { assert } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

function src(rel: string): string {
    return readFileSync(join(__dirname, "..", "..", "src", rel), "utf8");
}

function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("market fee-energy bank floor", () => {
    const code = stripComments(src(join("Rooms", "rooms.market.ts")));

    it("defines the fee floor constant", () => {
        assert.include(code, "SELL_FEE_BANK_FLOOR = 10000");
    });

    it("sell_resource caps fee energy at bank minus floor", () => {
        assert.include(
            code,
            "bankEnergy(room) - SELL_FEE_BANK_FLOOR"
        );
        const fn = code.slice(code.indexOf("function sell_resource"));
        assert.include(
            fn.slice(0, 800),
            "bankEnergy(room) - SELL_FEE_BANK_FLOOR"
        );
    });

    it("spikeSell skips candidates whose fee exceeds bank headroom", () => {
        const fn = code.slice(code.indexOf("function spikeSell"));
        assert.include(fn.slice(0, 3000), "bankEnergy(room) - SELL_FEE_BANK_FLOOR");
        assert.include(fn.slice(0, 3000), "feeEnergy > bankHeadroom");
    });

    it("buy_resource_crawler caps fee energy at bank minus floor", () => {
        const fn = code.slice(code.indexOf("function buy_resource_crawler"));
        assert.include(
            fn.slice(0, 1500),
            "bankEnergy(room) - SELL_FEE_BANK_FLOOR"
        );
    });

    it("energy-bootstrap buy is NOT floored (it refills the terminal)", () => {
        const bootstrap = code.slice(
            code.indexOf("room.terminal.store[RESOURCE_ENERGY] < ENERGY_BOOTSTRAP_BELOW"),
            code.indexOf("if(!Memory.resource_requests)")
        );
        assert.notInclude(bootstrap, "SELL_FEE_BANK_FLOOR");
    });
});
