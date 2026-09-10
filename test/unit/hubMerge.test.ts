/**
 * Seven creeps stood in the hub doing what the filler standing next to them
 * could have done.
 *
 * The planner builds the hub around ONE tile that is range 1 of storage, the
 * terminal and the hub link, and the filler parks on it for its whole life.
 * Every rung of the EnergyManager's ladder except the lab/factory/nuker corner
 * happens within a step of that tile: drain the storage link, empty an
 * overflowing bin, hold the terminal energy float, push the room mineral out.
 *
 * Measured on shard3 2026-09-10 from Memory.CPU.roles, the bot's own per-role
 * accounting, against a hard 20 CPU limit on a 2,350 bucket:
 *
 *   EnergyManager   2.28 CPU/tick over 7 creeps   (1.00 of that PathFinder)
 *   filler          3.31 CPU/tick over 7.6 creeps
 *
 * Eleven per cent of the entire limit, and ten consecutive position/store
 * samples found five of the seven had not moved once and carried nothing.
 *
 * So the ladder became a function both roles can call, and the spawn rungs
 * closed in the rooms whose filler can absorb it. Six of the seven live rooms
 * are on that side of the line; E37N59, which has three labs with
 * inputLab1/inputLab2/outputLab1 configured, keeps its manager.
 *
 * The safety argument is the whole review: the filler is the room's lifeline,
 * so an errand may only START on a tick where the creep is empty and the room
 * wants nothing, and it is ABANDONED the moment the room goes hungry while the
 * cargo is energy the room can use.
 */
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const SRC = (p: string) =>
    fs.readFileSync(path.join(__dirname, "../../src/", p), "utf8").replace(/\r\n/g, "\n");
const EM = SRC("Roles/energyManager.ts");
const FILLER = SRC("Roles/filler.ts");
const SPAWN = SRC("Rooms/rooms.spawning.ts");

describe("the hub errand ladder is a function, not a role", () => {
    it("is exported with the return contract the callers rely on", () => {
        assert.include(EM, "export function managerErrand(creep: any, MaxStorage: number): boolean {");
        assert.include(EM, "    let acted = false;");
        // "cleared a dead target and issued nothing" must NOT read as handled,
        // or the caller freezes on a creep that never moved.
        assert.include(EM, "        return acted;");
    });

    it("the role is now the prologue plus the ladder plus a park", () => {
        assert.include(EM, "if(!managerErrand(creep, MaxStorage)) {");
        const at = EM.indexOf("if(!managerErrand(creep, MaxStorage)) {");
        assert.include(EM.slice(at, at + 120), "creep.idlePark();");
    });
});

describe("the filler absorbs the hub errands", () => {
    it("calls the same function, not a copy of it", () => {
        assert.include(FILLER, 'import { managerErrand } from "Roles/energyManager";');
        assert.include(FILLER, "managerErrand(creep, MaxStorage)");
    });

    it("only STARTS an errand on an empty store with the room fully fed", () => {
        assert.include(
            FILLER,
            "if(creep.store.getUsedCapacity() == 0 && roomTopped(creep.room) &&"
        );
        assert.include(FILLER, "claimHubDuty(creep) && managerErrand(creep, MaxStorage)");
        // and inside the fetch leg, so a loaded filler is never diverted
        const start = FILLER.indexOf("if(creep.store.getUsedCapacity() == 0 && roomTopped(creep.room) &&");
        const leg = FILLER.indexOf("if(!creep.memory.full) {");
        assert.isAbove(start, leg, "the fetch leg is the only place a filler is idle AND empty");
    });

    it("roomTopped is a real 'nothing wants energy', not fillNeed", () => {
        // fillNeed() is the room's DELIVERY GUARANTEE: it answers "where should
        // this load go" and never answers "nowhere", so it can never be used to
        // ask whether the room is satisfied.
        const at = FILLER.indexOf("function roomTopped(room: any): boolean {");
        assert.isAbove(at, -1);
        const body = FILLER.slice(at, FILLER.indexOf("\n}", at));
        assert.include(body, "room.energyAvailable < room.energyCapacityAvailable");
        // the tower bar is the same one fillNeed's half-tower rung uses, so a
        // filler cannot take duty while fillNeed would still hand it a tower
        assert.include(body, "s.store.getCapacity(RESOURCE_ENERGY) / 2");
        assert.notInclude(body, "fillNeed");
        assert.include(body, 'cachedDerived(room, "fillerRoomTopped"');
    });

    it("one filler per room per tick, so a two-filler room keeps a loaded one", () => {
        const at = FILLER.indexOf("function claimHubDuty(creep: any): boolean {");
        assert.isAbove(at, -1);
        const body = FILLER.slice(at, FILLER.indexOf("\n}", at));
        assert.include(body, "if(dutyTick !== Game.time) {");
        assert.include(body, "if(held && held !== creep.name) return false;");
        // the claim is taken AFTER the topped-up test, or a room with fill work
        // burns its duty slot on a filler that is about to go and fill
        const topped = FILLER.indexOf("roomTopped(creep.room) &&");
        const claim = FILLER.indexOf("claimHubDuty(creep) &&");
        assert.isAbove(claim, topped);
    });

    it("continues an errand above the full/empty bookkeeping", () => {
        // A load of link energy withdrawn for the storage must never be read as
        // a fill load by the `getFreeCapacity() == 0` flip.
        const cont = FILLER.indexOf("if(creep.memory.target) {");
        const flip = FILLER.indexOf("if(!creep.memory.full && creep.store.getFreeCapacity() == 0) {");
        assert.isAbove(cont, -1);
        assert.isAbove(flip, cont);
    });

    it("hands the load back to the fill duty the moment the room goes hungry", () => {
        assert.include(FILLER, "const pureEnergy = cargo > 0 && creep.store.getUsedCapacity(RESOURCE_ENERGY) === cargo;");
        assert.include(FILLER, "if(!roomTopped(creep.room) && (cargo === 0 || pureEnergy)) {");
        assert.include(FILLER, "if(pureEnergy) creep.memory.full = true;");
    });

    it("...but never strands a non-energy cargo by abandoning mid-errand", () => {
        // The abandon test requires the cargo to be pure energy (or nothing).
        // Anything else finishes, because the filler has no other way to put a
        // mineral down and would otherwise carry it to the grave.
        const at = FILLER.indexOf("if(!roomTopped(creep.room) && (cargo === 0 || pureEnergy)) {");
        assert.isAbove(at, -1);
        assert.include(FILLER.slice(at, at + 900), "else if(Game.time - (creep.memory._hubT || Game.time) > HUB_DUTY_MAX_TICKS)");
    });

    it("an errand that cannot finish cannot hold the room's filler forever", () => {
        // Redirecting to the storage ends the errand AND empties the creep;
        // a bare `target = false` would leave the cargo aboard.
        assert.include(FILLER, "creep.memory.target = creep.room.storage ? creep.room.storage.id : false;");
        const m = FILLER.match(/const HUB_DUTY_MAX_TICKS = (\d+);/);
        assert.isNotNull(m);
        assert.isAtMost(Number(m![1]), 60, "this is the room's lifeline, not a hauler");
        assert.isAtLeast(Number(m![1]), 10, "a hub errand is a few ticks; do not abort real work");
    });
});

describe("the spawn rungs close where the filler can cover", () => {
    it("every EnergyManager rung asks first", () => {
        assert.include(SPAWN, 'import { roomNeedsManager } from "Roles/energyManager";');
        const rungs = SPAWN.split("\n").filter((l) => /EnergyManagers <\s/.test(l));
        assert.isAtLeast(rungs.length, 4, "RCL5/6/7/8");
        for (const r of rungs) {
            assert.include(r, "roomNeedsManager(room, fillers)", "ungated rung: " + r.trim());
        }
    });

    it("the manager's own self-replacement asks the same question", () => {
        // Otherwise a room that no longer needs one keeps one forever: the
        // ladder never gets to veto a creep that re-queues itself.
        assert.include(EM, "roomNeedsManager(creep.room, creep.room.find(FIND_MY_CREEPS, {filter: (c) => {return (c.memory.role == \"filler\")}}).length))");
        // ...and behind the TTL test, which is true on one tick of a life, so
        // the two room-wide finds are paid once and not every tick
        const ttl = EM.indexOf("if(creep.ticksToLive == creep.body.length  * 3 &&");
        const gate = EM.indexOf("roomNeedsManager(creep.room, creep.room.find(");
        assert.isAbove(gate, ttl);
    });

    it("keeps a manager for the long-range half of the ladder", () => {
        const at = EM.indexOf("export function roomNeedsManager(room: any, fillers: number): boolean {");
        assert.isAbove(at, -1);
        const body = EM.slice(at, EM.indexOf("\n}", at));
        // no filler => nobody to inherit the duty => the manager IS the duty
        assert.include(body, "if(!(fillers > 0)) return true;");
        assert.include(body, "room.controller.level >= 8");
        assert.include(body, "labs.inputLab1 || labs.inputLab2 || labs.outputLab1");
        assert.include(body, "S.nuker || S.powerSpawn || S.factory");
    });
});
