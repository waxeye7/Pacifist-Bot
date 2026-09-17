/**
 * Turtle at home is a prerequisite for the doctrine (AGGRESSION-DOCTRINE §4.7).
 * Live shard3 RCL4-6: a solo attacker never triggered a defender or a safe
 * mode, and a 50-energy scout closed every remote.
 */
import { assert } from "chai";
import * as fs from "fs";
import { hostileIsThreat, shellBreached } from "../../src/Rooms/rooms.defence";

function creep(owner: string, parts: string[]): any {
  return { owner: { username: owner }, body: parts.map((type) => ({ type, hits: 100 })) };
}

describe("defence: what counts as danger", () => {
  it("a MOVE-only scout is not a threat; an invader always is", () => {
    assert.isFalse(hostileIsThreat(creep("someone", [MOVE, MOVE])));
    assert.isFalse(hostileIsThreat(creep("someone", [MOVE, CARRY, CARRY])));
    assert.isTrue(hostileIsThreat(creep("Invader", [MOVE])));
  });

  it("attack, ranged, work, claim and heal parts are threats", () => {
    for (const p of [ATTACK, RANGED_ATTACK, WORK, CLAIM, HEAL]) {
      assert.isTrue(hostileIsThreat(creep("someone", [MOVE, p])), p);
    }
  });

  it("dead parts do not count", () => {
    const c = creep("someone", [MOVE, ATTACK]);
    c.body[1].hits = 0;
    assert.isFalse(hostileIsThreat(c));
  });
});

describe("defence: solo-breach safe mode", () => {
  it("decay never trips it; a dismantler does", () => {
    assert.isFalse(shellBreached(3000, 2700), "300 hits of decay");
    assert.isFalse(shellBreached(0, 0), "no shell, nothing to breach");
    assert.isTrue(shellBreached(3000, 1000));
    assert.isFalse(shellBreached(100000, 90000), "10% is under the 15% bar");
    assert.isTrue(shellBreached(100000, 80000));
  });

  it("the safe-mode arm has a wave arm and a solo arm, both threat-filtered", () => {
    const src = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.defence.ts", "utf8").replace(/\r\n/g, "\n");
    assert.include(src, "const wave = enemyCreepsInRoom.length >= 2 && room.memory.danger_timer >= 50;");
    assert.include(src, "const solo = enemyCreepsInRoom.length >= 1 && shellBreachedSinceDanger(room);");
    assert.include(src, 'c.owner.username !== "Invader" && hostileIsThreat(c)');
    assert.include(src, "if(!room.memory.danger) {");
    assert.include(src, "room.memory.shellMinAtDanger = perimeterMinHits(room);");
  });

  it("the defender rung no longer needs two fillers, a 10k bank or range 14", () => {
    const src = fs.readFileSync(__dirname + "/../../src/Rooms/rooms.spawning.ts", "utf8").replace(/\r\n/g, "\n");
    assert.include(src, "room.memory.danger_timer >= 20 && fillers >= 1 && storage &&\n        (storage.store[RESOURCE_ENERGY] > 5000");
    assert.include(src, "storage.pos.findClosestByRange(HostileCreeps)) <= 30");
    assert.include(src, "storage.store[RESOURCE_ENERGY] > 10000 && shellThin", "RCL6 repair rung reachable off a 10k bank");
  });
});
