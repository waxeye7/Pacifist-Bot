import { assert } from "chai";
import fs from "fs";

/**
 * DIAGNOSTICS ARE PAID AFTER THE LOOP RETURNS.
 *
 * Live shard3 2026-09-11: Memory was 141,164 bytes and Memory.rstats was
 * 13,024 of them — 9.2% — holding 52 "home|remote" entries across an
 * 832,894-tick window that was never once reset. Eight were keyed on E37N57,
 * a room the empire no longer owns.
 *
 * That is not free. Memory serialisation happens after main() returns and is
 * billed to us, and the bucket's own arithmetic put the real cost of a tick at
 * 19.2-19.9 against a reported 18.23 (see billedCpu.test.ts). The bucket needs
 * 4,000 for remotes and 5,000 for the optional roster and reached neither.
 */
const RS = fs.readFileSync("src/utils/RemoteStats.ts", "utf8");

describe("Memory.rstats stays bounded", () => {
  it("stamps every entry it touches", () => {
    assert.match(RS, /e\.lt = Game\.time;/);
  });

  it("keeps the stamp out of blank(), so the heal loop cannot zero it", () => {
    const blank = RS.slice(RS.indexOf("function blank()"), RS.indexOf("function entry("));
    assert.notInclude(blank, "lt:");
  });

  it("drops entries whose home room is provably no longer ours", () => {
    assert.include(RS, "export function pruneRemoteStats");
    assert.match(RS, /const lost = !!room && !!room\.controller && !room\.controller\.my;/);
  });

  it("never drops on mere loss of vision", () => {
    // A room we cannot see this tick is not evidence we lost it. Dropping on
    // invisibility would empty the table every time vision lapsed.
    const fn = RS.slice(
      RS.indexOf("export function pruneRemoteStats"),
      RS.indexOf("export function sampleRemoteStats")
    );
    assert.notMatch(fn, /if \(!room\)\s*\{?\s*delete/);
  });

  it("drops entries nothing has touched inside the window", () => {
    assert.include(RS, "const RSTAT_STALE_TICKS = 20000;");
    assert.match(RS, /Game\.time - lt > RSTAT_STALE_TICKS/);
  });

  it("caps the table oldest-first so it cannot walk back up", () => {
    assert.include(RS, "const RSTAT_MAX_KEYS = 40;");
    assert.match(RS, /left\.sort\(\(a, b\) => \(st\.r\[a\]\.lt \|\| 0\) - \(st\.r\[b\]\.lt \|\| 0\)\);/);
  });

  it("runs on a cadence from the sampler", () => {
    assert.match(RS, /if \(Game\.time % 500 === 0\) pruneRemoteStats\(\);/);
  });
});
