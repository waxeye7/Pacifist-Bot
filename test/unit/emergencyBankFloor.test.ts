/**
 * The "keep ~10k banked for emergencies" floor. Live E38N56 drained storage
 * 6.9k -> 2.4k while its upgrader sat parked: the park bands held at 10k, but
 * the filler rung kept topping the controller link out of the bank (gate was
 * 2k) and the discretionary roles' withdraw floor was 2k.
 *
 * These pin the three halves of the fix: the controller-feed reserve equals
 * the park floor, the withdraw ladder's default rung is 10k with a wartime
 * exception, and the roles that used to take the bank with a bare withdraw()
 * all go through withdrawStorage so the ladder owns the floor.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

function src(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "../../src", rel), "utf8");
}

const CREEP_FNS = src("Functions/creepFunctions.ts");

describe("withdrawStorage floor ladder", () => {
  it("keeps the emergency reserve at 10k for unrung roles", () => {
    assert.include(CREEP_FNS, "STORAGE_FLOOR_RESERVE = 10000");
    // The peacetime default is the reserve, not the wartime floor.
    assert.match(CREEP_FNS, /return STORAGE_FLOOR_RESERVE;/);
  });

  it("keeps the old 2000 while the room is under attack", () => {
    // During a siege the repairs are what the reserve exists to buy.
    assert.match(
      CREEP_FNS,
      /mem\.danger \|\| \(mem\.danger_timer \|\| 0\) > 0\)\) return STORAGE_FLOOR_DEFAULT/,
      "danger must drop the default rung back to 2000",
    );
  });

  it("leaves the lowered rungs alone", () => {
    // Builder/bootstrap and the controller roles keep their incident-fixed
    // floors — raising them is what starved W2N1.
    assert.include(CREEP_FNS, "STORAGE_FLOOR_BUILD = 300");
    assert.include(CREEP_FNS, "STORAGE_FLOOR_UPGRADE = 1000");
  });
});

describe("bare storage withdraws route through the floor ladder", () => {
  const cases: [string, string][] = [
    ["Roles/RampartErector.ts", "the erector drained the bank to 0 building shell"],
    ["Roles/SneakyControllerUpgrader.ts", "remote upgrading is discretionary below the reserve"],
    ["Roles/SpecialCarry.ts", "the siege feed is covered by the danger override"],
    ["Roles/RoomLocker.ts", "claim ops must not empty the home bank"],
    ["Roles/buildcontainer.ts", "filling for a foreign build is discretionary spend"],
  ];
  for (const [rel, why] of cases) {
    it(rel, () => {
      const body = src(rel);
      assert.notMatch(
        body,
        /\.withdraw\(storage,\s*RESOURCE_ENERGY\)/,
        `bare withdraw(storage) bypasses the floor — ${why}`,
      );
      assert.include(body, "withdrawStorage", "must draw via the floor ladder");
    });
  }

  it("buildcontainer has no bare room.storage withdraw left", () => {
    assert.notMatch(
      src("Roles/buildcontainer.ts"),
      /\.withdraw\(creep\.room\.storage,\s*RESOURCE_ENERGY\)/,
    );
  });
});

describe("RampartErector spawn gate", () => {
  it("does not hatch a worker that cannot draw", () => {
    // The gate and the floor it draws against must agree: below 10k the role
    // cannot fill, so spawning at 2000 just bought a parked creep.
    const spawning = src("Rooms/rooms.spawning.ts");
    const gate = spawning.indexOf("'RampartErector'");
    assert.isAbove(gate, -1);
    const window = spawning.slice(gate, gate + 700);
    assert.include(window, "storage.store[RESOURCE_ENERGY] > 10000");
    assert.notInclude(window, "storage.store[RESOURCE_ENERGY] > 2000");
  });
});
