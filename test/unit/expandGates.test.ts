/**
 * Expansion gates. The owner rule is: expandMinRcl=0 means OFF; autoExpand
 * unset means ON; CPU headroom is the real lock. A vibe-coded `= 7` locked
 * shard3 with GCL 12 and 8 free claims.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { getFeatures } from "../../src/utils/Features";
import {
  takenByAnyone,
  expandSkipHolds,
  markExpandSkip,
  expandSkipBlocks,
} from "../../src/Managers/AutoExpand";

const EXPAND = fs.readFileSync(path.join(__dirname, "../../src/Managers/AutoExpand.ts"), "utf8");
const FEATURES = fs.readFileSync(path.join(__dirname, "../../src/utils/Features.ts"), "utf8");

describe("Features.expandMinRcl", () => {
  it("defaults to 0 — no RCL claim gate", () => {
    assert.match(FEATURES, /expandMinRcl:\s*0/);
    const g: any = global;
    const prev = g.Memory;
    g.Memory = {};
    try {
      assert.strictEqual(getFeatures().expandMinRcl, 0);
    } finally {
      g.Memory = prev;
    }
  });

  it("treats a missing flag as 0, not as 7", () => {
    const g: any = global;
    const prev = g.Memory;
    g.Memory = { features: {} };
    try {
      assert.strictEqual(getFeatures().expandMinRcl, 0);
    } finally {
      g.Memory = prev;
    }
  });
});

describe("AutoExpand.blockedReason", () => {
  it("still has a soft MIN_RCL of 3, not 7", () => {
    assert.match(EXPAND, /const MIN_RCL = 3/);
    assert.notMatch(EXPAND, /const MIN_RCL = 7/);
  });

  it("only applies expandMinRcl when it is > 0", () => {
    assert.match(EXPAND, /if \(minRcl > 0 && owned\.length >= 3/);
  });

  it("uses CPU headroom as the binding constraint", () => {
    assert.match(EXPAND, /const CPU_HEADROOM = 3/);
    assert.include(EXPAND, "avg + CPU_HEADROOM > limit");
  });

  it("holds the queue while a claimed room is still spawnless", () => {
    assert.include(EXPAND, "spawnless owned room — bootstrap before next claim");
  });

  it("does not treat leftover-foreign spawn bricks as a spawnless hold", () => {
    const fn = EXPAND.slice(
      EXPAND.indexOf("function spawnlessOwned"),
      EXPAND.indexOf("function spawnlessOwned") + 450,
    );
    assert.include(fn, "hasVisibleForeignSpawn");
    assert.include(fn, "FIND_MY_SPAWNS");
  });

  it("pick() skips Memory.AvoidRooms", () => {
    assert.include(EXPAND, "isAvoidRoom(t.room)");
    assert.include(EXPAND, "skip ${t.room} — AvoidRooms");
  });

  it("aborts claiming into an AvoidRooms target", () => {
    assert.include(EXPAND, 'finish(st, "ABORT — AvoidRooms")');
  });

  it("treats unset features.autoExpand as ON", () => {
    assert.include(EXPAND, "m.features.autoExpand === false");
    assert.notMatch(EXPAND, /if\s*\(\s*!m\.features\.autoExpand\s*\)/);
  });

  it("still advances in-flight expand when the feature is off", () => {
    const run = EXPAND.slice(
      EXPAND.indexOf("export function runAutoExpand"),
      EXPAND.indexOf("(global as any).autoExpand = function"),
    );
    assert.include(run, "advance(st)");
    assert.match(run, /if \(!st\) \{[\s\S]*?if \(featureOff\) return;/);
    assert.include(run, 'finish(st, "ABORT — autoExpand off")');
    assert.notMatch(
      run,
      /autoExpand === false\) return;\s*\n\s*const st =/,
      "must not return on feature-off before reading in-flight state",
    );
  });
});

describe("AutoExpand claiming re-checks taken rooms", () => {
  const g: any = global;

  function withGame(opts: { rooms?: any; memory?: any; time?: number }, fn: () => void): void {
    const prevGame = g.Game;
    const prevMemory = g.Memory;
    g.Game = { time: opts.time === undefined ? 1 : opts.time, rooms: opts.rooms || {}, cpu: { limit: 20, bucket: 7000 } };
    if (opts.memory !== undefined) g.Memory = opts.memory;
    try {
      fn();
    } finally {
      g.Game = prevGame;
      if (opts.memory !== undefined) g.Memory = prevMemory;
    }
  }

  it("takenByAnyone is true only for a visible owned controller", () => {
    withGame({
      rooms: {
        E1N1: { controller: { owner: { username: "bob" }, my: false } },
        E1N2: { controller: { my: true, owner: { username: "me" } } },
        E1N3: { controller: { my: false } },
      },
    }, () => {
      assert.isTrue(takenByAnyone("E1N1"));
      assert.isTrue(takenByAnyone("E1N2"));
      assert.isFalse(takenByAnyone("E1N3"));
      assert.isFalse(takenByAnyone("E9N9"), "no vision trusts the pack");
    });
  });

  it("expandSkipHolds keeps a stamp without vision and forgets a free visible room", () => {
    assert.isTrue(expandSkipHolds(true, false, false, false, false));
    assert.isFalse(expandSkipHolds(true, true, false, false, false));
    assert.isTrue(expandSkipHolds(true, true, false, true, false));
    assert.isTrue(expandSkipHolds(true, true, false, false, true));
    assert.isFalse(expandSkipHolds(true, true, true, true, false));
    assert.isFalse(expandSkipHolds(false, false, false, false, false));
  });

  it("markExpandSkip persists so pick() skips a stale pack name with no vision", () => {
    const memory: any = {};
    withGame({ rooms: {}, memory, time: 100 }, () => {
      markExpandSkip("E5N5");
      assert.isTrue(expandSkipBlocks("E5N5"));
      assert.strictEqual(memory.expandSkip.E5N5, 100);
    });
  });

  it("expandSkipBlocks forgets a visible unowned room", () => {
    const memory: any = { expandSkip: { E5N5: 1 } };
    withGame({
      rooms: { E5N5: { controller: { my: false }, find: () => [] } },
      memory,
    }, () => {
      assert.isFalse(expandSkipBlocks("E5N5"));
      assert.isUndefined(memory.expandSkip.E5N5);
    });
  });

  it("claiming aborts on takenByAnyone and remembers the room", () => {
    const claiming = EXPAND.slice(
      EXPAND.indexOf('case "claiming":'),
      EXPAND.indexOf('case "claimed":'),
    );
    assert.include(claiming, "takenByAnyone(st.room)");
    assert.include(claiming, "markExpandSkip(st.room)");
    assert.include(claiming, 'ABORT — taken by someone else');
    const takenAt = claiming.indexOf("takenByAnyone(st.room)");
    const armAt = claiming.lastIndexOf("armColonise(st)");
    assert.isAbove(takenAt, 0);
    assert.isAbove(armAt, takenAt, "must abort before armColonise");
  });

  it("pick() skips expandSkipBlocks so a stale pack name is not re-selected", () => {
    const pick = EXPAND.slice(
      EXPAND.indexOf("function pick"),
      EXPAND.indexOf("function payloadSpawnPos"),
    );
    assert.include(pick, "expandSkipBlocks(t.room)");
  });
});

describe("pack adoption always uses the new plan", () => {
  it("does not refuse a pack because the live spawn is far", () => {
    const fn = EXPAND.slice(
      EXPAND.indexOf("function refuseAdopt"),
      EXPAND.indexOf("function adoptPacked"),
    );
    assert.notInclude(fn, "fewer than 2 sources");
    assert.notInclude(fn, "live spawn");
    assert.notInclude(fn, "!= pack spawn");
    assert.include(fn, "empty pack");
  });

  it("adoptPacked arms ALIGN+HUB instead of placement-only", () => {
    const fn = EXPAND.slice(
      EXPAND.indexOf("function adoptPacked"),
      EXPAND.indexOf("function adoptPlanForNewRoom"),
    );
    assert.include(fn, "armNewPlanMigration(room, from)");
    assert.notInclude(fn, "stay placement-only");
  });

  it("self-heals an armless planned room at any RCL", () => {
    const fn = EXPAND.slice(
      EXPAND.indexOf("export function runPackAdoption"),
      EXPAND.indexOf("function advance"),
    );
    assert.include(fn, 'armNewPlanMigration(room, "pack-self-heal")');
    assert.notInclude(fn, "armless && young");
  });
});

describe("skipHighRcl cannot black out a 20-CPU bot", () => {
  const SPEEDRUN = fs.readFileSync(
    path.join(__dirname, "../../src/utils/Speedrun.ts"), "utf8");
  it("is a no-op when cpu.limit <= 30", () => {
    assert.include(SPEEDRUN, "(Game.cpu.limit || 20) <= 30");
    assert.include(SPEEDRUN, "skipHighRcl refused");
  });
});

describe("claimer keeps vision after a successful claim", () => {
  const CLAIMER = fs.readFileSync(
    path.join(__dirname, "../../src/Roles/claimer.ts"), "utf8");

  it("does not suicide on claimController === OK", () => {
    const claimBlock = CLAIMER.slice(
      CLAIMER.indexOf("claimController(controller) == 0"),
      CLAIMER.indexOf("claimController(controller) == 0") + 500,
    );
    assert.notInclude(claimBlock, "creep.suicide()");
    assert.include(claimBlock, "createConstructionSite");
  });
});
