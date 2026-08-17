/**
 * These pin the rules that were missing when a forced migration destroyed three
 * spawns and three storages on live shard3 in one pass.
 *
 * Asserted against the source rather than by running the migration: the code
 * paths need a live Room with structures, a plan and an engine to destroy
 * things in, and a fake game detailed enough to exercise them would be a
 * simulator whose bugs are indistinguishable from the bot's. What actually
 * failed here was structural — one flag meaning two things, and a guard that
 * only counted spawns empire-wide — so structure is the right thing to pin.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(path.join(__dirname, "../../src/utils/PlanV2.ts"), "utf8");

describe("PlanV2 migration safety", () => {
  describe("align vs hub are separate opt-ins", () => {
    it("keeps a list of structures an align pass may never retire", () => {
      assert.include(SRC, "ALIGN_NEVER_RETIRE");
      // the three a room cannot function without and cannot cheaply replace
      const block = SRC.slice(SRC.indexOf("ALIGN_NEVER_RETIRE"), SRC.indexOf("ALIGN_NEVER_RETIRE") + 300);
      for (const t of ["STRUCTURE_SPAWN", "STRUCTURE_STORAGE", "STRUCTURE_TERMINAL"]) {
        assert.include(block, t, `${t} must be protected from an align pass`);
      }
    });

    it("only runs the hub/spawn retirement when arm.hub is set", () => {
      // `force` alone must NOT reach migrateSpawns/migrateHub — that conflation
      // is the whole bug: an owner asking to clear off-plan furniture got their
      // spawns retired as well, with no way to ask for one without the other.
      assert.match(SRC, /const wantHub = !!arm\.hub/, "runMigration must read a separate hub flag");
      assert.match(
        SRC,
        /if \(wantHub\) \{\s*\n\s*migrateSpawns\([\s\S]{0,120}?migrateHub\(/,
        "migrateSpawns/migrateHub must sit inside the wantHub branch",
      );
    });

    it("passes keepCritical to migrateInsta whenever hub was not requested", () => {
      assert.match(SRC, /migrateInsta\(room, plan, structures, !wantHub\)/);
    });

    it("only treats the literal string 'hub' as opting into hub retirement", () => {
      // A boolean `true` must not reach it — that is the value an operator
      // reaches for when they mean "yes, clear the off-plan stuff".
      assert.match(SRC, /typeof force === "string" && force\.toLowerCase\(\) === "hub"/);
    });
  });

  describe("spawn protection", () => {
    it("refuses to retire a room's own last spawn, not merely the empire's", () => {
      // The old guard was `empireSpawns <= 1`, which let four spawns become one
      // because each room's pass saw others still standing.
      assert.match(
        SRC,
        /room\.find\(FIND_MY_SPAWNS\)\.length <= 1\) continue/,
        "migrateInsta must protect the room's own last spawn",
      );
    });

    it("holds every forced migration while the empire is rebuilding a spawn", () => {
      assert.include(SRC, "spawnEmergencyActive");
      assert.match(
        SRC,
        /if \(spawnEmergencyActive\(\)\) \{[\s\S]{0,400}?return;/,
        "a forced pass must bail while a spawn rescue is running",
      );
    });

    it("detects the emergency from standing state, not just the Memory flags", () => {
      // The flags are owned by rooms.spawning and can lag a tick; a room of ours
      // with no spawn IS the emergency regardless.
      assert.match(SRC, /find\(FIND_MY_SPAWNS\)\.length === 0\) return true/);
    });
  });

  describe("the gradual gate that made migration look broken", () => {
    it("still requires a real bank before unforced demolition", () => {
      // Not a bug — but it is why an unforced migratePlan on a room that never
      // reaches 20k storage appears to do nothing at all. Documented so the next
      // person reads it here instead of reaching for force.
      assert.include(SRC, "const MIGRATE_ENERGY = 20000");
      assert.match(SRC, /const rich = force \|\| migrationEnergy\(room\) > MIGRATE_ENERGY/);
    });
  });
});
