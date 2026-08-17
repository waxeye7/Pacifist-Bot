/**
 * The "bank a reserve before feeding the controller" rule is implemented in TWO
 * files — Roles/energyMiner (the source-link routing and the forwardToController
 * pass) and Functions/creepFunctions (the filler rung that spends storage on the
 * controller link). They cannot import each other without a cycle, so they are
 * duplicated and share the `room._pacBankLow` cache slot.
 *
 * That is a deliberate trade, and the risk it buys is drift: if the two ever
 * disagree, one pass banks while the other spends and the room trades the same
 * energy back and forth at a 3% link tax per hop. These tests pin the numbers
 * and the shared slot so drift is a test failure rather than a live symptom.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { bankBelowReserve } from "../../src/Roles/energyMiner";

const CREEP_FNS = fs.readFileSync(
  path.join(__dirname, "../../src/Functions/creepFunctions.ts"),
  "utf8",
);

function room(opts: { bank?: number | null; terminal?: number; downgrade?: number }): any {
  const bank = opts.bank;
  return {
    storage: bank === null || bank === undefined ? null : { my: true, store: { energy: bank } },
    terminal: opts.terminal === undefined ? null : { my: true, store: { energy: opts.terminal } },
    controller: { my: true, ticksToDowngrade: opts.downgrade === undefined ? 100000 : opts.downgrade },
  };
}

describe("energyMiner: bankBelowReserve", () => {
  it("is true for an established room with an empty bank", () => {
    // VPS W2N1 / W1N2: one-source RCL7 rooms pinned at storage 0 while their
    // controller links cycled 0 -> 450 -> 0 indefinitely.
    assert.isTrue(bankBelowReserve(room({ bank: 0 })));
    assert.isTrue(bankBelowReserve(room({ bank: 1999 })));
  });

  it("is false once the reserve exists, handing priority back to the controller", () => {
    assert.isFalse(bankBelowReserve(room({ bank: 2000 })));
    assert.isFalse(bankBelowReserve(room({ bank: 50000 })));
  });

  it("counts the terminal toward the reserve", () => {
    assert.isFalse(bankBelowReserve(room({ bank: 1000, terminal: 1500 })));
    assert.isTrue(bankBelowReserve(room({ bank: 500, terminal: 500 })));
  });

  it("never fires for a room with no storage — there is no bank to protect", () => {
    // Pre-RCL4 rooms must keep their old behaviour exactly; this is also the
    // speedrun path, which is measured against a frozen control.
    assert.isFalse(bankBelowReserve(room({ bank: null })));
  });

  it("yields to an imminent downgrade — an RCL costs more than the reserve", () => {
    assert.isFalse(bankBelowReserve(room({ bank: 0, downgrade: 14999 })));
    assert.isTrue(bankBelowReserve(room({ bank: 0, downgrade: 15001 })));
  });

  it("caches on room._pacBankLow so the creepFunctions mirror cannot disagree", () => {
    const r = room({ bank: 0 });
    assert.isTrue(bankBelowReserve(r));
    assert.strictEqual(r._pacBankLow, true, "must publish its answer on the shared slot");
    // a later reader takes the cached answer even if the underlying store moved
    r.storage.store.energy = 999999;
    assert.isTrue(bankBelowReserve(r), "should return the cached value within a tick");
  });
});

describe("creepFunctions: the mirrored reserve rule", () => {
  it("uses the same shared cache slot", () => {
    assert.include(CREEP_FNS, "room._pacBankLow", "mirror must read/write the shared slot");
  });

  it("uses the same two constants as energyMiner", () => {
    assert.include(CREEP_FNS, "_CONTROLLER_FEED_RESERVE = 2000");
    assert.include(CREEP_FNS, "_DOWNGRADE_URGENT = 15000");
  });

  it("gates the storage-to-controller-link filler rung on it", () => {
    // Without this the filler spends the bank on the controller link and undoes
    // the miner-side routing one carry at a time.
    assert.match(
      CREEP_FNS,
      /_roomFeedsController\(this\.room\)\s*&&\s*!_bankBelowReserve\(this\.room\)/,
      "the controller-link fill rung must be gated on the reserve",
    );
  });
});
