import { assert } from "chai";
import fs from "fs";

/**
 * AN ERROR LOG WITH NO CLOCK IS AN ERROR LOG YOU CANNOT ACT ON.
 *
 * RawMemory segment 10 is append-only and carried no timestamp of any kind.
 * Live shard3 2026-09-11 held 275 entries. The two biggest groups were 137
 * pointing at rooms.ts:334 and 124 at installPathStats — and BOTH had already
 * been fixed. installPathStats is a no-op in this very tree, and the rooms.ts
 * line number belongs to a build whose main.ts had entirely different contents
 * at that line. There was no way to tell that from the log itself.
 *
 * The 90,000-byte guard made it worse: once the segment filled it dropped
 * every NEW error, silently preferring the oldest evidence to the newest.
 */
const EE = fs.readFileSync("src/utils/ErrorExporter.ts", "utf8");

describe("error segment entries are answerable", () => {
  it("stamps every entry with the tick", () => {
    assert.match(EE, /data\.errors\.push\(`t\$\{Game\.time\} \$\{stack\}`\)/);
  });

  it("keeps the newest entries, not the oldest", () => {
    assert.include(EE, "const MAX_ERRORS = 200");
    assert.match(EE, /data\.errors = data\.errors\.slice\(-MAX_ERRORS\);/);
  });

  it("still refuses to grow the segment past the byte guard", () => {
    // The cap is a second line of defence, not a replacement: a single huge
    // stack can still blow the 90,000-byte limit inside 200 entries.
    assert.include(EE, "> 90000");
  });

  it("does not stamp by mutating the caller's string", () => {
    // The stack is escaped HTML built by ErrorMapper and also logged to the
    // console; the prefix belongs to the archived copy only.
    assert.notMatch(EE, /stack = `t\$\{Game\.time\}/);
  });
});
