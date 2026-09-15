/**
 * A path head equal to the creep's OWN tile is a permanent, unrecoverable
 * wedge, and every guard in the mover declined to clear it.
 *
 * Live E37N59 2026-09-10: the room's only EnergyManager sat at (35,32) with
 * memory.path [(35,32),(36,31)] and _still 364 and climbing. getDirectionTo of
 * your own tile is undefined, move(undefined) is ERR_INVALID_ARGS so the path
 * never shifted, the shove found the creep ITSELF on the head tile and set
 * _shovedBy to its own name, and RunCreepManager's wedge escape explicitly
 * refused a self-tile aim.
 *
 * Nothing drained the hub link. Both source links pinned at 800/800, both
 * miners had nowhere to unload, and 1,797 energy rotted on the two source
 * tiles while storage fell to 1,253 and the upgrader idled at an empty
 * controller link.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");
const CF = SRC("Functions/creepFunctions.ts");
const RCM = SRC("Managers/RunCreepManager.ts");

const block = (src: string, from: string, len: number): string => {
    const i = src.indexOf(from);
    assert.isAbove(i, -1, "anchor missing: " + from);
    return src.slice(i, i + len);
};

describe("self-tile path head", () => {
    it("stepCachedPath drops a head that is the tile the creep stands on", () => {
        const b = block(CF, "const stepCachedPath = (creep:any):void =>", 1800);
        assert.include(b, "path[0].x === creep.pos.x && path[0].y === creep.pos.y");
        assert.include(b, "path.shift();");
        // it must run BEFORE the direction is taken, or the fix is inert
        const drop = b.indexOf("path[0].x === creep.pos.x");
        const dir = b.indexOf("directionToStep(creep.pos, pos)");
        assert.isAbove(dir, drop, "the stale head is dropped before the direction");
    });

    it("the drop is a loop, so a run of stale heads cannot survive it", () => {
        const b = block(CF, "const stepCachedPath = (creep:any):void =>", 1800);
        const at = b.indexOf("path[0].x === creep.pos.x");
        assert.include(b.slice(0, at), "while(path.length > 0", "while, not if");
    });

    it("an emptied path returns instead of stepping off the end", () => {
        const b = block(CF, "const stepCachedPath = (creep:any):void =>", 1800);
        const drop = b.indexOf("path.shift();");
        const guard = b.indexOf("if(path.length == 0)", drop);
        assert.isAbove(guard, drop, "re-checked after the drop");
        const dir = b.indexOf("directionToStep(creep.pos, pos)");
        assert.isBelow(guard, dir, "and before the direction is taken");
    });

    it("only a head in THIS room counts — a cross-room step keeps its x/y", () => {
        // packed x/y repeat in every room, so an unqualified compare would
        // discard a legitimate first step of a path into the next room.
        const b = block(CF, "const stepCachedPath = (creep:any):void =>", 1800);
        const at = b.indexOf("path[0].x === creep.pos.x");
        assert.include(b.slice(0, at), "path[0].roomName === creep.room.name");
    });

    it("a creep never shoves itself", () => {
        // canShove(self) is TRUE once _still reaches 2, so the wedge made the
        // creep write its own name into its own _shovedBy every tick.
        const b = block(CF, "const stepCachedPath = (creep:any):void =>", 3200);
        assert.include(b, "b.id !== creep.id");
        const shove = b.indexOf("b.my");
        assert.isAbove(b.indexOf("b.id !== creep.id"), shove, "guards the shove branch");
    });
});

describe("the wedge escape covers the self-tile case", () => {
    it("RunCreepManager clears a self-tile aim instead of declining it", () => {
        const b = block(RCM, "if ((m._still || 0) >= STUCK_STILL_TICKS) {", 2200);
        assert.include(b, "aim.x === p.x &&");
        assert.include(b, "aim.y === p.y");
        const self = b.indexOf("!pending &&");
        assert.isAbove(self, -1, "the self-tile branch exists");
        assert.isBelow(self, b.indexOf("if (pending) {"), "and runs before the blocker branch");
    });

    it("it repaths but blames no tile — there is no blocker to route around", () => {
        const i = RCM.indexOf("!pending &&");
        assert.isAbove(i, -1);
        const b = RCM.slice(i, RCM.indexOf("if (pending) {", i));
        assert.include(b, "clearMovement(creep);");
        assert.include(b, "delete m._still;");
        assert.notInclude(b, "_blockedBy", "nothing was blocking it");
    });

    it("the blocker branch still refuses to blame the creep's own tile", () => {
        // the `pending` test keeps its self-exclusion; the new branch is the
        // one that handles it, so _blockedBy can never point at the creep.
        assert.include(RCM, "!(aim.x === p.x && aim.y === p.y);");
    });
});
