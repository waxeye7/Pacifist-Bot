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
        assert.include(FILLER, 'import { hubWorkPending, managerErrand } from "Roles/energyManager";');
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

    it("a PARKED FULL filler is the only hub duty a one-filler room ever offers", () => {
        // The fetch-leg entry needs an empty store, and a standby load in a
        // quiet room is never spent — so that entry can go hundreds of ticks
        // without firing. Live E35N58 the moment its manager died: the filler
        // parked at 25,23 on 530 energy with extensions 2000/2000 while the
        // hub link at 23,23 climbed to 388 with nobody to drain it.
        assert.include(FILLER, "if(roomTopped(creep.room) && claimHubDuty(creep) && hubWorkPending(creep) &&");
    });

    it("...and asks whether there IS work before calling the do-it function", () => {
        // managerErrand's first rung is "you are carrying something, put it in
        // the storage". Called unconditionally from the parked branch it would
        // dump the standby load, refill next tick and dump again: two intents
        // a tick, forever, for nothing.
        const pend = FILLER.indexOf("hubWorkPending(creep) &&");
        const run = FILLER.indexOf("managerErrand(creep, MaxStorage)", pend);
        assert.isAbove(pend, -1);
        assert.isAbove(run, pend);
        const EMS = SRC("Roles/energyManager.ts");
        const body = EMS.slice(EMS.indexOf("export function hubWorkPending(creep: any): boolean {"));
        const end = body.indexOf(String.fromCharCode(10) + "}");
        const fn = body.slice(0, end);
        // read-only: a predicate that moves or withdraws is not a predicate
        assert.notInclude(fn, "creep.withdraw");
        assert.notInclude(fn, "creep.transfer");
        assert.notInclude(fn, "MoveCostMatrix");
        assert.notInclude(fn, "creep.memory.target =");
        // covers exactly the hub-only rungs
        assert.include(fn, "link.store[RESOURCE_ENERGY] > 0");
        assert.include(fn, "bin.store.getFreeCapacity() < 2000");
        assert.include(fn, "terminalFloat(room, storage, terminal)");
    });

    it("the terminal float band has ONE definition", () => {
        // Two copies of a hysteresis band is two bands, and they drift.
        const EMS = SRC("Roles/energyManager.ts");
        assert.include(EMS, "export function terminalFloat(room: any, storage: any, terminal: any): number {");
        assert.include(EMS, "const terminalEnergyTarget = terminalFloat(creep.room, storage, terminal);");
        assert.strictEqual((EMS.match(/energyBank >= 200000/g) || []).length, 1);
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

    it("the redirect is not itself an unbounded loop", () => {
        // Re-pointing at the storage resets the deadline, so a filler that
        // cannot reach its own storage would redirect there every 30 ticks
        // forever. The second failure drops the cargo instead: losing a hauler
        // is worse than losing one load, every time.
        assert.include(FILLER, "if(bank && creep.memory.target !== bank.id) {");
        assert.include(FILLER, "if(carried) creep.drop(carried as ResourceConstant);");
        const at = FILLER.indexOf("if(bank && creep.memory.target !== bank.id) {");
        const block = FILLER.slice(at, at + 1200);
        assert.include(block, "creep.memory.target = false;");
        assert.include(block, "delete creep.memory._hubT;");
    });

    it("an errand that cannot finish cannot hold the room's filler forever", () => {
        // Redirecting to the storage ends the errand AND empties the creep;
        // a bare `target = false` would leave the cargo aboard.
        assert.include(FILLER, "creep.memory.target = bank.id;");
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

/**
 * The terminal drain rung and the terminal fill rung fought each other.
 *
 * terminalFloat() switches the target on at 5,000 once storage+terminal
 * passes 20,000. The drain rung's SECOND arm read `storage < 20000 &&
 * terminal > MaxStorage` — a low-bank recovery that says nothing about the
 * target — and it is tested first, so it won every time:
 *
 *   storage 15,000 + terminal 5,000  -> arm 2: storage < 20,000, drain
 *   storage 20,000 + terminal 0      -> fill rung: terminal < 5,000, fill
 *   storage 15,000 + terminal 5,000  -> arm 2 again, forever
 *
 * 5,000 energy shuttled across the hub for the life of the room, one creep
 * round trip at a time. Live E36N57 2026-09-10 sat in that band at
 * 19,938 + 259, its terminal just pulled down from 2,426 by this arm while
 * the fill rung wanted 5,000 in it.
 */
describe("the terminal float does not oscillate", () => {
    const EMS = SRC("Roles/energyManager.ts");

    it("the recovery arm respects the float it is recovering past", () => {
        assert.include(
            EMS,
            "storage.store[RESOURCE_ENERGY] < 20000 && terminal && terminal.store[RESOURCE_ENERGY] > terminalEnergyTarget + MaxStorage"
        );
        assert.notInclude(
            EMS,
            "storage.store[RESOURCE_ENERGY] < 20000 && terminal && terminal.store[RESOURCE_ENERGY] > MaxStorage",
            "the target-blind arm is the oscillation"
        );
    });

    it("a starved room still recovers everything", () => {
        // Below a 20,000 combined bank terminalFloat returns 0, so
        // `> target + MaxStorage` is `> MaxStorage` and the arm is unchanged
        // for exactly the rooms it was written for.
        assert.include(EMS, "else if(energyBank >= 20000) target = 5000;");
        assert.include(EMS, "let target = 0;");
    });

    it("the fill rung still has its own hysteresis", () => {
        assert.include(EMS, "terminal.store[RESOURCE_ENERGY] > terminalEnergyTarget + 5000");
    });

    it("hubWorkPending agrees with the ladder, arm for arm", () => {
        // A predicate that disagrees with the ladder is a predicate that lies:
        // it would send a parked filler to dump its standby load for an errand
        // the ladder then refuses to run.
        assert.include(EMS, "if(storeAmt(storage, RESOURCE_ENERGY) < 20000 && termE > target + MaxStorage) return true;");
        assert.include(EMS, "if(termE > target + 5000) return true;");
    });
});

/**
 * findStorage() hands back the 2k HUB CONTAINER as a stand-in whenever the
 * room has no STRUCTURE_STORAGE — a window of thousands of ticks at RCL4
 * while the storage is still a construction site.
 *
 * NO_CONTAINER_STANDIN excludes the EnergyManager from that answer BY NAME,
 * and its comment says why: the errand ladder dumps its whole cargo (any
 * resource) into whatever it is given and pins it as memory.target, and every
 * rung is written against 20k / 100k / 175k / 275k, so a 2,000-cap box reads
 * as permanently empty AND permanently un-drainable.
 *
 * The filler is deliberately NOT on that list — it wants the box, that is the
 * entire point of the stand-in — and the filler now runs the ladder. So the
 * guard has to live on the ladder, not in a list of role names a new caller
 * silently is not on.
 */
describe("the hub ladder refuses a stand-in bank", () => {
    const EMS = SRC("Roles/energyManager.ts");

    it("the ladder demands a real STRUCTURE_STORAGE", () => {
        assert.include(EMS, "if(!storage || storage.structureType !== STRUCTURE_STORAGE) return acted;");
    });

    it("...and so does the predicate that sends a parked filler at it", () => {
        assert.include(EMS, "if(!storage || storage.structureType !== STRUCTURE_STORAGE) return false;");
    });

    it("the exclusion list it is standing in for is still there", () => {
        const CF = SRC("Functions/creepFunctions.ts");
        assert.include(CF, "const NO_CONTAINER_STANDIN: {[role: string]: boolean} = {");
        assert.include(CF, "    EnergyManager: true,");
        assert.notInclude(CF, "    filler: true,", "the filler wants the box for its own fill duty");
    });

    it("an errand in flight holds the room's duty slot", () => {
        const F = SRC("Roles/filler.ts");
        const at = F.indexOf("if(creep.memory.target) {");
        assert.include(F.slice(at, at + 300), "claimHubDuty(creep);");
    });
});

/**
 * A busy room is never "topped up", so hub duty never fires there — and the
 * hub link is the one store in the game that nothing but a creep can empty
 * into a storage.
 *
 * A hub link that is even PARTLY full blocks every source link behind it:
 * link.transferEnergy with no amount is all-or-nothing, so a source link
 * holding 800 cannot send into a hub holding 388. Live E38N56 the tick after
 * its manager died: storage 4,461, extensions cycling 1,600-1,950 of 2,000
 * with the filler running flat out, and the hub link pinned at 388 across
 * every sample.
 *
 * So draining it is not an errand, it is a stop on the fetch leg.
 */
describe("the filler drains the hub link on the way past", () => {
    const F = SRC("Roles/filler.ts");
    const body = F.slice(
        F.indexOf("function hubLinkDrain(creep: any, storage: any): boolean {"),
        F.indexOf("\n}", F.indexOf("function hubLinkDrain(creep: any, storage: any): boolean {"))
    );

    it("outranks the storage in the fetch ladder", () => {
        assert.include(F, "else if(hubLinkDrain(creep, storage)) {");
        const link = F.indexOf("else if(hubLinkDrain(creep, storage)) {");
        const bank = F.indexOf("else if(storage && storage.store[RESOURCE_ENERGY] > 0) {");
        assert.isAbove(link, -1);
        assert.isAbove(bank, link, "the storage is not the thing that stalls when it is not empty");
    });

    it("is the HUB link and never the controller link", () => {
        assert.include(body, "if(link.pos.getRangeTo(storage) > 2) return false;");
        assert.include(body, "if(S.controllerLink && link.id === S.controllerLink) return false;");
    });

    it("does not send a 1000-capacity filler out on a 100-energy delivery", () => {
        // `full` only when the load actually fills the creep; otherwise it
        // tops up from the storage on the next tick.
        assert.include(body, "creep.store.getFreeCapacity(RESOURCE_ENERGY) <= have");
        const m = F.match(/const LINK_DRAIN_MIN = (\d+);/);
        assert.isNotNull(m);
        assert.isAtLeast(Number(m![1]), 50, "two CARRY parts is the floor for an intent");
        assert.isAtMost(Number(m![1]), 400, "a half-full hub link already blocks the sources");
    });

    it("walks to it when it is not already adjacent", () => {
        assert.include(body, "advanceTo(creep, link, true);");
    });

    it("the room keeps first refusal on that link", () => {
        // forwardToControllerLink() is a structure action run in the ROOM
        // phase, which is before the creep phase, so the upgrade feed still
        // takes what it needs before any filler sees the link.
        const R = SRC("Rooms/rooms.ts");
        assert.include(R, "forwardToControllerLink(room);");
    });
});
