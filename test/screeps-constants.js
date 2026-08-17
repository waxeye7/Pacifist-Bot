/**
 * Screeps engine constants as VALUES, for tests.
 *
 * `@types/screeps` supplies the types but no runtime values, so requiring any
 * real bot module under Node dies at load time on the first top-level constant
 * — `Market/budget.ts` on RESOURCE_CATALYST, `Roles/energyMiner.ts` on
 * STRUCTURE_SPAWN, and so on. That is why test/unit/main.test.ts has never been
 * runnable and why the repo shipped with no unit tests that touch real code.
 *
 * Values are the engine's own (see screeps/engine `src/game/constants.js`).
 * Only add here; changing a value silently changes what every test means.
 */
const C = {};

// --- return codes ---------------------------------------------------------
C.OK = 0;
C.ERR_NOT_OWNER = -1;
C.ERR_NO_PATH = -2;
C.ERR_NAME_EXISTS = -3;
C.ERR_BUSY = -4;
C.ERR_NOT_FOUND = -5;
C.ERR_NOT_ENOUGH_ENERGY = -6;
C.ERR_NOT_ENOUGH_RESOURCES = -6;
C.ERR_INVALID_TARGET = -7;
C.ERR_FULL = -8;
C.ERR_NOT_IN_RANGE = -9;
C.ERR_INVALID_ARGS = -10;
C.ERR_TIRED = -11;
C.ERR_NO_BODYPART = -12;
C.ERR_NOT_ENOUGH_EXTENSIONS = -6;
C.ERR_RCL_NOT_ENOUGH = -14;
C.ERR_GCL_NOT_ENOUGH = -15;

// --- find -----------------------------------------------------------------
C.FIND_EXIT_TOP = 1;
C.FIND_EXIT_RIGHT = 3;
C.FIND_EXIT_BOTTOM = 5;
C.FIND_EXIT_LEFT = 7;
C.FIND_EXIT = 10;
C.FIND_CREEPS = 101;
C.FIND_MY_CREEPS = 102;
C.FIND_HOSTILE_CREEPS = 103;
C.FIND_SOURCES_ACTIVE = 104;
C.FIND_SOURCES = 105;
C.FIND_DROPPED_RESOURCES = 106;
C.FIND_STRUCTURES = 107;
C.FIND_MY_STRUCTURES = 108;
C.FIND_HOSTILE_STRUCTURES = 109;
C.FIND_FLAGS = 110;
C.FIND_CONSTRUCTION_SITES = 111;
C.FIND_MY_SPAWNS = 112;
C.FIND_HOSTILE_SPAWNS = 113;
C.FIND_MY_CONSTRUCTION_SITES = 114;
C.FIND_HOSTILE_CONSTRUCTION_SITES = 115;
C.FIND_MINERALS = 116;
C.FIND_NUKES = 117;
C.FIND_TOMBSTONES = 118;
C.FIND_POWER_CREEPS = 119;
C.FIND_MY_POWER_CREEPS = 120;
C.FIND_HOSTILE_POWER_CREEPS = 121;
C.FIND_DEPOSITS = 122;
C.FIND_RUINS = 123;

// --- look -----------------------------------------------------------------
C.LOOK_CREEPS = "creep";
C.LOOK_ENERGY = "energy";
C.LOOK_RESOURCES = "resource";
C.LOOK_TERRAIN = "terrain";
C.LOOK_STRUCTURES = "structure";
C.LOOK_FLAGS = "flag";
C.LOOK_CONSTRUCTION_SITES = "constructionSite";
C.LOOK_NUKES = "nuke";
C.LOOK_TOMBSTONES = "tombstone";
C.LOOK_POWER_CREEPS = "powerCreep";
C.LOOK_DEPOSITS = "deposit";
C.LOOK_RUINS = "ruin";

// --- directions -----------------------------------------------------------
C.TOP = 1; C.TOP_RIGHT = 2; C.RIGHT = 3; C.BOTTOM_RIGHT = 4;
C.BOTTOM = 5; C.BOTTOM_LEFT = 6; C.LEFT = 7; C.TOP_LEFT = 8;

// --- terrain --------------------------------------------------------------
C.TERRAIN_MASK_WALL = 1;
C.TERRAIN_MASK_SWAMP = 2;
C.TERRAIN_MASK_LAVA = 4;

// --- body parts -----------------------------------------------------------
C.MOVE = "move";
C.WORK = "work";
C.CARRY = "carry";
C.ATTACK = "attack";
C.RANGED_ATTACK = "ranged_attack";
C.TOUGH = "tough";
C.HEAL = "heal";
C.CLAIM = "claim";
C.BODYPART_COST = {
  move: 50, work: 100, attack: 80, carry: 50,
  heal: 250, ranged_attack: 150, tough: 10, claim: 600,
};
C.MAX_CREEP_SIZE = 50;
C.CREEP_LIFE_TIME = 1500;
C.CREEP_CLAIM_LIFE_TIME = 600;

// --- structures -----------------------------------------------------------
C.STRUCTURE_SPAWN = "spawn";
C.STRUCTURE_EXTENSION = "extension";
C.STRUCTURE_ROAD = "road";
C.STRUCTURE_WALL = "constructedWall";
C.STRUCTURE_RAMPART = "rampart";
C.STRUCTURE_KEEPER_LAIR = "keeperLair";
C.STRUCTURE_PORTAL = "portal";
C.STRUCTURE_CONTROLLER = "controller";
C.STRUCTURE_LINK = "link";
C.STRUCTURE_STORAGE = "storage";
C.STRUCTURE_TOWER = "tower";
C.STRUCTURE_OBSERVER = "observer";
C.STRUCTURE_POWER_BANK = "powerBank";
C.STRUCTURE_POWER_SPAWN = "powerSpawn";
C.STRUCTURE_EXTRACTOR = "extractor";
C.STRUCTURE_LAB = "lab";
C.STRUCTURE_TERMINAL = "terminal";
C.STRUCTURE_CONTAINER = "container";
C.STRUCTURE_NUKER = "nuker";
C.STRUCTURE_FACTORY = "factory";
C.STRUCTURE_INVADER_CORE = "invaderCore";

// --- capacities / limits --------------------------------------------------
C.SPAWN_ENERGY_START = 300;
C.SPAWN_ENERGY_CAPACITY = 300;
C.EXTENSION_ENERGY_CAPACITY = { 0: 50, 1: 50, 2: 50, 3: 50, 4: 50, 5: 50, 6: 50, 7: 100, 8: 200 };
C.TOWER_CAPACITY = 1000;
C.LINK_CAPACITY = 800;
C.STORAGE_CAPACITY = 1000000;
C.TERMINAL_CAPACITY = 300000;
C.CONTAINER_CAPACITY = 2000;
C.RAMPART_DECAY_AMOUNT = 300;
C.RAMPART_DECAY_TIME = 100;
C.CONTROLLER_DOWNGRADE = {
  1: 20000, 2: 10000, 3: 20000, 4: 40000,
  5: 80000, 6: 120000, 7: 150000, 8: 200000,
};
C.CONTROLLER_STRUCTURES = {
  spawn: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 3 },
  extension: { 0: 0, 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 },
  link: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3, 7: 4, 8: 6 },
  road: { 0: 2500, 1: 2500, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
  constructedWall: { 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
  rampart: { 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
  storage: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
  tower: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 },
  observer: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
  powerSpawn: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
  extractor: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
  terminal: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
  lab: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 3, 7: 6, 8: 10 },
  container: { 0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5 },
  nuker: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
  factory: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 1 },
};

// --- resources ------------------------------------------------------------
C.RESOURCE_ENERGY = "energy";
C.RESOURCE_POWER = "power";
C.RESOURCE_OPS = "ops";
C.RESOURCE_HYDROGEN = "H";
C.RESOURCE_OXYGEN = "O";
C.RESOURCE_UTRIUM = "U";
C.RESOURCE_LEMERGIUM = "L";
C.RESOURCE_KEANIUM = "K";
C.RESOURCE_ZYNTHIUM = "Z";
C.RESOURCE_CATALYST = "X";
C.RESOURCE_GHODIUM = "G";
C.RESOURCE_SILICON = "silicon";
C.RESOURCE_METAL = "metal";
C.RESOURCE_BIOMASS = "biomass";
C.RESOURCE_MIST = "mist";
C.RESOURCE_HYDROXIDE = "OH";
C.RESOURCE_ZYNTHIUM_KEANITE = "ZK";
C.RESOURCE_UTRIUM_LEMERGITE = "UL";
[
  ["RESOURCE_UTRIUM_HYDRIDE", "UH"], ["RESOURCE_UTRIUM_OXIDE", "UO"],
  ["RESOURCE_KEANIUM_HYDRIDE", "KH"], ["RESOURCE_KEANIUM_OXIDE", "KO"],
  ["RESOURCE_LEMERGIUM_HYDRIDE", "LH"], ["RESOURCE_LEMERGIUM_OXIDE", "LO"],
  ["RESOURCE_ZYNTHIUM_HYDRIDE", "ZH"], ["RESOURCE_ZYNTHIUM_OXIDE", "ZO"],
  ["RESOURCE_GHODIUM_HYDRIDE", "GH"], ["RESOURCE_GHODIUM_OXIDE", "GO"],
  ["RESOURCE_UTRIUM_ACID", "UH2O"], ["RESOURCE_UTRIUM_ALKALIDE", "UHO2"],
  ["RESOURCE_KEANIUM_ACID", "KH2O"], ["RESOURCE_KEANIUM_ALKALIDE", "KHO2"],
  ["RESOURCE_LEMERGIUM_ACID", "LH2O"], ["RESOURCE_LEMERGIUM_ALKALIDE", "LHO2"],
  ["RESOURCE_ZYNTHIUM_ACID", "ZH2O"], ["RESOURCE_ZYNTHIUM_ALKALIDE", "ZHO2"],
  ["RESOURCE_GHODIUM_ACID", "GH2O"], ["RESOURCE_GHODIUM_ALKALIDE", "GHO2"],
  ["RESOURCE_CATALYZED_UTRIUM_ACID", "XUH2O"], ["RESOURCE_CATALYZED_UTRIUM_ALKALIDE", "XUHO2"],
  ["RESOURCE_CATALYZED_KEANIUM_ACID", "XKH2O"], ["RESOURCE_CATALYZED_KEANIUM_ALKALIDE", "XKHO2"],
  ["RESOURCE_CATALYZED_LEMERGIUM_ACID", "XLH2O"], ["RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE", "XLHO2"],
  ["RESOURCE_CATALYZED_ZYNTHIUM_ACID", "XZH2O"], ["RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE", "XZHO2"],
  ["RESOURCE_CATALYZED_GHODIUM_ACID", "XGH2O"], ["RESOURCE_CATALYZED_GHODIUM_ALKALIDE", "XGHO2"],
].forEach(function (p) { C[p[0]] = p[1]; });

// --- misc -----------------------------------------------------------------
C.SUBSCRIPTION_TOKEN = "token";
C.PIXEL = "pixel";
C.ACCESS_KEY = "accessKey";
C.EFFECT_INVULNERABILITY = 1001;
C.EFFECT_COLLAPSE_TIMER = 1002;
C.PWR_DISRUPT_SPAWN = 3;
C.PWR_OPERATE_SPAWN = 9;
C.POWER_INFO = {};
C.REACTIONS = {};
C.BOOSTS = {};
C.COMMODITIES = {};
C.INTERSHARD_RESOURCES = ["token", "cpuUnlock", "pixel", "accessKey"];
C.RESOURCES_ALL = ["energy", "power", "H", "O", "U", "L", "K", "Z", "X", "G"];

/**
 * Minimal stand-ins for the engine's global CLASSES.
 *
 * The bot augments prototypes at module load (`Creep.prototype.moveToRoom = ...`
 * in Functions/creepFunctions, and friends), so those names have to exist as
 * constructors before any src/ module is required — otherwise the require dies
 * with "Room is not defined" before a single test runs.
 *
 * These are stubs, NOT a simulator: they make module loading succeed so pure
 * functions can be tested. A test that needs real engine behaviour must build
 * the objects it needs itself (see test/unit/bankReserve.test.ts, which hands in
 * plain object literals). Do not grow these into a fake game — that road ends in
 * tests that pass against the fake and fail against Screeps.
 */
function stubClasses(g) {
  function defineClass(name, proto) {
    if (g[name] !== undefined) return;
    const Klass = function () {};
    if (proto) Object.assign(Klass.prototype, proto);
    g[name] = Klass;
  }

  defineClass("RoomObject");
  defineClass("Structure");
  defineClass("OwnedStructure");
  defineClass("Creep");
  defineClass("PowerCreep");
  defineClass("Spawn");
  defineClass("StructureSpawn");
  defineClass("Source");
  defineClass("Mineral");
  defineClass("Resource");
  defineClass("ConstructionSite");
  defineClass("Flag");
  defineClass("Store");
  defineClass("Nuke");
  defineClass("Tombstone");
  defineClass("Ruin");
  defineClass("Deposit");
  for (const t of [
    "Container", "Controller", "Extension", "Extractor", "Factory", "InvaderCore",
    "KeeperLair", "Lab", "Link", "Nuker", "Observer", "PowerBank", "PowerSpawn",
    "Portal", "Rampart", "Road", "Storage", "Terminal", "Tower", "Wall",
  ]) {
    defineClass("Structure" + t);
  }

  if (g.RoomPosition === undefined) {
    g.RoomPosition = function (x, y, roomName) {
      this.x = x;
      this.y = y;
      this.roomName = roomName;
    };
  }

  if (g.Room === undefined) {
    g.Room = function () {};
    // Room.Terrain is a nested constructor on the real Room; terrain lookups
    // return "plain" so a caller gets a usable answer instead of a crash.
    g.Room.Terrain = function () {};
    g.Room.Terrain.prototype.get = function () { return 0; };
    g.Room.serializePath = function (p) { return p; };
    g.Room.deserializePath = function (p) { return p; };
  }

  if (g.RoomVisual === undefined) {
    const noop = function () { return this; };
    g.RoomVisual = function () {};
    for (const m of ["line", "circle", "rect", "poly", "text", "clear", "getSize"]) {
      g.RoomVisual.prototype[m] = noop;
    }
  }

  if (g.PathFinder === undefined) {
    g.PathFinder = {
      search: function () { return { path: [], ops: 0, cost: 0, incomplete: true }; },
      use: function () {},
      CostMatrix: function () {
        this._bits = new Uint8Array(2500);
        this.set = function (x, y, v) { this._bits[y * 50 + x] = v; };
        this.get = function (x, y) { return this._bits[y * 50 + x]; };
        this.clone = function () {
          const m = new g.PathFinder.CostMatrix();
          m._bits.set(this._bits);
          return m;
        };
        this.serialize = function () { return Array.from(this._bits); };
      },
    };
  }

  if (g.Game === undefined) {
    g.Game = {
      time: 1,
      creeps: {}, rooms: {}, spawns: {}, structures: {}, flags: {},
      constructionSites: {}, powerCreeps: {},
      cpu: { limit: 20, bucket: 10000, tickLimit: 500, getUsed: function () { return 0; } },
      gcl: { level: 1, progress: 0, progressTotal: 1000 },
      gpl: { level: 0, progress: 0, progressTotal: 1000 },
      market: { credits: 0, orders: {}, incomingTransactions: [], outgoingTransactions: [] },
      map: {
        getRoomLinearDistance: function () { return 1; },
        describeExits: function () { return {}; },
        getRoomStatus: function () { return { status: "normal" }; },
        findRoute: function () { return []; },
        visual: { line: function () {}, text: function () {}, circle: function () {}, rect: function () {}, poly: function () {} },
      },
      getObjectById: function () { return null; },
      notify: function () {},
    };
  }
  if (g.Memory === undefined) g.Memory = {};
  if (g.RawMemory === undefined) {
    g.RawMemory = {
      segments: {}, _parsed: g.Memory,
      get: function () { return "{}"; }, set: function () {},
      setActiveSegments: function () {}, setActiveForeignSegment: function () {},
    };
  }
}

/** Install every constant (and the class stubs) as globals, as the game VM does. */
function install(target) {
  const g = target || global;
  for (const k in C) {
    if (g[k] === undefined) g[k] = C[k];
  }
  stubClasses(g);
  return C;
}

module.exports = { constants: C, install };
