/**
 * Every tower in the empire walked the entire creep list to find one wounded
 * creep, and all of them did it on the same tick.
 *
 * The heal branches of the tower loop in Rooms/rooms.defence.ts each ran a
 * lodash filter over Game.creeps and then narrowed the result by
 * `damagedCreep.room.name == room.name`. Those expressions sit INSIDE
 * `_.forEach(room.memory.Structures.towers, ...)`, which sits inside
 * roomDefence(room), which rooms.ts calls once per owned room every tick.
 * Seven communes at up to six towers each is about forty full-empire scans of
 * the whole creep list, all landing on the one tick where `Game.time % 12 == 0`
 * — and producing the same array every time, since each tower then healed
 * `damagedCreeps[0]`, the same creep.
 *
 * Three separate faults in one expression:
 *   1. empire-wide where room-local was wanted — room.find(FIND_MY_CREEPS) is
 *      engine-cached per tick and never considers a creep in another room;
 *   2. recomputed per tower for a result that cannot differ between towers;
 *   3. computed eagerly even when the first tower's heal settles it.
 *
 * The danger-time arm was worse: it has no tick gate at all, so under siege it
 * ran the empire scan once per tower every single tick. Its predicate is a
 * 300-hit margin with no suicide term, so it cannot share the peacetime list
 * and keeps its own.
 *
 * The power-creep arm had a fourth fault: Game.powerCreeps includes UNSPAWNED
 * power creeps, whose `.room` is undefined, so reading `.room.name` was one
 * unspawned power creep away from throwing inside the tower loop.
 * FIND_MY_POWER_CREEPS cannot see an unspawned one.
 *
 * The same commit phases the rest of roomDefence's cadences by room, for the
 * reason recorded in roomCadencePhase.test.ts: the `% 250` nuke scan, the
 * `% 100` tower re-index, the `% 15` road-death floor and the `% 3` shell
 * upkeep all fired in all seven rooms simultaneously.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const D = fs
    .readFileSync(path.join(__dirname, "../../src/Rooms/rooms.defence.ts"), "utf8")
    .replace(/\r\n/g, "\n");

// Comments stripped. The doc block at the fix quotes the old expression so the
// incident stays readable at the call site; a notInclude over the raw file
// would trip on that record instead of on a real regression.
const CODE = D.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("towers do not scan the empire to heal someone standing next to them", () => {
    it("the empire-wide filters are gone from the code", () => {
        assert.notInclude(CODE, "_.filter(Game.creeps", "back to scanning every creep in the empire");
        assert.notInclude(CODE, "_.filter(Game.powerCreeps", "unspawned power creeps have no .room");
    });

    it("the peacetime scan is room-local", () => {
        assert.include(D, "damagedCreeps = room.find(FIND_MY_CREEPS, {filter: (c:any) =>");
        assert.include(D, "damagedPowerCreeps = room.find(FIND_MY_POWER_CREEPS, {filter: (pc:any) =>");
        assert.include(D, 'c.hits < c.hitsMax && !c.memory.suicide && c.memory.role !== "attacker"');
    });

    it("it is computed at most once per room per tick, and lazily", () => {
        assert.include(D, "let damagedCreeps: any[] | null = null;");
        assert.include(D, "let damagedPowerCreeps: any[] | null = null;");
        assert.include(D, "if(damagedCreeps === null) {", "must not recompute per tower");
        assert.include(D, "if(damagedPowerCreeps === null) {");
        const decl = D.indexOf("let damagedCreeps: any[] | null = null;");
        const loop = D.indexOf("_.forEach(room.memory.Structures.towers, function(towerID)");
        const use = D.indexOf("if(damagedCreeps === null) {");
        assert.isBelow(decl, loop, "the list must outlive one tower");
        assert.isAbove(use, loop, "and be filled from inside the loop");
    });

    it("the danger-time arm is hoisted too, with its own predicate", () => {
        assert.include(D, "let damagedForDanger: any[] | null = null;");
        assert.include(D, "if(damagedForDanger === null) {");
        assert.include(D, 'c.hits + 300 < c.hitsMax && c.memory.role !== "attacker"');
        assert.include(D, "tower.heal(damagedForDanger[0]);");
    });

    it("the heal gate and the rest of roomDefence are phased by room", () => {
        assert.include(D, "const healTick = (Game.time + roomTickOffset(room.name)) % 12 == 0;");
        assert.include(D, "if((Game.time + roomTickOffset(room.name)) % 250 == 0) {");
        assert.include(D, "if((Game.time + roomTickOffset(room.name)) % 100 == 0) {");
        assert.include(D, "(Game.time + roomTickOffset(room.name)) % 15 == 1 &&");
        assert.include(D, "(Game.time + roomTickOffset(room.name)) % 3 == 0 &&");
        assert.include(D, 'import { roomTickOffset } from "./rooms.remotes";');
    });

    it("danger-time cadences stay on the absolute tick", () => {
        // A room under fire must not wait for its residue to come round.
        assert.include(D, "room.memory.danger && room.memory.danger_timer >= 15 && Game.time % 5 === 0");
    });
});
