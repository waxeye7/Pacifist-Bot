import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * RoomPosition's constructor throws on coordinates outside 0..49. The legacy
 * (non-planV2) layout pass anchors everything on the hub — storage for the
 * ring/spawn/furniture offsets, spawn for the hub container and storage seat —
 * and a hub placed near a room edge (a manual or legacy layout CAN put storage
 * on y=49 or x=1) pushed those offsets out of bounds. The throw escaped
 * construction() and aborted the whole room pass for that cadence tick,
 * forever.
 *
 * Every storage/spawn/terminal-relative construction below now goes through
 * safePos (null instead of throwing) or a spawn-presence gate.
 */
const SRC = fs.readFileSync(
    path.join(__dirname, "../../src/Rooms/rooms.construction.ts"), "utf8"
).replace(/\r\n/g, "\n");

describe("construction(): hub-relative RoomPosition sites are bounds-safe", () => {
    const needs = [
        // RCL7 second spawn: storage.y-2
        "let secondSpawnPosition = safePos(storage.pos.x, storage.pos.y - 2, room.name)",
        // RCL8 third spawn: storage.x+2
        "let thirdSpawnPosition = safePos(storage.pos.x + 2, storage.pos.y, room.name)",
        // RCL8 observer/nuker/powerSpawn offsets
        "let observerPosition = safePos(storage.pos.x - 2, storage.pos.y + 1, room.name)",
        "let nukerPosition = safePos(storage.pos.x + 4, storage.pos.y, room.name)",
        "let powerSpawnPosition = safePos(storage.pos.x + 3, storage.pos.y + 2, room.name)",
        // terminal seat: storage.x-1, storage.y+2
        "let terminalPosition = safePos(storage.pos.x - 1, storage.pos.y + 2, room.name)",
    ];
    for (const snippet of needs) {
        it(`uses safePos for ${snippet.split("=")[0].trim()}`, () => {
            assert.include(SRC, snippet);
        });
    }

    it("builds the +-1 road rings through safePos and drops illegal tiles", () => {
        const storageRing = SRC.indexOf("let aroundStorageList");
        const storageRingEnd = SRC.indexOf("pathBuilder(aroundStorageList");
        const storageBlock = SRC.slice(storageRing, storageRingEnd);
        assert.isAbove(storageRing, -1);
        assert.notInclude(storageBlock, "new RoomPosition(");
        assert.include(storageBlock, "safePos(storage.pos.x + 1, storage.pos.y + 1, room.name)");
        assert.include(storageBlock, ".filter(Boolean)");

        const termRing = SRC.indexOf("let aroundTerminalList");
        const termRingEnd = SRC.indexOf("pathBuilder(aroundTerminalList");
        const termBlock = SRC.slice(termRing, termRingEnd);
        assert.isAbove(termRing, -1);
        assert.notInclude(termBlock, "new RoomPosition(");
        assert.include(termBlock, "safePos(room.terminal.pos.x + 1, room.terminal.pos.y, room.name)");
        assert.include(termBlock, ".filter(Boolean)");
    });

    it("never dereferences a dead spawn id", () => {
        // Structures.spawn keeps a stale id after the last spawn dies;
        // findSpawn() then returns undefined and every spawn.pos read throws.
        assert.include(SRC, "let storageLocation = spawn && safePos(spawn.pos.x, spawn.pos.y -2, room.name)");
        assert.include(SRC, "const hubContainers = spawn ? room.find(FIND_STRUCTURES");
        assert.include(SRC, "const hubContainerSites = spawn ? room.find(FIND_MY_CONSTRUCTION_SITES");
        assert.include(SRC, "if (spawn && (room.controller.level == 2 || room.controller.level == 3)");
    });
});

describe("basePlan.hub readers distrust persisted coordinates", () => {
    const DEFENDER = fs.readFileSync(
        path.join(__dirname, "../../src/Roles/RampartDefender.ts"), "utf8"
    ).replace(/\r\n/g, "\n");

    it("RampartDefender bounds-checks the hub before constructing", () => {
        // A hub written before the edge-spawn fix can persist y = -1; the
        // constructor would throw every tick this role runs.
        assert.include(DEFENDER, "hub.x >= 0 && hub.x <= 49 && hub.y >= 0 && hub.y <= 49");
        // ...and falls back to the storage leash rather than crashing
        assert.include(DEFENDER, "creep.room.storage.pos");
    });
});
