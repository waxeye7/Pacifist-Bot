import { assert } from "chai";
import fs from "fs";

/**
 * SEVEN TOP-LEVEL MEMORY KEYS THAT NO LINE OF src/ READS OR WRITES.
 *
 * Live shard3 2026-09-11: Memory was 141,164 bytes and 6,881 of them —
 * ~5% — were __wsrc, __roles, __watch, _mktProbe, _mh, _mh2 and _cbReroute,
 * scratch left behind by an old memhack, an old profiler and an old market
 * probe. Memory is serialised after main() returns, so that write is billed
 * to us and no in-loop profiler can see it; the bucket put the real cost of a
 * tick at 19.2-19.9 against a reported 18.23 on a 20 limit.
 */
const HYG = fs.readFileSync("src/utils/MemoryHygiene.ts", "utf8");
const MAIN = fs.readFileSync("src/main.ts", "utf8");
const SRC_FILES: string[] = [];
(function walk(dir: string): void {
  for (const name of fs.readdirSync(dir)) {
    const full = `${dir}/${name}`;
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".ts")) SRC_FILES.push(full);
  }
})("src");

describe("dead Memory keys", () => {
  it("names the dead rather than sweeping unknown keys", () => {
    // A sweep of anything unrecognised would also delete whatever a console
    // command had just parked there, and this bot's tooling writes to Memory
    // from the outside.
    assert.include(HYG, "const DEAD_MEMORY_KEYS = [");
    assert.notMatch(HYG, /for \(const k in Memory\)/);
    assert.notMatch(HYG, /Object\.keys\(Memory\)/);
  });

  it("lists exactly the seven keys the survey found", () => {
    const block = HYG.slice(HYG.indexOf("const DEAD_MEMORY_KEYS = ["), HYG.indexOf("];"));
    for (const k of ["__wsrc", "__roles", "__watch", "_mktProbe", "_mh", "_mh2", "_cbReroute"]) {
      assert.include(block, `"${k}"`, k);
    }
    assert.strictEqual((block.match(/"/g) || []).length / 2, 7);
  });

  it("never lists a key the bot actually uses", () => {
    // The guard that makes the named-list approach safe: if some future build
    // starts writing one of these, this test fails before the delete ships.
    const block = HYG.slice(HYG.indexOf("const DEAD_MEMORY_KEYS = ["), HYG.indexOf("];"));
    const dead = (block.match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1));
    for (const key of dead) {
      for (const file of SRC_FILES) {
        if (file.endsWith("utils/MemoryHygiene.ts")) continue;
        const text = fs.readFileSync(file, "utf8");
        assert.notInclude(text, key, `${key} is still referenced in ${file}`);
      }
    }
  });

  it("runs once per global reset, on every server", () => {
    // The same code is pushed to eight destinations and each holds its own
    // Memory with its own accumulated orphans, so a one-off API deletion
    // would clean exactly one of them.
    assert.include(HYG, "let swept = false;");
    assert.match(HYG, /if \(swept\) return;\s*\n\s*swept = true;/);
    assert.include(MAIN, 'mark("boot.memSweep", () => sweepDeadMemory());');
  });
});
