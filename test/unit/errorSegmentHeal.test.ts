import { assert } from "chai";
import fs from "fs";

/**
 * A CORRUPT SEGMENT 10 IS AN ERROR LOG THAT NEVER LOGS AGAIN.
 *
 * getSegmentData used to JSON.parse the segment bare. Anything malformed —
 * truncated write, a hand edit through the API, a build that once used the
 * slot for another shape — threw out of addErrorToSegment on every single
 * error. ErrorMapper's catch keeps that from killing the tick, but it means
 * the archive is dead until someone clears the segment by hand, and the
 * failure is silent at exactly the moment the log is needed.
 *
 * Anything in the segment that is not {errors: []} shaped is unrecoverable
 * anyway, so a failed read now returns an empty log and the next write
 * self-heals the segment.
 */
const EE = fs.readFileSync("src/utils/ErrorExporter.ts", "utf8");

describe("error segment survives corrupt data", () => {
  it("no longer returns a bare JSON.parse of the segment", () => {
    assert.notMatch(EE, /return JSON\.parse\(RawMemory\.segments\[errorSegment\]\)/);
  });

  it("wraps the parse so malformed JSON cannot throw out of the read", () => {
    assert.match(EE, /try \{\s*const parsed = JSON\.parse\(segment\)/);
  });

  it("rejects parsed data whose errors field is not an array", () => {
    // Valid JSON with the wrong shape ({errors: "x"}, "hello", null) used to
    // pass through and then throw on .push inside addErrorToSegment instead.
    assert.include(EE, "Array.isArray(parsed.errors)");
  });

  it("falls back to an empty log so the next write self-heals the segment", () => {
    assert.match(EE, /return \{ errors: \[\] \}/);
  });
});
