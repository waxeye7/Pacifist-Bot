/**
 * The empire's poorest room was permanently designated its funnel target and
 * given an extra hauler for it, and the hauler had nothing to haul.
 *
 * Memory.targetRampRoom.room is claimed every 400 ticks by ANY owned RCL6+ room
 * that has a terminal and under 75,000 banked (Rooms/rooms.ts). Every room in
 * this empire sits between 3,500 and 22,600, so all seven qualify and the
 * winner is whichever Game.rooms iterates last -- not merit. It settled on
 * E39N58, the room with the LOWEST controller progress of the seven (20,727 at
 * RCL7, against 3.4M in E37N59), which is the exact opposite of what the
 * considered selection immediately above it picks for: highest RCL, most
 * progress.
 *
 * The designation's other consumers cannot fire in this empire at all. The
 * terminal push in rooms.market needs the SENDER to hold 290,000 energy, and
 * the RCL7 upgrader bonus needs 400,000; the biggest bank anywhere is 22,599.
 * So this rung alone was acting on the label, and it was buying haul capacity
 * for a delivery with no way of arriving.
 *
 * Measured on E39N58 across 30 samples, 2026-09-11: both fillers FULL in 29 of
 * them, and full-and-stationary-for-five-ticks in 21, while every extension and
 * every spawn in the room read 100%.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SP = fs
    .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8")
    .replace(/\r\n/g, "\n");

describe("the ramp room's extra hauler needs an emergency, not a label", () => {
    it("all three rungs require urgent, not just the name", () => {
        const gated = SP.split("Memory.targetRampRoom.room == room.name && Memory.targetRampRoom.urgent").length - 1;
        assert.equal(gated, 3, "RCL6, RCL7 and RCL8 filler rungs");
        // no rung may still act on the bare designation
        assert.notInclude(
            SP,
            "storage && Memory.targetRampRoom.room == room.name) {",
            "a rung was left reading the label alone"
        );
    });

    it("urgent is still a real signal and is left alone", () => {
        // rooms.ts sets it for a room in sustained danger holding under 80,000.
        // A room under fire genuinely does need a second hauler for its towers.
        const RT = fs
            .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.ts"), "utf8")
            .replace(/\r\n/g, "\n");
        assert.include(RT, "Memory.targetRampRoom.urgent = true;");
        assert.include(RT, "if (room.memory.danger && room.memory.danger_timer > 100) {");
        assert.include(RT, "if (storage.store[RESOURCE_ENERGY] < 80000) {");
    });

    it("the RCL7 upgrader bonus is untouched — it has its own 400k gate", () => {
        // Left deliberately: it cannot fire in a poor empire anyway, and it is
        // a spend rung rather than a haul rung, so it is not this bug.
        assert.include(SP, "room.name == Memory.targetRampRoom.room) && storage && storage.store[RESOURCE_ENERGY] > 400000");
    });
});
