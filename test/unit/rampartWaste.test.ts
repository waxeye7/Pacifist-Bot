/**
 * BURIED RAMPARTS — the upkeep bill for tiles nothing can shoot.
 *
 * Measured failure (audit 2026-08-22, both servers): FOUR shipped ramparts sit
 * behind their own finished wall at chebyshev depth 4-8 from every standable
 * exterior tile, i.e. out of ranged reach (range 3) of anywhere an attacker can
 * physically stand without first breaching the shell. Two of them — the VPS
 * W1N1 source-link pair — had been pumped to 13.1M and 13.4M hits, roughly
 * 260,000 energy poured into two tiles that defend nothing.
 *
 * The placer is the plan's cover pass: it prices its rampart "bubbles" (source
 * seats, links) against a PROVISIONAL wall, the enclosure trades then pull those
 * lobes INSIDE the final wall, and nothing re-tests the emitted set. The tiles
 * ship as sanctioned plan ramparts, so every sanction-based filter in the bot
 * says yes to them and the RCL8 repair ladder happily grinds them upward
 * forever.
 *
 * Two halves to the fix, both pinned here:
 *   PLANT  — PlanV2.placePlanSites refuses to site a buried rampart.
 *   SPEND  — every rampart-repair target selection (towers, repair rungs,
 *            repair / maintainer / rampartUpgrader / SpecialRepair / builder /
 *            buildcontainer, and the energyMiner myRampart machinery that
 *            produced the 13.4M tile) skips buried ramparts.
 *
 * Defender SEAT logic is explicitly NOT filtered: a buried tile is still a legal
 * place for a RampartDefender to stand, and blunting the seat assignment during
 * a breach would be a real defence regression. That exclusion is asserted too.
 *
 * Module-private paths => source-shape assertions, same convention as
 * remotePipeline.test.ts / wallClash.test.ts.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "../../src/", rel), "utf8");

const INTERIOR = read("utils/Interior.ts");
const PLAN = read("utils/PlanV2.ts");
const DEFENCE = read("Rooms/rooms.defence.ts");
const SPAWNING = read("Rooms/rooms.spawning.ts");
const REPAIR = read("Roles/repair.ts");
const MAINTAINER = read("Roles/maintainer.ts");
const RAMPART_UPGRADER = read("Roles/rampartUpgrader.ts");
const MINER = read("Roles/energyMiner.ts");
const SPECIAL_REPAIR = read("Roles/SpecialRepair.ts");
const BUILDER = read("Roles/builder.ts");
const BUILDCONTAINER = read("Roles/buildcontainer.ts");

/** how many times `needle` appears in `src` */
function count(src: string, needle: string): number {
    return src.split(needle).length - 1;
}

describe("Interior: the depth transform that defines 'buried'", () => {
    it("ranged reach is the constant, and it is 4", () => {
        assert.match(INTERIOR, /const RAMPART_EXPOSED_DEPTH = 4;/,
            "depth 4 is one past ranged range 3 — the planner's own DEPTH_SAFE");
    });

    it("the flood fill carries a chebyshev distance-to-exterior field", () => {
        assert.match(INTERIOR, /depth: Uint8Array;/);
        assert.match(INTERIOR, /const depth = new Uint8Array\(2500\)\.fill\(255\);/);
        // seeded from every exterior tile, expanded 8-way through terrain walls
        // (Screeps has no line of sight, only range)
        assert.match(INTERIOR, /if \(ext\[p\]\) \{\s*\n\s*depth\[p\] = 0;/);
        assert.match(INTERIOR, /depth: depth,/,
            "the field has to survive into the cached record or nothing can read it");
    });

    it("rampartIsBuried is exported, fail-open, and reads the depth field", () => {
        assert.match(INTERIOR, /export function rampartIsBuried\(room: Room, pos: \{ x: number; y: number \}\): boolean \{/);
        const at = INTERIOR.indexOf("export function rampartIsBuried");
        const body = INTERIOR.slice(at, INTERIOR.indexOf("\n}", at));
        assert.match(body, /if \(!c\) return false;/,
            "no plan / open shell must answer NOT buried, or a real wall stops being repaired");
        assert.match(body, /if \(c\.ext\[p\]\) return false;/,
            "an exterior tile is never buried");
        assert.match(body, /return c\.depth\[p\] >= RAMPART_EXPOSED_DEPTH;/);
    });
});

describe("PLANT side: placePlanSites refuses to site a buried rampart", () => {
    it("the veto is in the emit loop, keyed on type === rampart", () => {
        assert.match(PLAN, /import \{ isExteriorTile, interiorReady, rampartIsBuried \} from "utils\/Interior";/);
        const at = PLAN.indexOf('if (type === "rampart") {');
        assert.isAbove(at, -1, "the plant veto block is gone");
        const block = PLAN.slice(at, at + 220);
        assert.match(block, /const up = unpack\(packed\);/);
        assert.match(block, /if \(rampartIsBuried\(room, up\)\) continue;/);
    });
});

describe("SPEND side: towers", () => {
    it("rooms.defence imports the predicate", () => {
        assert.match(DEFENCE, /import \{ rampartIsBuried, interiorReady \} from "utils\/Interior";/);
    });

    it("the peacetime shell top-up drops buried tiles from the candidate set", () => {
        const at = DEFENCE.indexOf("function planShellRamparts");
        assert.isAbove(at, -1);
        const body = DEFENCE.slice(at, DEFENCE.indexOf("\n}", at));
        assert.match(body, /!rampartIsBuried\(room, s\.pos\)/,
            "planShellRamparts feeds the only peacetime tower repair duty there is");
    });

    it("the sub-2000-hit HOLE PREVENTION save does not rescue a buried rampart", () => {
        const at = DEFENCE.indexOf("const dying = room.find(FIND_MY_STRUCTURES");
        assert.isAbove(at, -1);
        const block = DEFENCE.slice(at, at + 400);
        assert.match(block, /s\.hits < 2000 &&\s*\n\s*!rampartIsBuried\(room, s\.pos\) &&/,
            "a hole in a tile nothing can reach is not a hole in the perimeter");
    });

    it("defender SEAT assignment is deliberately untouched", () => {
        const at = DEFENCE.indexOf("function assignDefenderTiles");
        assert.isAbove(at, -1);
        const body = DEFENCE.slice(at, DEFENCE.indexOf("\nfunction ", at + 10));
        assert.notInclude(body, "rampartIsBuried",
            "standing on a buried rampart is still legal — this is a spend filter, not a movement one");
    });
});

describe("SPEND side: repair DEMAND (rooms.spawning rungs)", () => {
    it("the one rampart scan every repair rung reads is buried-filtered at the source", () => {
        assert.match(SPAWNING, /import \{ rampartIsBuried \} from "utils\/Interior";/);
        assert.match(SPAWNING, /rampartsInRoom = room\.find\(FIND_MY_STRUCTURES, \{filter: s => s\.structureType == STRUCTURE_RAMPART && !rampartIsBuried\(room, s\.pos\)\}\);/,
            "rampartsInRoom feeds the RCL4/5/6/7/8 repairer rungs, spawnMaintainer and " +
            "the SpecialRepair ladder — a buried tile must create no demand and count " +
            "toward no shell-completeness math");
    });

    it("there is still exactly ONE such scan (no un-filtered copy crept back)", () => {
        assert.equal(count(SPAWNING, "rampartsInRoom = room.find(FIND_MY_STRUCTURES"), 1);
    });
});

describe("SPEND side: the repair roles", () => {
    it("repair.ts filters both RCL6+ target lists and the desperation fallback", () => {
        assert.match(REPAIR, /import \{ interiorMove, filterOutposts, outpostDeferred, rampartIsBuried \} from "utils\/Interior";/);
        assert.equal(
            count(REPAIR, "isSanctionedRampart(creep.room, building.pos) && !rampartIsBuried(creep.room, building.pos)"),
            2,
            "both the E41N58 branch and the general one — sanctioned is not sufficient",
        );
        assert.match(REPAIR, /building\.hits < 300000000 && \(building\.structureType !== STRUCTURE_RAMPART \|\| !rampartIsBuried\(creep\.room, building\.pos\)\)/,
            "'nothing else is damaged' is exactly when an RCL8 room finds its 13M bubble");
    });

    it("repair.ts drops a lock that has since become buried", () => {
        assert.match(REPAIR, /else if\(repairTarget\.structureType == STRUCTURE_RAMPART && rampartIsBuried\(creep\.room, repairTarget\.pos\)\) \{\s*\n\s*creep\.memory\.locked = findLocked\(creep, storage\);/);
    });

    it("maintainer.ts filters the cached list AND re-checks at use", () => {
        assert.match(MAINTAINER, /import \{ interiorMove, filterOutposts, dangerNow, interiorReady, rampartIsBuried \} from "utils\/Interior";/);
        assert.match(MAINTAINER, /isSanctionedRampart\(creep\.room, s\.pos\) && !rampartIsBuried\(creep\.room, s\.pos\)\}\);/,
            "the list build");
        assert.match(MAINTAINER, /isSanctionedRampart\(creep\.room, rampObj\.pos\) && !rampartIsBuried\(creep\.room, rampObj\.pos\)\)/,
            "the re-check — the id list lives in creep memory for the creep's whole life");
    });

    it("rampartUpgrader.ts never locks a buried rampart", () => {
        assert.match(RAMPART_UPGRADER, /import \{ rampartIsBuried \} from "utils\/Interior";/);
        assert.match(RAMPART_UPGRADER, /let rampartsInRoom = creep\.room\.find\(FIND_MY_STRUCTURES, \{filter: s => s\.structureType == STRUCTURE_RAMPART && !rampartIsBuried\(creep\.room, s\.pos\)\}\);/);
    });

    it("SpecialRepair.ts filters the pick, the lock re-check and the stand-here top-up", () => {
        assert.match(SPECIAL_REPAIR, /import \{ interiorMove, filterOutposts, outpostDeferred, rampartIsBuried \} from "utils\/Interior";/);
        assert.match(SPECIAL_REPAIR, /\(!sanctioned \|\| sanctioned\.has\(`\$\{s\.pos\.x\},\$\{s\.pos\.y\}`\)\) &&\s*\n\s*!rampartIsBuried\(creep\.room, s\.pos\),/);
        assert.match(SPECIAL_REPAIR, /\(!isSanctionedRampart\(creep\.room, target\.pos\) \|\| rampartIsBuried\(creep\.room, target\.pos\)\)/);
        assert.match(SPECIAL_REPAIR, /isSanctionedRampart\(creep\.room, s\.pos\) && !rampartIsBuried\(creep\.room, s\.pos\)\}\), 3\);/);
    });

    it("an idle builder's weakest-rampart top-up skips buried tiles", () => {
        assert.match(BUILDER, /import \{ rampartIsBuried \} from "utils\/Interior";/);
        assert.match(BUILDER, /if\(isSanctionedRampart\(room, r\.pos\) && !rampartIsBuried\(room, r\.pos\)\) \{/);
    });

    it("buildcontainer's spawn-rampart nurse stops once the shell covers the spawn", () => {
        assert.match(BUILDCONTAINER, /import \{ rampartIsBuried \} from "utils\/Interior";/);
        assert.match(BUILDCONTAINER, /isSanctionedRampart\(creep\.room, spawnPos\) &&\s*\n\s*!rampartIsBuried\(creep\.room, spawnPos\)\) \{/);
    });
});

describe("SPEND side: the energyMiner myRampart machinery (the 13.4M tile)", () => {
    it("the miner never ADOPTS a buried rampart", () => {
        assert.match(MINER, /import \{ rampartIsBuried \} from "utils\/Interior";/);
        // the buried test sits after the range-1 narrow: 1-3 candidates, not
        // every rampart in the room, once per creep lifetime
        assert.match(MINER, /let rampartsInRangeOne: any\[\] = _\.filter\(creep\.pos\.findInRange\(myRamparts, 1\), \(s: any\) => !rampartIsBuried\(creep\.room, s\.pos\)\);/);
        const at = MINER.indexOf("creep.memory.checkedForRampartToRepair) {");
        assert.isAbove(at, -1);
        const block = MINER.slice(at, MINER.indexOf("creep.memory.checkedForRampartToRepair = true;", at));
        assert.equal(count(block, "creep.memory.myRampart = building.id;"), 2,
            "both adoption arms (link on the tile, sibling miner on the tile) run off the filtered list");
    });

    it("an already-adopted rampart that became buried is DROPPED, not pumped", () => {
        const at = MINER.indexOf("let rampart:any = Game.getObjectById(creep.memory.myRampart);");
        assert.isAbove(at, -1);
        const block = MINER.slice(at, at + 800);
        assert.match(block, /if\(rampart && rampartIsBuried\(creep\.room, rampart\.pos\)\) \{\s*\n\s*creep\.memory\.myRampart = false;\s*\n\s*\}\s*\n\s*else if\(storage/,
            "same shape as the existing myRampart = false drops, and it must SHORT-CIRCUIT " +
            "the 50M/100M storage pumps below — that ladder is what reached 13.4M hits");
    });

    it("the miner does not PLANT a link rampart the wall already covers", () => {
        assert.match(MINER, /isSanctionedRampart\(creep\.room, closestLink\.pos\) &&\s*\n\s*!rampartIsBuried\(creep\.room, closestLink\.pos\)\) \{/,
            "this planter is where the W1N1 link ramparts came from");
    });
});

describe("TOWER POLICY: creeps raise the wall, towers only stop deaths", () => {
    // Live E37N59 (RCL7): bank-broke, the 150k repairer floor never opened,
    // and the towers' 10k "decay floor" was the only thing touching a 77-tile
    // shell — the wall's ceiling WAS the tower number, bought at 20-80
    // hits/energy instead of a creep's 100.
    it("the shell floor is an emergency floor (3000), not a growth ladder", () => {
        assert.match(DEFENCE, /const TOWER_SHELL_FLOOR = 3000;/);
        assert.notMatch(DEFENCE, /const TOWER_SHELL_FLOOR = 10000;/);
    });

    it("one intent per tower, two duties — the <2000 save no longer starves the shell", () => {
        assert.match(DEFENCE, /if \(usedTower\[towerID\]\) continue;/);
        assert.match(DEFENCE, /usedTower\[towerID\] = true;/);
        const at = DEFENCE.indexOf("const dying = room.find");
        const block = DEFENCE.slice(at, at + 2000);
        assert.notMatch(block, /\}\s*\n\s*else \{\s*\n\s*const shell = planShellRamparts/,
            "the two duties must not share an if/else");
    });

    it("once the planned wall is finished, off-plan ramparts stop being resurrected", () => {
        assert.match(DEFENCE, /const shellDone = interiorReady\(room\) &&/);
        assert.match(DEFENCE, /\(!shellDone \|\| isSanctionedRampart\(room, s\.pos\)\)/,
            "the <2000 save is unfiltered only while the shell is still closing");
        assert.match(DEFENCE, /import \{ isSanctionedRampart \} from "utils\/PlanV2";/);
    });

    it("towers hold a road death floor — nothing else repairs a road at RCL6+", () => {
        assert.match(DEFENCE, /const ROAD_DEATH_FLOOR = 0\.1;/);
        assert.match(DEFENCE, /Game\.time % 15 == 1 &&/,
            "own tick phase — never contends with the shell rung's % 3");
        assert.match(DEFENCE, /for \(const roadID of room\.memory\.keepTheseRoads \|\| \[\]\)/,
            "kept roads only — trimmed controller roads still decay away by design");
    });
});

describe("REPAIR DEMAND: the RCL7 rung opens before the bank is rich", () => {
    it("shell-critical arm: a wall under a quarter of target unlocks at a 10k bank", () => {
        assert.match(SPAWNING, /const shellFloor7 = Math\.floor\(rampartHitsTarget\(room\) \/ 4\);/);
        assert.match(SPAWNING, /shellCritical7 && storage\.store\[RESOURCE_ENERGY\] > 10000/);
    });

    it("thin bank buys the RCL6 body, not the 4000e 30-WORK one", () => {
        assert.match(SPAWNING, /const repairBody7 = storage && storage\.store\[RESOURCE_ENERGY\] > 50000/);
        assert.match(SPAWNING, /spawn_list\.push\(repairBody7, name/);
    });

    it("maintainer triggers on a FRACTION of hitsMax, not 2000 absolute", () => {
        // 2000 absolute is 8% of a 25k swamp road — roads died overnight
        assert.match(SPAWNING, /road\.hits <= Math\.max\(2000, road\.hitsMax \* 0\.5\)/);
    });

    it("broke-triage keeps the maintainer when a road is about to vanish", () => {
        assert.match(SPAWNING, /if \(role === 'maintainer' && roadNearDeath\(room\)\) continue;/);
        assert.match(SPAWNING, /function roadNearDeath\(room: any\): boolean \{/);
        assert.match(SPAWNING, /r\.hits <= 500/,
            "a road that reaches 0 is deleted and takes its own respawn trigger with it");
    });

    it("a live repairer pauses under a 5k bank instead of grinding it to zero", () => {
        // spawn bars are 10k-150k but the WORK loop had no floor: spawn at
        // 10k, burn to nothing, starve the fillers, repeat (VPS W5N1 pattern)
        assert.match(REPAIR, /storage\.store\[RESOURCE_ENERGY\] < 5000 &&\s*\n\s*creep\.store\[RESOURCE_ENERGY\] === 0/);
        assert.match(REPAIR, /creep\.idlePark\(\);\s*\n\s*return;/);
    });
});
