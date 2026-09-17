import { assert } from "chai";
import fs from "fs";
import path from "path";

/**
 * Roles/War audit round 2. Source pins for fixes that are pure wiring and
 * cannot be driven without a live Game:
 *
 *  - mosquito rows were deleted the tick they finished spawning (ts<=0), but
 *    mosquito_attack keys ALL in-room combat off the row — every wave idled
 *    in the target room until death and blocked re-issue. Rows now outlive
 *    their spawn count; the %1000 janitor owns ts<=0 cleanup, and a revived
 *    row re-stamps `at` so the manager TTL does not reap it on sight.
 *  - carry's deliver leg routed full emergencyFeed carriers to homeRoom —
 *    the DONOR — so rescue energy round-tripped back into the donor's
 *    storage. deliverRoom = emergencyFeed || homeRoom now steers both legs.
 *  - SquadCreepA dereferenced memory.targetPosition unguarded; a wiped
 *    Memory.creeps restores only `role`, so a wiped leader threw every tick
 *    and its SquadCreep prefix held expensiveInFlight() — blocking every
 *    quad empire-wide. It now seeds the same home-centre fallback the
 *    promotion path uses.
 *  - bindSquadSlot returned a stale pre-promotion self-bind (squad.b = own
 *    id on a promoted B), double-counting the leader in liveNow and
 *    producing a self-partnered DuoCreepB that stands still forever.
 *  - energyMiner called isNearTo() on an unresolved getObjectById(sourceId)
 *    and on a possibly-undefined closestLink — isNearTo(null) throws.
 *  - upgrader's fetch leg had no branch for a truthy non-STORAGE `storage`
 *    (hub container below RCL5) or a real storage inside the downgrade
 *    window — the upgrader stood empty forever in exactly the rooms and
 *    emergencies the leg exists for.
 *  - ControllerLinkFiller resolved memory.t to a store-less structure and
 *    threw on .store.getFreeCapacity.
 *  - mosquito kits were exempt from the travel-budget check their creeps
 *    still pay — the row is memory-side, the bodies still walk.
 */
const CARRY = fs.readFileSync(path.join(__dirname, "../../src/Roles/carry.ts"), "utf8");
const SQUAD_A = fs.readFileSync(path.join(__dirname, "../../src/Roles/Squad/SquadCreepA.ts"), "utf8");
const SQUAD_HELP = fs.readFileSync(path.join(__dirname, "../../src/Roles/Squad/SquadHelperFunctions.ts"), "utf8");
const MINER = fs.readFileSync(path.join(__dirname, "../../src/Roles/energyMiner.ts"), "utf8");
const UPGRADER = fs.readFileSync(path.join(__dirname, "../../src/Roles/upgrader.ts"), "utf8");
const CLF = fs.readFileSync(path.join(__dirname, "../../src/Roles/ControllerLinkFiller.ts"), "utf8");
const MOSQ_MGR = fs.readFileSync(path.join(__dirname, "../../src/Misc/mosquito_manager.ts"), "utf8");
const MOSQ_ATK = fs.readFileSync(path.join(__dirname, "../../src/Misc/mosquito_attack.ts"), "utf8");
const DISPATCH = fs.readFileSync(path.join(__dirname, "../../src/War/dispatch.ts"), "utf8");
const KIT = fs.readFileSync(path.join(__dirname, "../../src/War/kit.ts"), "utf8");

describe("roles/war audit round 2", () => {
    it("mosquito rows outlive their spawn count; the attack janitor owns ts<=0", () => {
        const at = MOSQ_MGR.indexOf("const keep = [];");
        const body = MOSQ_MGR.slice(at, MOSQ_MGR.indexOf("Memory.e.mosquito = keep", at));
        assert.notInclude(body, "u.ts <= 0) continue", "ts<=0 rows must not be dropped here");
        assert.include(body, "if (u.ts > 0)", "TTL applies only to unspawned rows");
        // renewal re-stamps `at` so a revived row is not TTL-reaped on sight
        const renew = MOSQ_ATK.indexOf("attack.ts++");
        assert.include(MOSQ_ATK.slice(renew, renew + 400), "attack.at = Game.time");
    });

    it("a full emergencyFeed carry delivers to the wrecked room, not the donor", () => {
        const at = CARRY.indexOf("if(creep.memory.full) {");
        const leg = CARRY.slice(at, at + 1600);
        assert.include(leg, "creep.memory.emergencyFeed || creep.memory.homeRoom");
        assert.include(leg, "moveToRoomAvoidEnemyRooms(deliverRoom)");
        // the storage-less fallback branch steers by deliverRoom too
        const noStorage = CARRY.indexOf("let bin;", at);
        assert.include(CARRY.slice(noStorage, noStorage + 700), "deliverRoom !== creep.room.name");
    });

    it("SquadCreepA seeds a targetPosition fallback before any dereference", () => {
        const runAt = SQUAD_A.indexOf("const run = function");
        const seedAt = SQUAD_A.indexOf('new RoomPosition(25, 25, creep.memory.homeRoom', runAt);
        assert.isAbove(seedAt, runAt, "no targetPosition seed in run()");
        // first dereference AFTER the seed line
        const derefAt = SQUAD_A.indexOf("creep.memory.targetPosition.roomName", seedAt);
        assert.isAbove(derefAt, seedAt, "no dereference found after the seed");
        assert.include(SQUAD_A.slice(runAt, seedAt), 'typeof creep.memory.targetPosition.roomName !== "string"');
    });

    it("bindSquadSlot treats a foreign-role self-bind as a dead slot", () => {
        const at = SQUAD_HELP.indexOf("const bindSquadSlot");
        const body = SQUAD_HELP.slice(at, at + 1600);
        assert.include(body, "live !== creep || creep.memory.role === role");
        assert.include(body, "delete creep.memory.squad[slot]");
    });

    it("energyMiner never calls isNearTo on an unresolved id", () => {
        const link = MINER.indexOf("creep.findClosestLink()");
        assert.include(MINER.slice(link, link + 700), "if(closestLink)");
        const srcDecl = MINER.indexOf("let source:any = Game.getObjectById(creep.memory.sourceId)");
        assert.include(MINER.slice(srcDecl, srcDecl + 200), "if(source && creep.pos.isNearTo(source))");
        const stored = MINER.indexOf("let storedSource:any = Game.getObjectById(creep.memory.sourceId)");
        assert.include(MINER.slice(stored, stored + 260), "storedSource && creep.pos.isNearTo(storedSource)");
    });

    it("upgrader fetch leg has no hole: storage of any kind withdraws", () => {
        const at = UPGRADER.indexOf("if(storage == undefined) {");
        const chain = UPGRADER.slice(at, at + 5200);
        assert.include(chain, "else if(storage) {");
        assert.include(chain, "ticksToDowngrade > 10000");
        // a trailing else withdraws for containers / downgrade urgency
        const innerElse = chain.indexOf("Hub container, or a real storage inside the downgrade");
        assert.isAbove(innerElse, -1, "no withdraw fallback for container/urgent storage");
        assert.include(chain.slice(innerElse, innerElse + 700), "creep.withdrawStorage(storage)");
    });

    it("ControllerLinkFiller re-picks a store-less memory.t target", () => {
        const at = CLF.indexOf("creep.memory._noSink = 0;");
        assert.include(CLF.slice(at, at + 700), "!target.store || target.store.getFreeCapacity");
    });

    it("mosquito kits pay the same travel budget their creeps walk", () => {
        const issue = DISPATCH.indexOf("withinTravelBudget(k.home, k.target)");
        assert.notInclude(DISPATCH.slice(Math.max(0, issue - 200), issue), 'k.kind !== "mosquito"');
        assert.include(KIT, "pickHome(target, 8, KIT_COST.mosquito)");
        assert.notInclude(KIT, "KIT_COST.mosquito, false");
        assert.include(MOSQ_MGR, "withinTravelBudget(myRoomName, roomName)");
    });

    it("SquadCreepA move_here_for_now requires a pos", () => {
        assert.include(SQUAD_A, "creep.memory.move_here_for_now.pos &&");
    });
});
