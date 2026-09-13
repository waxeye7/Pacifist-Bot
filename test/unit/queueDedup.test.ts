/**
 * TWO SPAWN RUNGS COUNTED ONLY LIVE CREEPS — QUEUED ONES WERE INVISIBLE.
 *
 * The per-room census (forEachQueued) skips entries whose targetRoom is a
 * foreign room, and both of these rungs queue exactly that kind:
 *
 *  - SneakyControllerUpgrader pushes FOUR bodies per pass (targetRoom = the
 *    keepAflat room), gated only on `SneakyControllerUpgraders < 1` — a live
 *    count. Four queued SCUs under a stalled head read as zero, so every
 *    producer pass added four more, up to the 24-entry queue cap.
 *  - claimer pushes a [MOVE,CLAIM] every producer pass inside its
 *    `Game.time % 800 <= 100` window while a claimer sits queued — the
 *    two-claimers-is-two-GCL-slot-races case the census comment warns about.
 *
 * queuedWithPrefix already exists for exactly this (RampartDefender, RRD,
 * SpecialRepair, Clearer, Repair, Maintainer all carry it); these two rungs
 * were missing it.
 */
import { assert } from "chai";
import fs from "fs";

const SRC = fs.readFileSync("src/Rooms/rooms.spawning.ts", "utf8");
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "").replace(/[/][/].*/g, "");

describe("spawn rungs count the queue, not just the living", () => {
  it("SneakyControllerUpgrader rung checks the queue", () => {
    assert.match(CODE, /SneakyControllerUpgraders < 1 && !queuedWithPrefix\(room, 'SneakyControllerUpgrader'\)/);
  });

  it("claimer rung checks the queue", () => {
    assert.match(CODE, /claimers < 1 && !queuedWithPrefix\(room, 'Claimer'\)/);
  });
});
