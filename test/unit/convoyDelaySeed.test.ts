import { expect } from "chai";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const roleConvoy = require("../../src/Roles/Convoy").default;

function damagedHaulingConvoy() {
    return {
        memory: { full: true, homeRoom: "E1N1", targetRoom: "E2N2" },
        room: { name: "E1N1", memory: {} },
        store: {
            getFreeCapacity: () => 0,
            getUsedCapacity: () => 100,
        },
        hits: 10,
        hitsMax: 100,
        moveToRoomAvoidEnemyRooms: () => OK,
    };
}

describe("convoy delayConvoy seeding", function () {
    beforeEach(function () {
        (Memory as any).delayConvoy = undefined;
        delete (Memory as any).delayConvoy;
    });

    it("does not throw when delayConvoy memory was never seeded", function () {
        const creep = damagedHaulingConvoy();
        expect(() => roleConvoy.run(creep)).to.not.throw();
    });

    it("writes the 8000 tick delay for the home room", function () {
        const creep = damagedHaulingConvoy();
        roleConvoy.run(creep);
        expect((Memory as any).delayConvoy["E1N1"]).to.equal(8000);
    });

    it("keeps existing delayConvoy entries", function () {
        (Memory as any).delayConvoy = { E9N9: 1234 };
        const creep = damagedHaulingConvoy();
        roleConvoy.run(creep);
        expect((Memory as any).delayConvoy["E9N9"]).to.equal(1234);
        expect((Memory as any).delayConvoy["E1N1"]).to.equal(8000);
    });

    it("does not write delay when the convoy is undamaged", function () {
        const creep = damagedHaulingConvoy();
        creep.hits = 100;
        roleConvoy.run(creep);
        expect((Memory as any).delayConvoy).to.equal(undefined);
    });
});
