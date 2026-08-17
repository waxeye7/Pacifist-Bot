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

    it("does NOT wait for a spawn rescue — the owner overrode that deliberately", () => {
      // This assertion was the reverse until the owner, having seen the cost,
      // said twice to migrate regardless of spawn state. Recorded as an explicit
      // decision so a future reader does not "restore" the hold as a bugfix.
      //
      // What still protects the rescue is keepCritical (spawns/storage/terminal
      // survive an align pass) and the fact that construction sites are not
      // structures, so an in-flight spawn SITE cannot be destroyed here.
      assert.notMatch(
        SRC,
        /if \(spawnEmergencyActive\(\)\) \{[\s\S]{0,200}?return;/,
        "align must not bail on a spawn rescue — see the ALIGN comment in runMigration",
      );
    });
  });

  describe("migrateStatus census covers every structure type", () => {
    it("does not limit the off-plan census to MIGRATE_CLASSES", () => {
      // The four-class loop is what hid 28 off-plan ramparts, 3 labs and 2 links
      // behind a line reading "extension:17 container:2 road:9".
      assert.include(SRC, "offOther", "census must sweep types outside MIGRATE_CLASSES");
      assert.match(SRC, /for \(const s of room\.find\(FIND_STRUCTURES\) as any\[\]\)/);
    });

    it("compares against the plan's full tile set, as migrateInsta does", () => {
      // If the census and the demolisher disagree the status lies again, just
      // about a different set of structures.
      assert.match(SRC, /wantedTile\[packed\]\[type\]/);
      assert.match(SRC, /t === "shellCut" \? STRUCTURE_RAMPART : t/);
    });

    it("marks types gradual migration cannot touch as align-only", () => {
      assert.include(SRC, "(align-only)");
    });

    it("skips the controller and respects migrateInsta's ownership rule", () => {
      assert.match(SRC, /if \(!s\.my && type !== STRUCTURE_ROAD && type !== STRUCTURE_CONTAINER\) continue/);
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

/**
 * A floor expressed in absolute energy is unsatisfiable by any room whose
 * CAPACITY sits below it — energyAvailable can never exceed
 * energyCapacityAvailable, so such a test does not mean "wait until richer", it
 * means "never". That is not hypothetical: a forced migration destroyed every
 * storage (bank 0 empire-wide) and alignment then retired the off-plan
 * extensions, dropping E37N58 to 500 capacity and E39N58 to 350 against a flat
 * 800 gate. Both sat with a full spawn, an empty queue and an idle spawner while
 * three rooms waited on a rebuild only they could supply.
 */
describe("spawn rescue: no unsatisfiable energy floors", () => {
    const SPAWNING = fs.readFileSync(
        path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");

    it("gates the rescue mother on a share of capacity, not a flat number", () => {
        assert.notInclude(
            SPAWNING, "room.energyAvailable < 800",
            "a flat 800 floor is unreachable for a room whose capacity is below it");
        assert.include(SPAWNING, "rescueMotherFloor(room)");
    });

    it("keeps that floor at or below what the room can physically hold", () => {
        assert.match(
            SPAWNING,
            /Math\.min\(800, Math\.floor\(room\.energyCapacityAvailable \* 0\.8\)\)/,
            "the floor must be clamped to the room's own capacity");
    });
});
