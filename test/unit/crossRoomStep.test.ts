import { expect } from "chai";
import { directionToStep } from "../../src/Functions/roomFunctions";

/**
 * getDirectionTo() ignores roomName entirely. A PathFinder path that spans
 * rooms puts its head step in the NEXT room — (49,y) -> (0,y) crossing east —
 * and the native call reads that as a step across the whole current room,
 * returning the exact opposite of the move that crosses. Rams, squad preps
 * and power creeps all searched multi-room and stepped path[0] directly, so
 * they shuffled at every border forever.
 */
describe("directionToStep (cross-room path head)", () => {
    const from = (roomName: string, seen: any[] = []) => ({
        roomName,
        getDirectionTo: (p: any) => { seen.push(p); return 99; }
    });

    it("maps a next-room head at x=0 to RIGHT (east crossing)", () => {
        const f = from("W1N1");
        expect(directionToStep(f as any, { x: 0, y: 25, roomName: "W2N1" })).to.equal(RIGHT);
    });

    it("maps x=49 to LEFT, y=0 to BOTTOM, y=49 to TOP", () => {
        const f = from("W1N1");
        expect(directionToStep(f as any, { x: 49, y: 25, roomName: "W0N1" })).to.equal(LEFT);
        expect(directionToStep(f as any, { x: 25, y: 0, roomName: "W1N2" })).to.equal(BOTTOM);
        expect(directionToStep(f as any, { x: 25, y: 49, roomName: "W1N0" })).to.equal(TOP);
    });

    it("maps diagonal corner entries to the diagonal exit", () => {
        const f = from("W1N1");
        expect(directionToStep(f as any, { x: 0, y: 0, roomName: "W2N2" })).to.equal(BOTTOM_RIGHT);
        expect(directionToStep(f as any, { x: 49, y: 49, roomName: "W0N0" })).to.equal(TOP_LEFT);
    });

    it("same-room steps still defer to getDirectionTo", () => {
        const seen: any[] = [];
        const f = from("W1N1", seen);
        const step = { x: 10, y: 10, roomName: "W1N1" };
        expect(directionToStep(f as any, step)).to.equal(99);
        expect(seen).to.have.lengthOf(1);
    });

    it("steps without roomName still defer to getDirectionTo", () => {
        const seen: any[] = [];
        const f = from("W1N1", seen);
        expect(directionToStep(f as any, { x: 10, y: 10 })).to.equal(99);
        expect(seen).to.have.lengthOf(1);
    });
});
