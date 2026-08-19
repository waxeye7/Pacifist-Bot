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
import {
  countedShellRoad,
  brokeBankStripFires,
  towerOccupiesPlannedHub,
  hubTypeReclaimsTower,
  lastTowerInstaMayDestroy,
  lastTowerReclaimMayDestroy,
  instaDestroyedThisPass,
  isSourceIncomeStructure,
} from "../../src/utils/PlanV2";

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
    it("serializes last-spawn hub retires so four rooms cannot collapse to one", () => {
      assert.include(SRC, "_hubSpawnRetireTick");
      assert.include(SRC, "otherSpawnless");
    });

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

  describe("broke-align does not keep sweeping a bankless room", () => {
    it("HOLDS an align pass when the hub is gone — and never tombstones it", () => {
      // After force-hub retired the storages, every later align tick deleted
      // source containers (the only income). The first fix DISARMED — a
      // tombstone nothing re-arms, i.e. a gate the room can never escape
      // (docs/STARVATION-TRAPS.md): W3N3 and W1N2 sat armed-off after losing
      // their storages. The guard now holds the pass and keeps the arm; the
      // moment a storage stands again, alignment resumes by itself.
      assert.include(SRC, "broke-align");
      assert.match(
        SRC,
        /if \(!wantHub && !room\.storage && room\.find\(FIND_MY_SPAWNS\)\.length > 0\)/,
      );
      assert.notInclude(SRC, 'by: "broke-align"',
        "the broke guard must hold, not write a disarmed tombstone");
    });

    it("never insta-deletes source-adjacent containers", () => {
      // Empty storage used to make the skip miss; ALIGN then deleted income.
      assert.notMatch(SRC, /STRUCTURE_CONTAINER && !room\.storage/);
      assert.match(SRC, /if \(s\.structureType === STRUCTURE_CONTAINER\) \{/);
      assert.include(SRC, "findInRange(FIND_SOURCES, 1)");
    });

    it("does not insta-delete exterior roads", () => {
      assert.include(SRC, "isExteriorTile(room, s.pos.x, s.pos.y)");
    });

    it("refuses all roads when interior is unusable — isExteriorTile fail-opens to false", () => {
      // getCache miss => isExteriorTile returns false, so "skip if exterior"
      // alone would DELETE remotes. Gradual already requires interiorReady.
      assert.match(
        SRC,
        /STRUCTURE_ROAD &&\s*\n\s*\(!interiorReady\(room\) \|\| isExteriorTile\(room, s\.pos\.x, s\.pos\.y\)\)/,
      );
    });

    it("does not insta-delete the room's last tower", () => {
      assert.include(SRC, "STRUCTURE_TOWER &&");
      assert.include(SRC, "lastTowerInstaMayDestroy(");
    });

    it("gradual last-tower N-1 counts only owned towers", () => {
      // Hostile leftovers used to increment rankOffPlan.built and sit in
      // `off`. At cap with 1 owned + 1 hostile, farther-first destroy()d
      // the only owned tower (hostile destroy fails).
      const fn = SRC.slice(SRC.indexOf("function rankOffPlan"), SRC.indexOf("function migrateClass"));
      assert.match(
        fn,
        /!\(s as any\)\.my && type !== STRUCTURE_ROAD && type !== STRUCTURE_CONTAINER/,
      );
    });

    it("reclaimTile does not destroy a source-adjacent container", () => {
      // migrateInsta skips those boxes; the same placeFromPlanV2 pass
      // used to reclaimTile() one that squatted a planned link.
      const fn = SRC.slice(SRC.indexOf("function reclaimTile"), SRC.indexOf("const MIGRATE_ENERGY"));
      assert.include(fn, "isSourceIncomeStructure(squatter)");
    });

    it("gradual migrateClass does not retire source-adjacent containers", () => {
      // rankOffPlan is farthest-from-hub, so off-plan source boxes used
      // to be first out under FREE_REPLACE and poor rank<=1.
      const rank = SRC.slice(SRC.indexOf("function rankOffPlan"), SRC.indexOf("function migrateClass"));
      assert.include(rank, "isSourceIncomeStructure(s)");
      const cls = SRC.slice(SRC.indexOf("function migrateClass"), SRC.indexOf("function migrateSpawns"));
      assert.match(cls, /STRUCTURE_CONTAINER \|\| type === STRUCTURE_LINK/);
      assert.include(cls, "isSourceIncomeStructure(c.s)");
    });

    it("never insta-deletes a source-adjacent link", () => {
      // RCL5+ income is the source link (energyMiner range 2). Align used
      // to delete an off-plan source link while the guard was container-only.
      assert.include(SRC, "function isSourceIncomeStructure");
      assert.include(SRC, "findInRange(FIND_SOURCES, 2)");
      const insta = SRC.slice(SRC.indexOf("function migrateInsta"), SRC.indexOf("function runMigration"));
      assert.include(insta, "isSourceIncomeStructure(s)");
      assert.notMatch(insta, /if \(s\.structureType === STRUCTURE_CONTAINER\) \{/);
    });

    it("hostile leftover source links are not income and can be cleared", () => {
      function src(type: string, mine: boolean, near: boolean): any {
        return {
          structureType: type,
          my: mine,
          pos: { findInRange: () => (near ? [{}] : []) },
        };
      }
      assert.isFalse(isSourceIncomeStructure(src(STRUCTURE_LINK, false, true)), "hostile leftover");
      assert.isTrue(isSourceIncomeStructure(src(STRUCTURE_LINK, true, true)));
      assert.isFalse(isSourceIncomeStructure(src(STRUCTURE_LINK, true, false)));
      assert.isTrue(isSourceIncomeStructure(src(STRUCTURE_CONTAINER, false, true)), "unowned box is usable");
      assert.isFalse(isSourceIncomeStructure(src(STRUCTURE_CONTAINER, false, false)));
      const income = SRC.slice(
        SRC.indexOf("export function isSourceIncomeStructure"),
        SRC.indexOf("function coreBuildoutIncomplete"),
      );
      assert.include(income, "!(s as any).my");
      const insta = SRC.slice(SRC.indexOf("function migrateInsta"), SRC.indexOf("function runMigration"));
      assert.match(
        insta,
        /STRUCTURE_CONTAINER &&\s*\n\s*s\.structureType !== STRUCTURE_LINK/,
      );
      const reclaim = SRC.slice(SRC.indexOf("function reclaimTile"), SRC.indexOf("const MIGRATE_ENERGY"));
      assert.include(reclaim, "STRUCTURE_LINK && !(squatter as any).my");
    });

    it("coreBuildoutIncomplete treats missing source income as incomplete at RCL5+", () => {
      const fn = SRC.slice(
        SRC.indexOf("function coreBuildoutIncomplete"),
        SRC.indexOf("function maxSitesFor"),
      );
      assert.include(fn, "lvl >= 5");
      assert.include(fn, "isSourceIncomeStructure(s)");
    });

    it("broke-bank site strip keeps link and container sites", () => {
      assert.match(
        SRC,
        /if \(brokeBank && brokeBankStripFires\(budget, nakedShell, coreIncomplete\)\) \{[\s\S]{0,350}?STRUCTURE_LINK \|\| s\.structureType === STRUCTURE_CONTAINER/,
      );
    });

    it("does not strip a storage site from a broke room", () => {
      assert.match(
        SRC,
        /if \(brokeBank && brokeBankStripFires\(budget, nakedShell, coreIncomplete\)\) \{[\s\S]{0,250}?STRUCTURE_STORAGE/,
      );
    });

    it("does not strip naked-shell road/rampart sites on a standing storage", () => {
      // brokeBank already requires my storage. bankE<1000 cannot free a
      // storage slot; it only reset the 2-slot wall rebuild.
      assert.notInclude(SRC, "brokeBank && bankE < 1000");
      const strip = SRC.slice(
        SRC.indexOf("if (brokeBank && brokeBankStripFires(budget, nakedShell, coreIncomplete))"),
        SRC.indexOf("existing structures + sites by type"),
      );
      assert.include(strip, "STRUCTURE_RAMPART || s.structureType === STRUCTURE_ROAD");
    });

    it("incomplete-core strip fires at budget===0 so leftover labs free the 2 slots", () => {
      // 2 leftover lab/nuker/RCL6+ rampart sites → maxSitesFor=2, budget=0.
      // budget<0 never stripped; missing extensions/towers never sited.
      assert.isFalse(brokeBankStripFires(0, false, false), "complete core at allowance");
      assert.isTrue(brokeBankStripFires(0, false, true), "incomplete core at allowance");
      assert.isTrue(brokeBankStripFires(-1, false, false), "over budget still strips");
      assert.isFalse(brokeBankStripFires(1, false, false), "headroom, complete core");
      assert.isTrue(brokeBankStripFires(0, true, false), "naked shell still strips");
      const strip = SRC.slice(
        SRC.indexOf("let budget = maxSitesFor"),
        SRC.indexOf("existing structures + sites by type"),
      );
      assert.include(strip, "coreBuildoutIncomplete");
      assert.include(strip, "brokeBankStripFires(budget, nakedShell, coreIncomplete)");
    });

    it("reclaim does not take the last tower after insta acted this pass", () => {
      // migrateInsta tears surplus (myTowers>1), refuses the hub-sitter
      // (n>0), then placeFromPlanV2 reclaimTile used to destroy() that
      // last tower — insta does not stamp planMigrate[tower].
      assert.isFalse(lastTowerReclaimMayDestroy(1, true, 1));
      assert.isFalse(lastTowerReclaimMayDestroy(2, true, 3), "stale 2-count after surplus");
      assert.isTrue(lastTowerReclaimMayDestroy(1, true, 0), "solo hub-swap when insta idle");
      assert.isTrue(lastTowerReclaimMayDestroy(2, true, 0));
      assert.isFalse(lastTowerReclaimMayDestroy(1, false, 0));
      const g: any = global;
      const prev = g.Game;
      g.Game = Object.assign({}, prev || {}, { time: 100 });
      try {
        assert.strictEqual(instaDestroyedThisPass({ memory: { _instaPass: 100, _instaN: 2 } }), 2);
        assert.strictEqual(instaDestroyedThisPass({ memory: { _instaPass: 99, _instaN: 2 } }), 0);
        assert.strictEqual(instaDestroyedThisPass({ memory: {} }), 0);
      } finally {
        g.Game = prev;
      }
      const reclaim = SRC.slice(SRC.indexOf("function reclaimTile"), SRC.indexOf("const MIGRATE_ENERGY"));
      assert.include(reclaim, "lastTowerReclaimMayDestroy(");
      assert.include(reclaim, "instaDestroyedThisPass(room)");
      const insta = SRC.slice(SRC.indexOf("function migrateInsta"), SRC.indexOf("function runMigration"));
      assert.include(insta, "mem._instaPass = Game.time");
      assert.include(insta, "mem._instaN = n");
    });

    it("insta does not take surplus then the last hub-sitter in one pass", () => {
      // FIND_STRUCTURES order is unspecified. 2+ off-plan with the hub
      // tower last used to decrement myTowers to 1 then hub-swap to 0.
      function remaining(order: boolean[]): number {
        let myTowers = order.length;
        let n = 0;
        for (let i = 0; i < order.length; i++) {
          if (lastTowerInstaMayDestroy(myTowers, order[i], n)) {
            myTowers--;
            n++;
          }
        }
        return myTowers;
      }
      assert.strictEqual(remaining([false, true]), 1, "surplus then hub");
      assert.strictEqual(remaining([true, false]), 1, "hub then surplus");
      assert.strictEqual(remaining([false, false, true]), 1);
      assert.strictEqual(remaining([true]), 0, "solo hub-swap still allowed");
      assert.strictEqual(remaining([false]), 1, "solo off-hub kept");
      assert.isFalse(lastTowerInstaMayDestroy(1, true, 1));
      assert.isTrue(lastTowerInstaMayDestroy(1, true, 0));
      assert.isTrue(lastTowerInstaMayDestroy(2, true, 0));
      const insta = SRC.slice(SRC.indexOf("function migrateInsta"), SRC.indexOf("function runMigration"));
      assert.include(insta, "lastTowerInstaMayDestroy(");
    });

    it("last tower on planned storage/spawn is a swap, not a floor", () => {
      const storage = 10 + 20 * 50;
      const spawn = 5;
      const plan = { t: { storage: [storage], spawn: [spawn], tower: [7] } };
      assert.isTrue(towerOccupiesPlannedHub(storage, plan));
      assert.isTrue(towerOccupiesPlannedHub(spawn, plan));
      assert.isFalse(towerOccupiesPlannedHub(7, plan), "planned tower tile is not the hub");
      assert.isTrue(hubTypeReclaimsTower(STRUCTURE_STORAGE));
      assert.isTrue(hubTypeReclaimsTower(STRUCTURE_SPAWN));
      assert.isFalse(hubTypeReclaimsTower(STRUCTURE_TOWER));
      const reclaim = SRC.slice(SRC.indexOf("function reclaimTile"), SRC.indexOf("const MIGRATE_ENERGY"));
      assert.include(reclaim, "hubTypeReclaimsTower(type)");
      assert.include(reclaim, "STRUCTURE_TOWER");
      const insta = SRC.slice(SRC.indexOf("function migrateInsta"), SRC.indexOf("function runMigration"));
      assert.include(insta, "towerOccupiesPlannedHub(packed, plan)");
      const cls = SRC.slice(SRC.indexOf("function migrateClass"), SRC.indexOf("function migrateSpawns"));
      assert.include(cls, "last-tower swap — occupies planned hub");
      assert.include(cls, "if (!wanted && !isRoad && !hubSwap)");
    });

    it("counts only interior roads toward a standing shell", () => {
      const fn = SRC.slice(SRC.indexOf("function isShellNaked"), SRC.indexOf("function coreBuildoutIncomplete"));
      assert.include(fn, "countedShellRoad(");
      assert.include(fn, "interiorReady(room)");
      assert.include(fn, "isExteriorTile(room, s.pos.x, s.pos.y)");
      assert.include(SRC, "function countedShellRoad");
      assert.isFalse(countedShellRoad(true, true), "leftover remote/approach road");
      assert.isFalse(countedShellRoad(false, false), "interior classifier not ready");
      assert.isTrue(countedShellRoad(true, false), "confirmed interior road");
    });

    it("never freezes plan placement on a spawn-mismatch", () => {
      // Owner: the pack wins. A far live spawn is a hub-migrate job, not a
      // reason to stop siting storage / ext / the plan spawn.
      assert.notInclude(SRC, "placement frozen");
      assert.include(SRC, "pack wins");
    });

    it("adopt arms ALIGN always, HUB only on a young colony", () => {
      // hub:true on an ESTABLISHED room bypasses ALIGN_NEVER_RETIRE
      // (keepCritical = !wantHub) — that is how VPS W3N3 lost its storage +
      // 27 extensions minutes after its plan was pushed (2026-08-19), and the
      // shape of the 2026-08-17 live incident. Hub demolition on a built room
      // is operator-only: migratePlan(room, "hub").
      assert.include(SRC, "export function armNewPlanMigration");
      assert.match(SRC, /hub:\s*young/);
      assert.notMatch(
        SRC,
        /armNewPlanMigration[\s\S]{0,400}?hub:\s*true/,
        "the adopt auto-arm must never hard-code hub: true");
      assert.include(SRC, 'armNewPlanMigration(room, "adopt")');
    });
  });
});

describe("construction never drops the pack", () => {
  const CON = fs.readFileSync(
    path.join(__dirname, "../../src/Rooms/rooms.construction.ts"),
    "utf8",
  );
  it("does not strip planV2 because the live spawn is far", () => {
    assert.notInclude(CON, "stripping planV2");
    assert.include(CON, "if (room.memory.planV2)");
    assert.include(CON, "placeFromPlanV2(room)");
    const fork = CON.slice(
      CON.indexOf("if (room.memory.planV2)"),
      CON.indexOf("if (room.memory.planV2)") + 280,
    );
    assert.notInclude(fork, "delete room.memory.planV2");
    assert.notInclude(fork, "planPackSkip");
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
        path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8")
        // rescueMotherFloor + mother selection moved to Empire/rescueLib.ts (docs/EMPIRE-LAYER.md)
        + fs.readFileSync(path.join(__dirname, "../../src/Empire/rescueLib.ts"), "utf8");

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
