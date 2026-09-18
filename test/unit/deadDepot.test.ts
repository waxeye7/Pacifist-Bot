/**
 * THE DEAD BOXES (owner report, live shard3).
 *
 * The planner emits containers as [source, source, controller-depot, mineral].
 * Two of those four are corpses that creep upkeep defends forever:
 *
 *  1. THE CONTROLLER DEPOT — exists so pre-link upgraders have a box. Once a
 *     real controller link stands, nothing fills it again: every RCL7 room
 *     on live held the box at e0 and ~10% hits while the maintainer paid
 *     trips and energy to keep the corpse warm, and had it died the placer
 *     would have re-sited a 5,000e rebuild of a box nobody uses.
 *
 *  2. THE MINERAL SEAT — dead under EVERY condition. Roles/mineralMiner
 *     harvests into its own store and hauls straight to storage/terminal;
 *     nothing ever puts minerals in a container (the E39N58 fix made that
 *     a bug, not a feature). Live shard3: every mineral box at e0 — even
 *     the rich RCL8 VPS rooms with standing extractors.
 *
 * The fix drops dead tiles from the container SCHEDULE only:
 *   - never re-sited after they decay out,
 *   - still in plan.t, so migrateClass's full-array planTile never reads the
 *     standing box as a squatter (no FREE_REPLACE demolition),
 *   - the depot's gate needs a live controller link AND a storage (without
 *     storage the box is the room's only upgrader fallback) — reversible,
 *   - the mineral seat's gate is unconditional — nothing fills it ever.
 *
 * Roles/maintainer carries the matching skip: the standing box on a dead
 * tile is left to decay, but only while EMPTY of everything — a stocked
 * one may be serving as somebody's buffer (a sweeper's generic energy
 * fallback can land in any container).
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import { plannedTilesFor } from "../../src/utils/PlanV2";

const MAINTAINER = fs.readFileSync(
  path.join(__dirname, "../../src/Roles/maintainer.ts"),
  "utf8",
);

const pack = (x: number, y: number) => x + y * 50;
const P = (x: number, y: number): any => ({
  x,
  y,
  getRangeTo: (o: any) => Math.max(Math.abs(x - o.x), Math.abs(y - o.y)),
});

// Mirrors live E36N57: two source seats, the depot at 38,27 (3 from the
// controller at 36,24), and the mineral seat at 46,17 beside the extractor
// at 45,16.
function plan(): any {
  return {
    t: {
      container: [pack(9, 6), pack(6, 43), pack(38, 27), pack(46, 17)],
      extractor: [pack(45, 16)],
    },
  };
}

function room(
  planObj: any,
  opts: { link?: boolean; storage?: boolean; ctrl?: boolean },
): any {
  const ctrl = opts.ctrl === false ? null : { pos: P(36, 24) };
  return {
    controller: ctrl,
    storage: opts.storage === false ? null : { my: true },
    memory: { planV2: planObj },
    find: (type: number, opts2?: any) => {
      if (type === FIND_SOURCES) return [{ pos: P(10, 7) }, { pos: P(7, 42) }];
      if (type === FIND_STRUCTURES) {
        const structs = opts.link
          ? [{ structureType: STRUCTURE_LINK, pos: P(38, 26) }]
          : [];
        return opts2 && opts2.filter ? structs.filter(opts2.filter) : structs;
      }
      return [];
    },
  };
}

describe("PlanV2 dead boxes — the link retires the depot, design retires the mineral seat", () => {
  it("keeps every planned container when no room context exists", () => {
    assert.strictEqual(
      plannedTilesFor(plan(), STRUCTURE_CONTAINER, 8).length,
      4,
      "room-less callers (conductorsForRcl) must see the full schedule",
    );
  });

  it("keeps the depot when no controller link stands — but not the mineral seat", () => {
    const tiles = plannedTilesFor(plan(), STRUCTURE_CONTAINER, 7, room(plan(), {}));
    assert.strictEqual(tiles.length, 3);
    assert.include(tiles, pack(38, 27), "no link — the depot is still wanted");
    assert.notInclude(tiles, pack(46, 17), "the mineral seat is dead anyway");
  });

  it("keeps the depot when there is no storage — it is the only fallback", () => {
    const tiles = plannedTilesFor(
      plan(),
      STRUCTURE_CONTAINER,
      7,
      room(plan(), { link: true, storage: false }),
    );
    assert.include(tiles, pack(38, 27));
    assert.notInclude(tiles, pack(46, 17), "the mineral seat is dead anyway");
  });

  it("drops the depot index once the link stands — the box is never re-sited", () => {
    const tiles = plannedTilesFor(
      plan(),
      STRUCTURE_CONTAINER,
      7,
      room(plan(), { link: true }),
    );
    assert.strictEqual(tiles.length, 2, "both dead tiles retired");
    assert.notInclude(tiles, pack(38, 27), "the depot tile is dropped");
    assert.notInclude(tiles, pack(46, 17), "the mineral seat is dropped");
    assert.include(tiles, pack(9, 6), "source seats stay");
    assert.include(tiles, pack(6, 43), "source seats stay");
  });

  it("the mineral seat is dead under every condition — no gate at all", () => {
    // No link, no storage, RCL6 — the box still leaves the schedule:
    // nothing can ever fill it, so there is no state that revives it.
    const tiles = plannedTilesFor(
      plan(),
      STRUCTURE_CONTAINER,
      6,
      room(plan(), { storage: false, link: false }),
    );
    assert.notInclude(tiles, pack(46, 17));
  });

  it("never mistakes the extractor-adjacent mineral seat for the depot", () => {
    // E8S3 shape: controller 3 from the mineral, so BOTH boxes can be
    // controller-adjacent — the deferred (last) index must win the
    // mineral seat and only the genuine depot may drop.
    const p: any = {
      t: {
        container: [pack(9, 6), pack(6, 43), pack(24, 26), pack(23, 26)],
        extractor: [pack(23, 25)], // adjacent to BOTH trailing containers
      },
    };
    const tiles = plannedTilesFor(p, STRUCTURE_CONTAINER, 7, {
      controller: { pos: P(21, 29) },
      storage: { my: true },
      memory: { planV2: p },
      find: (type: number, opts2?: any) => {
        if (type === FIND_SOURCES) return [{ pos: P(9, 5) }, { pos: P(7, 44) }];
        if (type === FIND_STRUCTURES) {
          const structs = [{ structureType: STRUCTURE_LINK, pos: P(23, 28) }];
          return opts2 && opts2.filter ? structs.filter(opts2.filter) : structs;
        }
        return [];
      },
    } as any);
    // depot = 24,26 (nearest non-source, non-deferred); mineral 23,26 is the
    // LAST extractor-adjacent index — both dead, only the seats survive.
    assert.strictEqual(tiles.length, 2);
    assert.notInclude(tiles, pack(24, 26), "the controller depot dropped");
    assert.notInclude(tiles, pack(23, 26), "the mineral seat dropped too");
    assert.include(tiles, pack(9, 6));
    assert.include(tiles, pack(6, 43));
  });

  it("the drop composes with the RCL prefix — a linked room's early set shrinks too", () => {
    const tiles = plannedTilesFor(plan(), STRUCTURE_CONTAINER, 3, room(plan(), { link: true }));
    assert.notInclude(tiles, pack(38, 27));
    assert.notInclude(tiles, pack(46, 17));
  });
});

describe("Roles/maintainer — the standing corpses are left to decay", () => {
  it("computes the dead boxes once per room per tick and skips them", () => {
    assert.include(MAINTAINER, "maintainerDeadContainers");
    assert.include(MAINTAINER, "deadIds.indexOf(container.id)");
  });

  it("lets PlanV2 pick WHICH tiles are dead — it only checks standing boxes", () => {
    assert.include(MAINTAINER, "deadContainerTiles(creep.room)");
  });

  it("only skips while the box is EMPTY of everything — a stocked one may be a buffer", () => {
    const i = MAINTAINER.indexOf("maintainerDeadContainers");
    const block = MAINTAINER.slice(i, i + 900);
    assert.include(block, "getUsedCapacity");
  });
});
