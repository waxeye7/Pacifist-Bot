/**
 * Active remotes with no pathLength must still occupy a HARD_CAP slot.
 * At RCL3 Build_Remote_Roads never writes pathLength, so omitting them
 * from scored/keep left slotsLeft full and armed every adjacent exit.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import {
    bestRemotePathLength,
    scoreOrHoldUnsurveyed,
    remoteHasHostileTower,
    remoteHasInvaderCore,
    UNSCORED_ACTIVE_SCORE,
    UNSCORED_INACTIVE_SCORE,
} from "../../src/Rooms/rooms.remotes";
import { applySpeedrunSpawnHints, remotesRclLocked } from "../../src/utils/Speedrun";

describe("bestRemotePathLength", () => {
    it("returns null when no source has a surveyed path", () => {
        assert.isNull(bestRemotePathLength(undefined));
        assert.isNull(bestRemotePathLength({}));
        assert.isNull(bestRemotePathLength({ s1: { x: 10, y: 20 } }));
        assert.isNull(bestRemotePathLength({ s1: { pathLength: "nope" } }));
    });

    it("returns the closest surveyed pathLength", () => {
        assert.strictEqual(
            bestRemotePathLength({ a: { pathLength: 81 }, b: { pathLength: 40 } }),
            40,
        );
    });
});

describe("scoreOrHoldUnsurveyed", () => {
    it("holds an already-active remote with no pathLength on scored", () => {
        const scored: Array<{ name: string; score: number }> = [];
        const e = { active: true, energy: { s1: { x: 5, y: 6 } } };
        assert.strictEqual(scoreOrHoldUnsurveyed("E1N1", e, scored), "held");
        assert.deepEqual(scored, [{ name: "E1N1", score: UNSCORED_ACTIVE_SCORE }]);
    });

    it("holds an inactive slam-5 remote so a starve-close can reopen", () => {
        const scored: Array<{ name: string; score: number }> = [];
        const e = { active: false, energy: { s1: { x: 5, y: 6 } } };
        assert.strictEqual(scoreOrHoldUnsurveyed("E1N2", e, scored), "held");
        assert.deepEqual(scored, [{ name: "E1N2", score: UNSCORED_INACTIVE_SCORE }]);
    });

    it("inactive slam-5 remotes rank below actives", () => {
        const scored: Array<{ name: string; score: number }> = [];
        scoreOrHoldUnsurveyed("old", { active: false, energy: { s: { x: 1, y: 1 } } }, scored);
        scoreOrHoldUnsurveyed("live", { active: true, energy: { s: { x: 1, y: 1 } } }, scored);
        scored.sort((a, b) => b.score - a.score);
        assert.strictEqual(scored[0].name, "live");
        const keep: { [name: string]: boolean } = {};
        keep[scored[0].name] = true;
        assert.isTrue(keep.live);
        assert.isUndefined(keep.old);
    });

    it("skips a remote with no energy tiles", () => {
        const scored: Array<{ name: string; score: number }> = [];
        assert.strictEqual(scoreOrHoldUnsurveyed("E1N2", { active: false }, scored), "skip");
        assert.strictEqual(scoreOrHoldUnsurveyed("E1N3", { active: false, energy: {} }, scored), "skip");
        assert.strictEqual(scored.length, 0);
    });

    it("lets a surveyed remote take the real score path", () => {
        const scored: Array<{ name: string; score: number }> = [];
        const e = { active: true, energy: { s1: { pathLength: 40 } } };
        assert.strictEqual(scoreOrHoldUnsurveyed("E1N3", e, scored), "score");
        assert.strictEqual(scored.length, 0);
    });

    it("three RCL3 actives with no pathLength occupy HARD_CAP=1", () => {
        const scored: Array<{ name: string; score: number }> = [];
        for (const n of ["N", "E", "S"]) {
            scoreOrHoldUnsurveyed(n, { active: true, energy: { s: { x: 1, y: 1 } } }, scored);
        }
        const cap = 1;
        const keep: { [name: string]: boolean } = {};
        for (let i = 0; i < scored.length && i < cap; i++) keep[scored[i].name] = true;
        assert.strictEqual(scored.length, 3, "all three must be on scored to be closable");
        assert.strictEqual(Object.keys(keep).length, 1);
        assert.strictEqual(cap - Object.keys(keep).length, 0, "slotsLeft must not stay full");
    });

    it("manageRemotes holds unsurveyed actives instead of skipping them", () => {
        const SRC = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.remotes.ts"), "utf8");
        assert.include(SRC, "scoreOrHoldUnsurveyed(name, e, scored)");
        assert.notMatch(
            SRC,
            /if \(!isFinite\(best\)\) \{\s*\n\s*if \(e\.active\) claimRemote/,
            "must not claim-and-skip unsurveyed actives without scoring them",
        );
    });
});

describe("remotesRclLocked / slam-5 speedrun hints", () => {
    const g: any = global;

    function withMem(fn: () => void): void {
        const prevM = g.Memory;
        const prevG = g.Game;
        g.Memory = { speedrun: {}, features: { speedrun: true } };
        g.Game = { time: 1, cpu: { limit: 20, bucket: 10000 } };
        try { fn(); } finally { g.Memory = prevM; g.Game = prevG; }
    }

    function roomAt(rcl: number, cap: number, active = true): any {
        return {
            name: "E1N1",
            controller: { my: true, level: rcl },
            energyCapacityAvailable: cap,
            find: () => [],
            memory: { resources: { E1N1: {}, E1N2: { active } } },
        };
    }

    it("locks RCL2 and RCL3 before slam-5, unlocks RCL3 at 550e", () => {
        assert.isTrue(remotesRclLocked(roomAt(2, 300)));
        assert.isTrue(remotesRclLocked(roomAt(3, 300)));
        assert.isFalse(remotesRclLocked(roomAt(3, 550)));
        assert.isFalse(remotesRclLocked(roomAt(4, 1300)));
    });

    it("does not force-close an open remote at RCL3 after slam-5", () => {
        withMem(() => {
            const room = roomAt(3, 550, true);
            applySpeedrunSpawnHints(room);
            assert.isTrue(room.memory.resources.E1N2.active);
        });
    });

    it("still closes remotes at RCL3 before slam-5", () => {
        withMem(() => {
            const room = roomAt(3, 300, true);
            applySpeedrunSpawnHints(room);
            assert.isFalse(room.memory.resources.E1N2.active);
        });
    });

    it("manageRemotes uses remotesRclLocked, not a looser RCL<=3 close", () => {
        const SRC = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.remotes.ts"), "utf8");
        const HINTS = fs.readFileSync(
            path.join(__dirname, "../../src/utils/Speedrun.ts"), "utf8");
        assert.include(SRC, "if (remotesRclLocked(room))");
        assert.include(HINTS, "remotesRclLocked(room) || remotesDisabled()");
        assert.notMatch(
            HINTS,
            /if \(\(rcl <= 3 \|\| remotesDisabled\(\)\)/,
            "speedrun hints must not close slam-5 remotes",
        );
    });
});

describe("remoteHasHostileTower", () => {
    it("is true for leftover towers even when the controller is level 0", () => {
        const vis = {
            controller: { level: 0, my: false },
            find: (constId: number, opts?: any) => {
                if (constId !== FIND_HOSTILE_STRUCTURES) return [];
                const towers = [{ structureType: STRUCTURE_TOWER }];
                return opts && opts.filter ? towers.filter(opts.filter) : towers;
            },
        };
        assert.isTrue(remoteHasHostileTower(vis));
    });

    it("is false with no towers or no vision", () => {
        assert.isFalse(remoteHasHostileTower(undefined));
        assert.isFalse(remoteHasHostileTower({
            find: () => [],
        }));
    });

    it("manageRemotes consults towers with vision, not only AvoidRooms", () => {
        const SRC = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.remotes.ts"), "utf8");
        const manage = SRC.slice(SRC.indexOf("export function manageRemotes"), SRC.indexOf("scored.sort"));
        assert.include(manage, "remoteHasHostileTower(look)");
        assert.isBelow(
            manage.indexOf("const towered = remoteHasHostileTower(look)"),
            manage.indexOf("if (Memory.AvoidRooms && Memory.AvoidRooms.indexOf(name) >= 0)"),
        );
    });

    it("scanRemoteThreats and remoteIsHot mark leftover towers hot", () => {
        const SRC = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.remotes.ts"), "utf8");
        assert.include(SRC, 'markRemoteHot(room.name, remote, "hostile tower")');
        const hot = SRC.slice(SRC.indexOf("export function remoteIsHot"), SRC.indexOf("export function markRemoteHot"));
        assert.include(hot, "remoteHasHostileTower(rr)");
    });

    it("creepFunctions records AvoidRooms for any hostile tower, including RCL0", () => {
        const CF = fs.readFileSync(
            path.join(__dirname, "../../src/Functions/creepFunctions.ts"), "utf8");
        assert.include(CF, "!this.room.controller.my && _hostileTowers(this.room).length > 0");
        assert.notInclude(CF, "this.room.controller.level > 2 && _hostileTowers");
    });
});

describe("remoteHasInvaderCore", () => {
    it("is true for a visible invader core", () => {
        const vis = {
            find: (constId: number, opts?: any) => {
                if (constId !== FIND_HOSTILE_STRUCTURES) return [];
                const cores = [{ structureType: STRUCTURE_INVADER_CORE }];
                return opts && opts.filter ? cores.filter(opts.filter) : cores;
            },
        };
        assert.isTrue(remoteHasInvaderCore(vis));
    });

    it("is false with no core or no vision", () => {
        assert.isFalse(remoteHasInvaderCore(undefined));
        assert.isFalse(remoteHasInvaderCore({ find: () => [] }));
        assert.isFalse(remoteHasInvaderCore({
            find: (constId: number, opts?: any) => {
                const towers = [{ structureType: STRUCTURE_TOWER }];
                return opts && opts.filter ? towers.filter(opts.filter) : towers;
            },
        }));
    });

    it("manageRemotes rejects a visible core before scoring OPEN", () => {
        const SRC = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.remotes.ts"), "utf8");
        const manage = SRC.slice(SRC.indexOf("export function manageRemotes"), SRC.indexOf("scored.sort"));
        assert.include(manage, "remoteHasInvaderCore(look)");
        assert.isBelow(
            manage.indexOf("const cored = remoteHasInvaderCore(look)"),
            manage.indexOf("const towered = remoteHasHostileTower(look)"),
        );
        assert.isBelow(
            manage.indexOf("if (cored)"),
            manage.indexOf("if (towered)"),
        );
        assert.include(manage, 'markRemoteHot(room.name, name, "invader core")');
    });
});

describe("expired energy={} retry does not skip remoteHeldByOther", () => {
    it("falls through to the held-by-other check instead of arming unscouted", () => {
        const SRC = fs.readFileSync(
            path.join(__dirname, "../../src/Rooms/rooms.remotes.ts"), "utf8");
        const reopen = SRC.indexOf("re-opening ${name} for another look");
        const held = SRC.indexOf("const heldBy = remoteHeldByOther");
        assert.isAbove(reopen, 0);
        assert.isAbove(held, reopen);
        const between = SRC.slice(reopen, held);
        assert.notInclude(between, "unscouted.push(name)");
        assert.notMatch(between, /continue;/);
        assert.include(SRC, "if (!e.energy)");
    });
});
