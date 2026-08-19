/**
 * Miner seats + income ramparts (src/utils/minerSeat.ts) — the W3N1 fix.
 * The seat is the tile adjacent to BOTH source and link; the plan sync appends
 * the link tile + seat tile to the plan's rampart set so sanctioning stops
 * vetoing them. Pure functions, executable tests.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";
import {
    packXY,
    unpackXY,
    chooseSeat,
    seatTiles,
    incomeRampartAdds,
    shellExposure,
    findLiveSeat,
    SeatCand,
} from "../../src/utils/minerSeat";

const noWalls = () => false;

describe("minerSeat: chooseSeat", () => {
    function c(p: number, o: Partial<SeatCand> = {}): SeatCand {
        return { p, container: false, rampart: false, road: false, ...o };
    }

    it("prefers container > rampart > plain > road", () => {
        assert.equal(chooseSeat([c(1, { road: true }), c(2), c(3, { rampart: true }), c(4, { container: true })]), 4);
        assert.equal(chooseSeat([c(1, { road: true }), c(2), c(3, { rampart: true })]), 3);
        assert.equal(chooseSeat([c(1, { road: true }), c(2)]), 2);
        assert.equal(chooseSeat([c(1, { road: true })]), 1, "a road seat beats no seat");
        assert.isNull(chooseSeat([]));
    });

    it("breaks ties on the lowest packed index — every caller lands on the SAME tile", () => {
        assert.equal(chooseSeat([c(90), c(40), c(70)]), 40);
        assert.equal(chooseSeat([c(90, { container: true }), c(40, { container: true })]), 40);
    });
});

describe("minerSeat: seatTiles geometry", () => {
    it("returns the tiles adjacent to BOTH source and link (link at range 2 -> the between tiles)", () => {
        // source (10,10), link (10,12): seat ring = (9..11, 11) minus walls
        const tiles = seatTiles(10, 10, 10, 12, noWalls);
        assert.sameDeepMembers(tiles, [{ x: 9, y: 11 }, { x: 10, y: 11 }, { x: 11, y: 11 }]);
    });

    it("respects walls and the room border", () => {
        const walls = (x: number, y: number) => x === 10 && y === 11;
        assert.sameDeepMembers(seatTiles(10, 10, 10, 12, walls), [{ x: 9, y: 11 }, { x: 11, y: 11 }]);
        assert.deepEqual(seatTiles(0, 10, 0, 12, noWalls), [{ x: 1, y: 11 }],
            "border tiles (x<1) are excluded; the interior neighbour still qualifies");
    });

    it("adjacent link (range 1): seats are tiles touching both", () => {
        const tiles = seatTiles(10, 10, 11, 11, noWalls);
        // any source-neighbour within 1 of (11,11)
        for (const t of tiles) {
            assert.isAtMost(Math.max(Math.abs(t.x - 10), Math.abs(t.y - 10)), 1);
            assert.isAtMost(Math.max(Math.abs(t.x - 11), Math.abs(t.y - 11)), 1);
        }
        assert.isAbove(tiles.length, 0);
    });
});

describe("minerSeat: incomeRampartAdds", () => {
    const S = [{ x: 10, y: 10 }];

    it("adds the link tile and the seat tile for a link within 2 of a source", () => {
        const t = { link: [packXY(10, 12)], rampart: [] as number[], container: [], road: [] };
        const adds = incomeRampartAdds(t, S, noWalls);
        assert.include(adds, packXY(10, 12), "the link itself");
        // seat = lowest packed of (9,11),(10,11),(11,11) all plain
        assert.include(adds, packXY(9, 11));
        assert.lengthOf(adds, 2);
    });

    it("prefers the plan CONTAINER tile as the seat", () => {
        const t = { link: [packXY(10, 12)], rampart: [] as number[], container: [packXY(11, 11)], road: [packXY(9, 11)] };
        const adds = incomeRampartAdds(t, S, noWalls);
        assert.include(adds, packXY(11, 11), "container tile wins the seat");
        assert.notInclude(adds, packXY(9, 11));
    });

    it("ignores links farther than 2 and returns nothing already ramparted (idempotent)", () => {
        const far = { link: [packXY(10, 14)], rampart: [] as number[] };
        assert.deepEqual(incomeRampartAdds(far, S, noWalls), []);
        const t = { link: [packXY(10, 12)], rampart: [] as number[], container: [], road: [] };
        const first = incomeRampartAdds(t, S, noWalls);
        t.rampart = t.rampart.concat(first);
        assert.deepEqual(incomeRampartAdds(t, S, noWalls), [], "second sync adds nothing");
    });

    it("tolerates empty/missing inputs", () => {
        assert.deepEqual(incomeRampartAdds({} as any, S, noWalls), []);
        assert.deepEqual(incomeRampartAdds({ link: [] }, S, noWalls), []);
        assert.deepEqual(incomeRampartAdds({ link: [packXY(10, 12)] }, [], noWalls), []);
    });

    it("honours the exposure gate: only exposed tiles are ramparted", () => {
        const fresh = () => ({ link: [packXY(10, 12)], rampart: [] as number[], container: [], road: [] });
        const LINK = packXY(10, 12);
        const SEAT = packXY(9, 11); // lowest packed of the three plain seat tiles

        const onlyLink = incomeRampartAdds(fresh(), S, noWalls, (p: number) => p === LINK);
        assert.deepEqual(onlyLink, [LINK], "the exposed link is bubbled, the deep seat is not");

        assert.deepEqual(incomeRampartAdds(fresh(), S, noWalls, () => false), [],
            "a source deep inside the shell owes nothing — the planner left it bare on purpose");

        const both = incomeRampartAdds(fresh(), S, noWalls, null);
        assert.sameMembers(both, [LINK, SEAT], "null gate = fail open = the old unconditional behaviour");
    });
});

describe("minerSeat: shellExposure", () => {
    /** The ring x,y in 10..30 — a closed square shell around the hub. */
    function squareShell(): number[] {
        const out: number[] = [];
        for (let i = 10; i <= 30; i++) {
            out.push(packXY(i, 10), packXY(i, 30), packXY(10, i), packXY(30, i));
        }
        return out;
    }

    it("returns null (fail open) for a missing or implausibly short shell", () => {
        assert.isNull(shellExposure(undefined as any, noWalls));
        assert.isNull(shellExposure([], noWalls));
        assert.isNull(shellExposure([1, 2, 3, 4, 5, 6, 7], noWalls), "< 8 tiles cannot be a real min-cut");
    });

    it("a closed shell hides the deep interior and exposes the shallow rim and the outside", () => {
        const exposed = shellExposure(squareShell(), noWalls);
        assert.isFunction(exposed);
        const ex = exposed as (p: number) => boolean;

        assert.isFalse(ex(packXY(20, 20)), "the centre is depth 11 behind the shell — no income rampart");
        assert.isTrue(ex(packXY(12, 12)), "two tiles inside the ring is still within chebyshev 4 of the exterior");
        assert.isTrue(ex(packXY(40, 40)), "outside the shell entirely");
    });

    it("an open shell leaks the flood inward — everything reads exposed (the old behaviour)", () => {
        const leaky = squareShell().filter(p => p !== packXY(20, 10)); // one tile missing from the ring
        const ex = shellExposure(leaky, noWalls) as (p: number) => boolean;
        assert.isTrue(ex(packXY(20, 20)), "a shell that does not close cannot enclose anything");
    });
});

describe("minerSeat: findLiveSeat", () => {
    function fakeRoom(structsAt: { [p: number]: string[] }, planRamparts?: number[]) {
        return {
            getTerrain: () => ({ get: () => 0 }),
            memory: planRamparts ? { planV2: { t: { rampart: planRamparts } } } : {},
            lookForAt: (_look: any, x: number, y: number) =>
                (structsAt[packXY(x, y)] || []).map(t => ({ structureType: t })),
        };
    }
    const src = { x: 10, y: 10 };
    const link = { x: 10, y: 12 };

    it("takes the container tile over the road tile (the W3N1 shuffle case)", () => {
        const room = fakeRoom({
            [packXY(9, 11)]: [STRUCTURE_ROAD],
            [packXY(10, 11)]: [STRUCTURE_CONTAINER],
        });
        assert.equal(findLiveSeat(room, src, link), packXY(10, 11));
    });

    it("skips tiles blocked by a real structure", () => {
        const room = fakeRoom({
            [packXY(9, 11)]: [STRUCTURE_EXTENSION],
            [packXY(10, 11)]: [STRUCTURE_EXTENSION],
            [packXY(11, 11)]: [STRUCTURE_ROAD],
        });
        assert.equal(findLiveSeat(room, src, link), packXY(11, 11), "road is the only unblocked candidate");
    });

    it("counts a PLAN rampart tile as a rampart seat even before it is built", () => {
        const room = fakeRoom({ [packXY(11, 11)]: [STRUCTURE_ROAD] }, [packXY(10, 11)]);
        assert.equal(findLiveSeat(room, src, link), packXY(10, 11));
    });

    it("packXY/unpackXY round-trip", () => {
        const p = packXY(37, 31);
        assert.deepEqual(unpackXY(p), { x: 37, y: 31 });
    });
});

describe("minerSeat: wiring pins", () => {
    const MINER = fs.readFileSync(path.join(__dirname, "../../src/Roles/energyMiner.ts"), "utf8");
    const BUILDER = fs.readFileSync(path.join(__dirname, "../../src/Roles/builder.ts"), "utf8");
    const PLANV2 = fs.readFileSync(path.join(__dirname, "../../src/utils/PlanV2.ts"), "utf8");

    it("the miner runs the seat first and every legacy mover defers to it", () => {
        assert.include(MINER, "const seatState = ensureMinerSeat(creep);");
        // the fullish link-walk, the rampart-step and end-of-life walk are all gated
        assert.isAtLeast(MINER.split('seatState === "none"').length - 1, 3,
            "all three legacy movers must check the seat");
        assert.include(MINER, 'seatState !== "moving"', "harvest pathing yields while walking to the seat");
    });

    it("the plan sync derives income ramparts (link + seat) into t.rampart", () => {
        assert.include(PLANV2, "incomeRampartAdds(");
        assert.include(PLANV2, "income rampart");
    });

    it("builders repair ramparts THEMSELVES — the tower battery is never aimed from the role", () => {
        assert.notMatch(BUILDER, /\.roomTowersRepairTarget\(/,
            "aiming M towers at scattered ramparts is 20-80 hits/energy out of the bank; a WORK creep does 100");
        assert.include(BUILDER, "creep.repair(weakest)");
    });
});
