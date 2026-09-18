import { assert } from "chai";
import fs from "fs";
import {
  canSafeModeNow,
  emergencyShellActive,
  rampartSitesAllowed,
  siteFreezeBank,
} from "../../src/Rooms/spawnSafety";
import { brokeKeepsSite, placeOrderFor } from "../../src/utils/PlanV2";
import {
  donorReserve,
  pickEmergencyTarget,
  EMERGENCY_FUNNEL_TARGET,
} from "../../src/Empire/funnel";

/**
 * THE SHELL POLICY (owner directive, 2026-09-17):
 *
 *   - No NEW rampart construction below RCL8. Safe mode + towers carry the
 *     room; a shell a broke room cannot repair is a wall that dies anyway.
 *   - Exception: an RCL6-7 room that cannot fire safe mode (no charge, or
 *     still on cooldown) builds its shell as an emergency, and the funnel
 *     feeds it the energy to do it.
 *   - The bank floor ladder is raised at every RCL (150k / 200k / 250k) and
 *     is now ONE ladder (siteFreezeBank) shared by the placer, the strip,
 *     the builder withdraw floor and the donor reserve.
 */
describe("siteFreezeBank — the shared per-RCL bank ladder", () => {
  it("holds the raised floors", () => {
    assert.strictEqual(siteFreezeBank(8), 250000);
    assert.strictEqual(siteFreezeBank(7), 200000);
    assert.strictEqual(siteFreezeBank(6), 150000);
    assert.strictEqual(siteFreezeBank(5), 0);
    assert.strictEqual(siteFreezeBank(1), 0);
  });

  it("is what a donor keeps — donorReserve and the broke floor cannot disagree", () => {
    for (const lvl of [6, 7, 8]) {
      assert.strictEqual(donorReserve(lvl), siteFreezeBank(lvl), `RCL${lvl}`);
    }
  });
});

describe("canSafeModeNow — cooldown is an END TICK, not a boolean", () => {
  const ctrl = (available: number, cooldown: number | undefined) => ({
    my: true,
    safeModeAvailable: available,
    safeModeCooldown: cooldown,
  });

  it("is true with a banked charge and no cooldown", () => {
    assert.isTrue(canSafeModeNow(ctrl(1, undefined), 1000));
    assert.isTrue(canSafeModeNow(ctrl(2, 0), 1000));
  });

  it("is true once the cooldown tick has passed", () => {
    // The bug this kills: "!cooldown" read an expired end-tick as still
    // cooling forever after the first safe mode.
    assert.isTrue(canSafeModeNow(ctrl(1, 500), 1000));
    assert.isTrue(canSafeModeNow(ctrl(1, 1000), 1000));
  });

  it("is false while the cooldown is still running", () => {
    assert.isFalse(canSafeModeNow(ctrl(1, 2000), 1000));
  });

  it("is false with no charge banked, whatever the cooldown says", () => {
    assert.isFalse(canSafeModeNow(ctrl(0, 0), 1000));
    assert.isFalse(canSafeModeNow(ctrl(0, 500), 1000));
  });

  it("is false for a foreign or missing controller", () => {
    assert.isFalse(canSafeModeNow(null, 1000));
    assert.isFalse(canSafeModeNow({ my: false, safeModeAvailable: 5 }, 1000));
  });
});

describe("emergencyShellActive — the RCL6-7 no-safe-mode exception", () => {
  it("fires for RCL6 and RCL7 rooms that cannot safe-mode", () => {
    assert.isTrue(emergencyShellActive(6, false));
    assert.isTrue(emergencyShellActive(7, false));
  });

  it("does not fire when safe mode can fire", () => {
    assert.isFalse(emergencyShellActive(6, true));
    assert.isFalse(emergencyShellActive(7, true));
  });

  it("does not fire at other RCLs — not even safe-mode-less ones", () => {
    for (const lvl of [1, 2, 3, 4, 5, 8]) {
      assert.isFalse(emergencyShellActive(lvl, false), `RCL${lvl}`);
      assert.isFalse(emergencyShellActive(lvl, true), `RCL${lvl}`);
    }
  });
});

describe("rampartSitesAllowed — no new ramparts below RCL8", () => {
  it("is open at RCL8", () => {
    assert.isTrue(rampartSitesAllowed(8, false));
    assert.isTrue(rampartSitesAllowed(8, true));
  });

  it("is closed at RCL1-7 in the normal case", () => {
    for (const lvl of [1, 4, 5, 6, 7]) {
      assert.isFalse(rampartSitesAllowed(lvl, false), `RCL${lvl}`);
    }
  });

  it("opens for the shell emergency only", () => {
    assert.isTrue(rampartSitesAllowed(6, true));
    assert.isTrue(rampartSitesAllowed(7, true));
    assert.isFalse(rampartSitesAllowed(5, true));
    assert.isFalse(rampartSitesAllowed(4, true));
  });
});

describe("brokeKeepsSite — the strip and the placer share one keep-set", () => {
  it("keeps rampart sites under the shell emergency", () => {
    assert.isTrue(brokeKeepsSite("rampart", 1000, 120000, false, true));
  });

  it("still drops rampart sites for a non-naked, non-emergency broke room", () => {
    assert.isFalse(brokeKeepsSite("rampart", 1000, 120000, false, false));
  });

  it("keeps them for a naked shell as before", () => {
    assert.isTrue(brokeKeepsSite("rampart", 1000, 120000, true, false));
  });

  it("leaves the rest of the keep-set untouched by the emergency flag", () => {
    assert.isFalse(brokeKeepsSite("lab", 1000, 120000, false, true));
    assert.isTrue(brokeKeepsSite("spawn", 1000, 120000, false, true));
    assert.isTrue(brokeKeepsSite("tower", 1000, 120000, false, true));
    assert.isTrue(brokeKeepsSite("road", 1000, 120000, false, true));
  });
});

describe("placeOrderFor — the shell emergency jumps rampart to the front", () => {
  it("puts rampart right after spawn/storage/tower under emergency", () => {
    const order = placeOrderFor(7, true);
    assert.strictEqual(order.indexOf("rampart"), 3);
    assert.isBelow(order.indexOf("rampart"), order.indexOf("container"));
    assert.isBelow(order.indexOf("rampart"), order.indexOf("extension"));
  });

  it("keeps rampart at index 7 in the normal order", () => {
    const order = placeOrderFor(7, false);
    assert.strictEqual(order.indexOf("rampart"), 7);
    assert.isAbove(order.indexOf("rampart"), order.indexOf("link"));
  });
});

describe("pickEmergencyTarget — the thinnest defenceless room gets the feed", () => {
  const cand = (
    name: string,
    level: number,
    bank: number,
    canSafeMode: boolean,
    hasTerminal = true,
  ) => ({ name, level, bank, canSafeMode, hasTerminal });

  it("picks the lowest-bank emergency room", () => {
    const target = pickEmergencyTarget([
      cand("A", 7, 60000, false),
      cand("B", 6, 20000, false),
      cand("C", 7, 90000, false),
    ]);
    assert.strictEqual(target, "B");
  });

  it("ignores rooms that can still safe-mode", () => {
    const target = pickEmergencyTarget([
      cand("A", 7, 5000, true),
      cand("B", 7, 60000, false),
    ]);
    assert.strictEqual(target, "B");
  });

  it("ignores rooms without a terminal — nothing can be sent to them", () => {
    const target = pickEmergencyTarget([
      cand("A", 7, 5000, false, false),
      cand("B", 7, 60000, false),
    ]);
    assert.strictEqual(target, "B");
  });

  it("ignores rooms already able to fund their own shell", () => {
    assert.isNull(
      pickEmergencyTarget([cand("A", 7, EMERGENCY_FUNNEL_TARGET, false)]),
    );
    assert.strictEqual(
      pickEmergencyTarget([
        cand("A", 7, EMERGENCY_FUNNEL_TARGET, false),
        cand("B", 7, EMERGENCY_FUNNEL_TARGET - 1, false),
      ]),
      "B",
    );
  });

  it("ignores RCL5 and RCL8 rooms outright", () => {
    assert.isNull(
      pickEmergencyTarget([cand("A", 5, 1000, false), cand("B", 8, 1000, false)]),
    );
  });
});

/**
 * SOURCE PINS — the policy must hold at every place a rampart site can be
 * born, not just the one that was edited first. These grep the real files so
 * a future rampart path that forgets the gate fails the suite, not the room.
 */
const PV2 = fs.readFileSync("src/utils/PlanV2.ts", "utf8");
const CONSTRUCTION = fs.readFileSync("src/Rooms/rooms.construction.ts", "utf8");
const PERIMETER = fs.readFileSync("src/utils/Perimeter.ts", "utf8");
const MINER = fs.readFileSync("src/Roles/energyMiner.ts", "utf8");

describe("source pins — every rampart path is gated", () => {
  it("the planV2 placement loop refuses ramparts below policy", () => {
    assert.include(
      PV2,
      'type === "rampart" && !rampartSitesAllowed(lvl, shellEmergency)',
    );
  });

  it("the v2 erector list publishes empty outside the policy", () => {
    assert.include(PV2, "rampartSitesAllowed(lvl, emergencyShellActive(lvl,");
  });

  it("the legacy erector-list writer is gated the same way", () => {
    assert.include(PERIMETER, "rampartSitesAllowed(");
  });

  it("the legacy direct-site path computes the flag once", () => {
    assert.include(CONSTRUCTION, "shellRampartsAllowed");
    // and the spawn-tile rampart — the one legacy block with its own RCL
    // gate — uses it rather than SHELL_MIN_RCL
    assert.include(CONSTRUCTION, "if(spawn && shellRampartsAllowed)");
  });

  it("the miner link-cover path is gated", () => {
    assert.include(MINER, "rampartSitesAllowed(creep.room.controller.level");
  });
});
