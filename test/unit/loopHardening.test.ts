import { assert } from "chai";
import fs from "fs";
import { recordTick } from "../../src/utils/Bench";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const commands = strip(fs.readFileSync("src/utils/Commands.ts", "utf8"));
const labs = strip(fs.readFileSync("src/Rooms/rooms.labs.ts", "utf8"));
const mosquito = strip(fs.readFileSync("src/Misc/mosquito_attack.ts", "utf8"));
const main = strip(fs.readFileSync("src/main.ts", "utf8"));
const speedrun = strip(fs.readFileSync("src/utils/Speedrun.ts", "utf8"));
const construction = strip(fs.readFileSync("src/Rooms/rooms.construction.ts", "utf8"));
const planV2 = strip(fs.readFileSync("src/utils/PlanV2.ts", "utf8"));

describe("loop hardening — cleared memory and decorative gates", () => {
  it("spawnConvoy seeds spawn_list before pushing", () => {
    const body = commands.slice(commands.indexOf("global.spawnConvoy"), commands.indexOf("global.spawnSafeModer"));
    const pushAt = body.indexOf("spawn_list.push");
    const seedAt = body.indexOf("spawn_list = []");
    assert.isAbove(seedAt, -1, "spawnConvoy never seeds spawn_list");
    assert.isBelow(seedAt, pushAt, "seed must precede the push");
  });

  it("spawnSafeModer seeds spawn_list before pushing", () => {
    const body = commands.slice(commands.indexOf("global.spawnSafeModer"), commands.indexOf("global.SS ="));
    const pushAt = body.indexOf("spawn_list.push");
    const seedAt = body.indexOf("spawn_list = []");
    assert.isAbove(seedAt, -1, "spawnSafeModer never seeds spawn_list");
    assert.isBelow(seedAt, pushAt, "seed must precede the push");
  });

  it("labs: reaction loop + pause timers are not gated on bucket > 4500", () => {
    assert.notInclude(labs, "Game.cpu.bucket > 4500");
  });

  it("mosquito_attack heals a Memory.e that lacks .mosquito", () => {
    const seed = mosquito.indexOf("Memory.e = {mosquito: []}");
    const heal = mosquito.indexOf("Memory.e.mosquito = []");
    const iter = mosquito.indexOf("for (let attack of Memory.e.mosquito)");
    assert.isAbove(heal, seed, "no .mosquito heal after the Memory.e seed");
    assert.isBelow(heal, iter, "heal must precede the for..of");
  });

  it("recordTick and the speedrun tracker run inside phase() containment", () => {
    assert.include(main, 'phase("bench", () => recordTick(tickCpu))');
    assert.include(main, 'phase("speedrun"');
  });

  it("spawn_mosquito returns false on an unseen homeRoom instead of throwing", () => {
    const body = commands.slice(commands.indexOf("global.spawn_mosquito"), commands.indexOf("let nonSpawningSpawn"));
    assert.include(body, "if (!room) return false");
  });

  it("SPK requires vision of the target room and ownership of homeRoom", () => {
    const body = commands.slice(commands.indexOf("global.SPK"), commands.indexOf("let meleeBody"));
    assert.include(body, "Game.rooms[targetRoomName]");
    assert.include(body, "controller.my");
  });

  it("SDM survives a missing Memory.CPU.fiveHundredTickAvg", () => {
    const gate = commands.slice(commands.indexOf("global.SDM"), commands.indexOf("let billtongs"));
    assert.include(gate, "Memory.CPU &&");
    assert.include(gate, "Memory.CPU.fiveHundredTickAvg &&");
  });

  it("speedrun room clock heals a primitive room.memory.speedrun", () => {
    assert.include(speedrun, 'typeof room.memory.speedrun !== "object"');
  });

  it("nuke rampart ring is skipped when the room has no storage anchor", () => {
    assert.include(construction, "nukes.length > 4 && storage");
  });

  it("checkerboard is chosen per room, not leaked across rooms", () => {
    assert.include(construction, "let checkerboard = CHECKERBOARD_BASE");
    // the module-level name is no longer the mutable shared one
    const top = construction.slice(0, construction.indexOf("function construction"));
    assert.include(top, "CHECKERBOARD_BASE");
    assert.notInclude(top, "let checkerboard");
  });

  it("keepTheseRoads keeps roads under ramparts — the paver's third class", () => {
    const block = planV2.slice(planV2.indexOf("for (const p of plan.t.road"), planV2.indexOf("room.memory.keepTheseRoads = keep"));
    const keep = block.indexOf("roadTiles[packed] || ramparted[packed]");
    assert.isAbove(keep, -1, "ramparted tiles missing from the road keep rule");
    // ramparted must be fully populated before the road pass runs
    const build = block.indexOf('if (s.structureType === STRUCTURE_RAMPART) ramparted');
    const pass = block.indexOf('if (s.structureType === STRUCTURE_ROAD)');
    assert.isBelow(build, pass, "rampart pre-pass must precede the road keep loop");
  });
});

describe("Bench per-key sample heal", () => {
  const g: any = global;

  it("recordTick heals a deleted samples key instead of throwing", () => {
    const prevMem = g.Memory, prevGame = g.Game;
    g.Memory = { bench: { profile: "optimized", samples: {}, opts: {}, auto: false, recent: [] } };
    g.Game = { time: 1, cpu: { getUsed: () => 0 } };
    try {
      recordTick(1.5);
      assert.equal(g.Memory.bench.samples.optimized.n, 1);
      recordTick(2.0);
      assert.equal(g.Memory.bench.samples.optimized.n, 2);
      assert.equal(g.Memory.bench.samples.optimized.max, 2.0);
    } finally {
      g.Memory = prevMem; g.Game = prevGame;
    }
  });
});
