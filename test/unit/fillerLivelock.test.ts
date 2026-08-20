/**
 * W1N1 spawn-dead post-mortem (2026-08-21, VPS): a 150-capacity RCL8 ladder
 * stopgap filler livelocked (full==0-free and "still-loaded < 200" the same
 * tick), 60 extensions sat empty next to a 282k bank, the real 1200e filler
 * head was unaffordable at 302 energy, and every spawn safety was structurally
 * blind to a Filler head — while an unguarded billtong push held 18 of the 24
 * queue slots. Source-shape pins for each of the four fixes.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const FILLER = fs.readFileSync(path.join(__dirname, "../../src/Roles/filler.ts"), "utf8");
const SPAWNING = fs.readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
const COMMANDS = fs.readFileSync(path.join(__dirname, "../../src/utils/Commands.ts"), "utf8");

describe("filler livelock (W1N1 spawn-dead)", () => {
    it("the un-full threshold is clamped to the BODY, not just the RCL", () => {
        assert.match(FILLER, /startedEnergy < Math\.min\(rclFloor, Math\.max\(1, fillerCap\)\)/);
        assert.notMatch(FILLER, /level == 8 && startedEnergy < 200\)/,
            "the raw RCL8 literal must not decide on its own");
    });

    it("emergencyFillerRescue counts fillers the way the producer roster does (no stopgaps)", () => {
        const at = SPAWNING.indexOf("function emergencyFillerRescue");
        assert.isAbove(at, -1);
        const body = SPAWNING.slice(at, at + 1600);
        assert.match(body, /role == 'filler' && creep\.room\.name == room\.name && !\(creep\.memory as any\)\.stopgap/);
    });

    it("an unaffordable Filler head can shrink like a Carrier head", () => {
        assert.match(SPAWNING,
            /spawn_list\[1\]\.startsWith\("Filler"\) && room\.energyAvailable < room\.memory\.spawn_list\[0\]\.length \* 50/);
    });

    it("the billtong push is guarded against re-queueing (18 queue slots of one role)", () => {
        assert.match(COMMANDS, /const queuedBilltong = _\.some\(room\.memory\.spawn_list \|\| \[\]/);
        assert.match(COMMANDS, /if \(billtongs == 0 && !queuedBilltong\) \{/);
    });
});
