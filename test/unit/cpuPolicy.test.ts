/**
 * CpuPolicy decides whether the empire may run remotes at all. When it says no
 * it does not merely skip work: rooms.spawning force-closes every remote and
 * recalls the crews. So a gate that is wrong in the closed direction starves
 * the economy silently, and closing remotes lowers income rather than CPU, so
 * nothing brings the average back down on its own.
 *
 * That is exactly what happened on live shard3: a 100-tick average of 16.7
 * against a limit of 20, bucket climbing, and every remote disabled.
 */
import { assert } from "chai";
import { getCpuPolicy, billedTickCpu, skipOptionalCreep, creepRoleIsOptional } from "../../src/utils/CpuPolicy";

/** Minimal Game/Memory good enough for getCpuPolicy, which reads only these. */
function withCpu(limit: number, bucket: number, avg100: number, fn: () => void): void {
  const g: any = global;
  const prevGame = g.Game;
  const prevMemory = g.Memory;
  g.Game = { cpu: { limit, bucket } };
  g.Memory = { CPU: { hundredTickAvg: { avg: avg100 } } };
  try {
    fn();
  } finally {
    g.Game = prevGame;
    g.Memory = prevMemory;
  }
}

describe("utils/CpuPolicy", () => {
  describe("allowRemotes headroom margin", () => {
    it("opens remotes for a shard3 bot sitting just under its limit with a healthy bucket", () => {
      // The regression. avg 16.7 of a limit of 20 is UNDER budget — the bucket
      // was climbing — but a flat `avg < limit - 4` rule demanded < 16 and so
      // latched remotes off forever.
      withCpu(20, 7400, 16.7, () => {
        assert.isTrue(getCpuPolicy().allowRemotes);
      });
    });

    it("is monotone in bucket: more reserve is never more restrictive", () => {
      // A non-monotone rule is what produces the on/off/on oscillation that
      // recalls the whole remote fleet every cycle.
      const avg = 17.5;
      let sawAllowed = false;
      for (let bucket = 5000; bucket <= 10000; bucket += 250) {
        let allowed = false;
        withCpu(20, bucket, avg, () => {
          allowed = getCpuPolicy().allowRemotes;
        });
        if (allowed) sawAllowed = true;
        // once allowed at some bucket, it must stay allowed at every larger one
        if (sawAllowed) {
          assert.isTrue(allowed, `allowRemotes flipped back off at bucket ${bucket}`);
        }
      }
      assert.isTrue(sawAllowed, "never allowed remotes at any bucket level");
    });

    it("still refuses remotes when the bucket is genuinely low", () => {
      withCpu(20, 3500, 10, () => {
        assert.isFalse(getCpuPolicy().allowRemotes, "3500 bucket is below the shard3 entry bar");
      });
      withCpu(20, 1500, 5, () => {
        const p = getCpuPolicy();
        assert.isTrue(p.economyOnly, "1500 bucket should be economyOnly");
        assert.isFalse(p.allowRemotes);
      });
    });

    it("still refuses remotes when average usage is genuinely over the limit", () => {
      withCpu(20, 6500, 25, () => {
        assert.isFalse(getCpuPolicy().allowRemotes, "25 avg against a 20 limit is over budget");
      });
    });

    it("treats a pinned bucket as proof of headroom regardless of average", () => {
      withCpu(20, 10000, 19.5, () => {
        assert.isTrue(getCpuPolicy().allowRemotes);
      });
    });

    it("treats a zero average (fresh global, no samples yet) as unknown-but-allowed", () => {
      withCpu(20, 8000, 0, () => {
        assert.isTrue(getCpuPolicy().allowRemotes);
      });
    });
  });

  describe("maxRemotes", () => {
    it("is 0 whenever remotes are not allowed", () => {
      withCpu(20, 1500, 5, () => {
        assert.strictEqual(getCpuPolicy().maxRemotes, 0);
      });
    });

    it("steps up with the bucket on a shard3-shaped limit", () => {
      const at = (bucket: number): number => {
        let n = 0;
        withCpu(20, bucket, 10, () => {
          n = getCpuPolicy().maxRemotes;
        });
        return n;
      };
      assert.strictEqual(at(5500), 1);
      assert.strictEqual(at(6500), 2);
      assert.strictEqual(at(9000), 3);
      // never goes down as the bucket goes up
      assert.isAtLeast(at(9000), at(6500));
      assert.isAtLeast(at(6500), at(5500));
    });
  });

  describe("economyOnly", () => {
    it("trips only when the bucket is critically low", () => {
      withCpu(20, 1999, 10, () => assert.isTrue(getCpuPolicy().economyOnly));
      withCpu(20, 2001, 10, () => assert.isFalse(getCpuPolicy().economyOnly));
    });
  });

  describe("billedTickCpu", () => {
    it("is the shard bill (endUsed), not the loop-start delta", () => {
      // LIVE: parse ≈ 2, logic ≈ 18.2, billed ≈ 20.2. Subtracting startUsed
      // reports 18.2, allowExpensive thinks there is headroom, bucket falls.
      assert.strictEqual(billedTickCpu(20.1, 4.0), 20.1);
      assert.notStrictEqual(billedTickCpu(20.1, 4.0), 20.1 - 4.0);
    });

    it("does not go negative or NaN on junk", () => {
      assert.strictEqual(billedTickCpu(NaN, 0), 0);
      assert.strictEqual(billedTickCpu(-1, 0), 0);
    });
  });

  describe("skipOptionalCreep", () => {
    it("never skips miners, carries, fillers or upgraders", () => {
      for (const role of ["EnergyMiner", "carry", "filler", "FakeFiller", "upgrader", "ControllerLinkFiller", "EnergyManager"]) {
        assert.isFalse(creepRoleIsOptional(role), role + " is income/defence");
        assert.isFalse(
          skipOptionalCreep({ role, usedCpu: 50, limit: 20, bucket: 0, danger: false }),
          role + " must still run on a dead bucket",
        );
      }
    });

    it("skips repair/maintainer/sweeper when the bucket is in economyOnly", () => {
      // LIVE latch: bucket 1012, limit 20, those three roles were leftover
      // bodies spawn crisis could not retire until TTL.
      assert.isTrue(creepRoleIsOptional("repair"));
      assert.isTrue(skipOptionalCreep({ role: "repair", usedCpu: 5, limit: 20, bucket: 1012, danger: false }));
      assert.isTrue(skipOptionalCreep({ role: "maintainer", usedCpu: 5, limit: 20, bucket: 1012, danger: false }));
      assert.isTrue(skipOptionalCreep({ role: "sweeper", usedCpu: 5, limit: 20, bucket: 1012, danger: false }));
    });

    it("skips optional roles when this tick is already over 90% of the limit", () => {
      assert.isTrue(skipOptionalCreep({ role: "repair", usedCpu: 18.5, limit: 20, bucket: 8000, danger: false }));
      assert.isFalse(skipOptionalCreep({ role: "repair", usedCpu: 10, limit: 20, bucket: 8000, danger: false }));
    });

    it("never skips builders — a site left unbuilt is the energy network", () => {
      assert.isFalse(creepRoleIsOptional("builder"));
      assert.isFalse(skipOptionalCreep({ role: "builder", usedCpu: 18.5, limit: 20, bucket: 8000, danger: false }));
      assert.isFalse(skipOptionalCreep({ role: "builder", usedCpu: 50, limit: 20, bucket: 0, danger: false }));
    });

    it("never skips in a room under attack", () => {
      assert.isFalse(skipOptionalCreep({ role: "repair", usedCpu: 50, limit: 20, bucket: 0, danger: true }));
    });

    it("fails open on unknown or missing roles", () => {
      assert.isFalse(skipOptionalCreep({ role: undefined, usedCpu: 50, limit: 20, bucket: 0, danger: false }));
      assert.isFalse(skipOptionalCreep({ role: "BrandNewRole", usedCpu: 50, limit: 20, bucket: 0, danger: false }));
    });

    it("does not skip remote/war roles that work in rooms with no danger flag", () => {
      for (const role of ["scout", "RemoteRepair", "Priest", "Escort", "SneakyControllerUpgrader", "goblin", "Convoy"]) {
        assert.isFalse(creepRoleIsOptional(role), role + " must run where danger is never set");
        assert.isFalse(
          skipOptionalCreep({ role, usedCpu: 50, limit: 20, bucket: 0, danger: false }),
          role + " must still flee / work on a dead bucket",
        );
      }
    });
  });

  describe("RunAllCreepsManager two-pass", () => {
    it("runs essential creeps before optional ones so miners cannot starve", () => {
      const fs = require("fs");
      const path = require("path");
      const src = fs.readFileSync(path.join(__dirname, "../../src/Managers/RunAllCreepsManager.ts"), "utf8");
      assert.match(src, /skipOptionalCreep/);
      assert.match(src, /essentialNames/);
      assert.match(src, /optionalNames/);
      const ess = src.indexOf("for (const name of essentialNames)");
      const opt = src.indexOf("for (const name of optionalNames)");
      assert.isAbove(ess, -1, "essential pass missing");
      assert.isAbove(opt, ess, "optional pass must be after essential pass");
      const memlessSweep = src.indexOf("Sweep Game.creeps for names the loop missed");
      assert.isAbove(memlessSweep, -1, "memoryless sweep comment missing");
      const memless = src.indexOf("essentialNames.push(name)", memlessSweep);
      assert.isAbove(memless, memlessSweep, "memoryless creeps must queue as essential, not run inline");
      assert.notMatch(src, /if\(name in Memory\.creeps\) continue;\s*if\(skipHighRclCreep\(Game\.creeps\[name\]\)\) continue;\s*RunCreepManager\(name\);/s);
    });
  });

  describe("main.ts wiring", () => {
    it("feeds CPUmanager billed CPU, not the loop-start delta", () => {
      const fs = require("fs");
      const path = require("path");
      const main = fs.readFileSync(path.join(__dirname, "../../src/main.ts"), "utf8");
      assert.match(main, /billedTickCpu\(endUsed,\s*startTotal\)/);
      assert.match(main, /CPUmanager\(tickTotal\)/);
      assert.notMatch(main, /let tickTotal = tickCpu\.toFixed\(2\)/);
    });
  });
});


