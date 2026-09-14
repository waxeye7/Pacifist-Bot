import { expect } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../../src/Rooms/rooms.labs.ts"), "utf8");

describe("labs: runReaction range guard", () => {
  it("skips output labs outside range 2 of either input", () => {
    // runReaction returns ERR_NOT_IN_RANGE when the output lab is more than
    // 2 tiles from an input. The degenerate-geometry fallback in
    // assignDynamicLabs picks the best-reach pair available, which can still
    // leave labs out of range — the guard must sit before the call.
    const call = SRC.indexOf("outputLab.runReaction(inputLab1, inputLab2)");
    expect(call).to.be.greaterThan(-1);
    const window = SRC.slice(Math.max(0, call - 2000), call);
    expect(window).to.include("inRangeTo(inputLab1, 2)");
    expect(window).to.include("inRangeTo(inputLab2, 2)");
  });
});
