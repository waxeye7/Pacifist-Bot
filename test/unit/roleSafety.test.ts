/**
 * Pins the role-level starvation traps the 2026-08 hunt found. Source-pin
 * because these functions need a live Creep; the invariant is structural.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const HARVEST = fs.readFileSync(
    path.join(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8");
const MINER = fs.readFileSync(
    path.join(__dirname, "../../src/Roles/energyMiner.ts"), "utf8");

describe("harvestEnergy does not yoink remotes / rescue CBs", () => {
    it("only rewrites targetRoom below RCL3, not RCL4", () => {
        assert.include(HARVEST, "home.controller.level < 3");
        assert.notMatch(
            HARVEST,
            /harvestEnergy[\s\S]{0,600}home\.controller\.level < 4/,
        );
    });

    it("never rewrites a ContainerBuilder's colony target", () => {
        assert.include(HARVEST, 'this.memory.role !== "buildcontainer"');
    });
});

describe("energyMiner keeps harvesting when the bucket is sick", () => {
    it("does not return on bucket < 1000", () => {
        assert.notInclude(MINER, "if(Game.cpu.bucket < 1000) return;");
        assert.notInclude(MINER, "if (Game.cpu.bucket < 1000) return;");
    });
});

describe("towers do not hold fire on a low bucket", () => {
    const DEFENCE = fs.readFileSync(
        path.join(__dirname, "../../src/Rooms/rooms.defence.ts"), "utf8");
    it("attack is not gated on Game.cpu.bucket", () => {
        assert.notInclude(DEFENCE, "Game.cpu.bucket > 250");
        assert.include(DEFENCE, "tower.attack(plan.target)");
    });
});

describe("emergency feed loops back to the donor", () => {
    const CARRY = fs.readFileSync(
        path.join(__dirname, "../../src/Roles/carry.ts"), "utf8");
    const SPAWNING = fs.readFileSync(
        path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
    it("homeRoom is the donor, not the wreck", () => {
        assert.include(SPAWNING, "homeRoom: fromRoom.name");
        assert.include(SPAWNING, "emergencyFeed: n");
    });
    it("empty-in-dest walks back to homeRoom", () => {
        assert.include(CARRY, "donor && donor !== dest");
        assert.include(CARRY, "moveToRoomAvoidEnemyRooms(donor)");
    });
});

describe("builder does not drain the fill loop when a real storage exists", () => {
    const BUILDER = fs.readFileSync(
        path.join(__dirname, "../../src/Roles/builder.ts"), "utf8");
    it("only taps extensions when the hub is not a storage", () => {
        assert.include(BUILDER, "storage.structureType !== STRUCTURE_STORAGE");
        assert.include(BUILDER, "acquireEnergyWithContainersAndOrDroppedEnergy");
    });
});

describe("broke rooms drop maintainers", () => {
    const SPAWNING = fs.readFileSync(
        path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
    it("lists maintainer on the non-recovery deny map", () => {
        assert.match(SPAWNING, /maintainer:\s*true/);
    });
});

describe("ContainerBuilder does not nurse a healthy spawn", () => {
    const CB = fs.readFileSync(
        path.join(__dirname, "../../src/Roles/buildcontainer.ts"), "utf8");
    it("only feeds a newborn or dry hatchery", () => {
        assert.include(CB, "newborn || spawnDry");
        assert.include(CB, "controller.level <= 2");
    });
});

describe("spawn rescue does not strip defenders under attack", () => {
    const SPAWNING = fs.readFileSync(
        path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
    it("keeps RD/RRD/Guard when danger is set", () => {
        assert.include(SPAWNING, "stripKeepsRescueRole(");
        assert.include(SPAWNING, "room.memory.danger");
    });
    it("still processes the queue at bucket < 1000 when danger is set", () => {
        assert.include(SPAWNING, "if (!room.memory.danger) return;");
    });
});

describe("spawnFirstInLine does not fake a spawn on -6", () => {
    const SPAWNING = fs.readFileSync(
        path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
    it("only returns spawning when the inner emergency filler hatches", () => {
        assert.include(SPAWNING, "spawn.spawnCreep(body, newName, {memory: {role: 'filler'}}) === 0");
    });
    it("does not shred a stalled ContainerBuilder head", () => {
        assert.include(SPAWNING, 'startsWith("ContainerBuilder")');
    });
    it("does not shred a stalled Upgrader lifeline head", () => {
        assert.include(SPAWNING, 'startsWith("Upgrader")');
        assert.include(SPAWNING, "!headIsLifeline");
    });
    it("does not shred a stalled Filler / EmergencyFiller head", () => {
        assert.include(SPAWNING, 'startsWith("Filler")');
        assert.include(SPAWNING, 'startsWith("EmergencyFiller")');
        assert.include(SPAWNING, 'startsWith("emergencyFILLER")');
    });
    it("does not default the rescue mother to every caller", () => {
        assert.include(SPAWNING, "let best: string = null");
        assert.include(SPAWNING, "if (!best || best !== room.name) return");
    });
});

describe("recycle refunds at any adjacent spawn", () => {
    const start = HARVEST.indexOf("Creep.prototype.recycle = function recycle()");
    const fn = HARVEST.slice(start, HARVEST.indexOf("Creep.prototype.RangedAttackFleeFromMelee"));
    const onBin = fn.slice(
        fn.indexOf("if(this.pos.isEqualTo(bin))"),
        fn.indexOf("MoveCostMatrixRoadPrio(bin, 0)"),
    );

    it("does not require a spawn at bin.y+1", () => {
        assert.notInclude(onBin, "this.pos.y + 1");
        assert.include(onBin, "FIND_MY_SPAWNS");
        assert.include(onBin, "recycleCreep");
        assert.include(onBin, "isNearTo");
    });

    it("does not suicide on the bin when a spawn exists", () => {
        assert.include(onBin, "else if(spawns.length)");
        assert.include(onBin, "this.suicide()");
        assert.isBelow(
            onBin.indexOf("else if(spawns.length)"),
            onBin.indexOf("this.suicide()"),
            "suicide only after the no-spawn fallthrough",
        );
    });
});

describe("emergency filler does not require a live storage object", () => {
    const SPAWNING = fs.readFileSync(
        path.join(__dirname, "../../src/Rooms/rooms.spawning.ts"), "utf8");
    it("fires on storage OR zero haulers", () => {
        assert.include(SPAWNING, "storage || haulersInRoom === 0");
        assert.include(SPAWNING, "room.storage && room.storage.my");
    });
    it("clamps broke RCL4+ bodies even without a storage", () => {
        assert.include(SPAWNING, "room.controller.level >= 4 && roomIsBroke(room)");
        assert.notInclude(
            SPAWNING,
            "room.storage && room.storage.my && roomIsBroke(room)",
        );
    });
});
