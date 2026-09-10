/**
 * Carriers hauled energy into the terminal as their top priority and the hub
 * creep hauled it straight back out, forever.
 *
 * Roles/carry.findLocked opened with
 * `if (terminal && terminal.store[RESOURCE_ENERGY] < 10000)`, ahead of a dry
 * tower and ahead of the whole extension network. Roles/energyManager
 * .terminalFloat is the function that owns "how much energy should this
 * terminal hold", and for a room whose storage+terminal is under 20,000 its
 * answer is ZERO. The two rungs therefore disagreed by the full 10,000 in
 * every poor room, permanently:
 *
 *   - the carrier hauled storage energy in, top priority, until 10,000;
 *   - hubWorkPending's drain arm (storage < 20,000 and termE > target +
 *     MaxStorage) wanted it back out again.
 *
 * A room with a hub creep paid two carries for zero net movement. A room
 * without one simply lost the energy out of its storage.
 *
 * LIVE, 2026-09-11. E38N56 had neither a filler nor an EnergyManager: storage
 * fell 5,277 -> 1,472 while its terminal climbed 5 -> 3,000, and the watchdog
 * read it as "economy stalling with no big site to explain it". The same climb
 * was empire-wide in that sample — E35N59 term 7,499, E35N58 8,441, E36N57
 * 5,015 — every room walking its terminal toward the hardcoded 10,000 whatever
 * its bank said.
 *
 * Once the room had a filler again, the churn was directly visible, four
 * samples about eight ticks apart:
 *
 *   t82884324  term   600
 *   t82884333  term 1,050   carrier delivered one full load
 *   t82884341  term   450   hub drained it straight back out
 *   t82884349  term   450
 *
 * 450 is exactly that carrier's capacity (9 CARRY).
 *
 * Same shape as the maintainer rung that drained this same room hours earlier:
 * a haul rung carrying its own hardcoded threshold instead of asking the
 * authority, so the affordability test living in the authority never ran.
 *
 * Sweeper keeps its own `< 10000` terminal rung on purpose. That one is a
 * DISPOSAL fallback which sits below real storage (Roles/sweeper.findLocked
 * rung 1), so it never moves energy out of the bank — it only parks salvage
 * that would otherwise decay on the floor.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const read = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");
const CARRY = read("Roles/carry.ts");
const EM = read("Roles/energyManager.ts");
const SWEEP = read("Roles/sweeper.ts");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("a carrier stocks the terminal to the hub ladder's number, not its own", () => {
    it("the hardcoded 10,000 is gone from the carrier", () => {
        assert.notInclude(
            code(CARRY),
            "terminal.store[RESOURCE_ENERGY] < 10000",
            "back to a second opinion on the terminal float"
        );
    });

    it("it asks terminalFloat instead", () => {
        assert.include(CARRY, 'import { terminalFloat } from "Roles/energyManager";');
        assert.include(CARRY, "const termTarget = terminalFloat(creep.room, creep.room.storage, terminal);");
        assert.include(CARRY, "if (termTarget > 0 && terminal.store[RESOURCE_ENERGY] < termTarget) {");
    });

    it("terminalFloat still answers zero for a poor room", () => {
        // The whole fix rests on this: no band below 20,000 combined.
        assert.include(EM, "if(energyBank >= 200000) target = 40000;");
        assert.include(EM, "else if(energyBank >= 100000) target = 20000;");
        assert.include(EM, "else if(energyBank >= 20000) target = 5000;");
        assert.include(EM, "let target = 0;");
        assert.include(EM, "export function terminalFloat(room: any, storage: any, terminal: any): number {");
    });

    it("a dry tower now outranks terminal stock", () => {
        const dryTower = CARRY.indexOf('building.structureType == STRUCTURE_TOWER && building.store[RESOURCE_ENERGY] < 200');
        const term = CARRY.indexOf("const termTarget = terminalFloat(");
        const ext = CARRY.indexOf('carryCandidates(creep.room, "carrySpawnExtTower"');
        assert.isAbove(dryTower, 0);
        assert.isBelow(dryTower, term, "a tower under 200 comes first, as its own comment says");
        assert.isBelow(term, ext, "but terminal stock still precedes the extension network");
    });

    it("the sweeper's disposal fallback is left alone", () => {
        // Below real storage, so it never draws the bank down.
        assert.include(SWEEP, "terminal.store[RESOURCE_ENERGY] < 10000 && canDumpAt(creep.room, terminal)");
        const storageRung = SWEEP.indexOf("if (storage && storage.my && canDumpAt(creep.room, storage)) {");
        const termRung = SWEEP.indexOf("terminal.store[RESOURCE_ENERGY] < 10000");
        assert.isAbove(storageRung, 0);
        assert.isBelow(storageRung, termRung, "storage must stay ahead of the terminal for salvage");
    });
});
