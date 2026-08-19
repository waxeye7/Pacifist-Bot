var out = { t: Game.time, abort: [], retask: [], convert: [], suicide: [], queues: [] };
var rooms = ["E37N59", "E36N57", "E37N58", "E39N58"];
var i, n, c, name, r, keep, leftovers, rm, sites, list, items;

if (!Memory.features) Memory.features = {};
Memory.features.expandMinRcl = 7;
Memory.features.autoExpand = false;
delete Memory.autoExpand;
Memory.target_colonise = {};
delete Memory.spawnRescue;
delete Memory._spawnEmergency;

for (i = 0; i < rooms.length; i++) {
  n = rooms[i];
  if (typeof migrateAbort === "function") {
    out.abort.push(String(migrateAbort(n)));
  } else if (Game.rooms[n]) {
    Game.rooms[n].memory.planMigration = { mode: "disarmed", since: Game.time, by: "live-fix" };
    out.abort.push(n + ": manual disarm");
  }
}
if (typeof stopExpand === "function") out.abort.push(String(stopExpand()));
if (typeof warDispatch === "function") out.abort.push(String(warDispatch(false)));

var builders = [];
for (name in Game.creeps) {
  c = Game.creeps[name];
  if (!c || !c.memory) continue;
  if (c.memory.role === "builder" || c.memory.role === "buildcontainer") builders.push(c);
}

keep = { E37N59: [], E36N57: [], E37N58: [], E39N58: [] };
for (i = 0; i < builders.length; i++) {
  c = builders[i];
  rm = c.room.name;
  if (keep[rm] && keep[rm].length < 4) {
    keep[rm].push(c);
    c._keep = true;
  }
}
leftovers = [];
for (i = 0; i < builders.length; i++) if (!builders[i]._keep) leftovers.push(builders[i]);
for (i = 0; i < rooms.length; i++) {
  rm = rooms[i];
  r = Game.rooms[rm];
  if (!r) continue;
  sites = r.find(FIND_MY_CONSTRUCTION_SITES);
  if (!sites.length) continue;
  while (keep[rm].length < 4 && leftovers.length) {
    c = leftovers.shift();
    c._keep = true;
    keep[rm].push(c);
  }
}

for (rm in keep) {
  list = keep[rm];
  for (i = 0; i < list.length; i++) {
    c = list[i];
    c.memory.role = "builder";
    c.memory.homeRoom = rm;
    c.memory.targetRoom = rm;
    delete c.memory.locked;
    delete c.memory.suicide;
    delete c.memory.fill;
    delete c.memory.building;
    out.retask.push(c.name + "->" + rm);
  }
}

var converted = { E37N59: 0, E36N57: 0, E37N58: 0, E39N58: 0 };
for (i = 0; i < builders.length; i++) {
  c = builders[i];
  if (c._keep) continue;
  rm = c.room.name;
  if (c.getActiveBodyparts(CARRY) > 0 && converted[rm] !== undefined && converted[rm] < 4) {
    c.memory.role = "carry";
    c.memory.homeRoom = rm;
    delete c.memory.locked;
    delete c.memory.suicide;
    delete c.memory.fill;
    delete c.memory.building;
    delete c.memory.targetRoom;
    converted[rm]++;
    out.convert.push(c.name + " carry@" + rm);
  } else {
    out.suicide.push(c.name + "@" + c.room.name);
    c.suicide();
  }
}

function restack(roomName, want) {
  r = Game.rooms[roomName];
  if (!r) return;
  var q = [];
  for (var k = 0; k < want.length; k++) {
    q.push(want[k].body, want[k].name, { memory: want[k].memory });
  }
  r.memory.spawn_list = q;
  r.memory.spawnStall = 0;
  delete r.memory.spawnStallName;
  out.queues.push(roomName + ":" + want.map(function (x) { return x.memory.role; }).join(","));
}

function countIn(roomName, role) {
  var n = 0;
  for (var nm in Game.creeps) {
    var cr = Game.creeps[nm];
    if (cr && cr.room.name === roomName && cr.memory.role === role) n++;
  }
  return n;
}

r = Game.rooms.E37N59;
if (r) {
  items = [];
  if (countIn("E37N59", "EnergyMiner") < 2) {
    items.push({ body: [WORK, WORK, MOVE], name: "EnergyMiner-fix-" + Game.time + "-E37N59", memory: { role: "EnergyMiner", homeRoom: "E37N59" } });
  }
  if (countIn("E37N59", "filler") < 1 && countIn("E37N59", "Filler") < 1) {
    items.push({ body: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], name: "filler-fix-" + Game.time + "-E37N59", memory: { role: "filler", homeRoom: "E37N59" } });
  }
  restack("E37N59", items);
}

r = Game.rooms.E36N57;
if (r) {
  items = [];
  if (countIn("E36N57", "EnergyMiner") < 2) {
    items.push({ body: [WORK, WORK, MOVE], name: "EnergyMiner-fixa-" + Game.time + "-E36N57", memory: { role: "EnergyMiner", homeRoom: "E36N57" } });
    items.push({ body: [WORK, WORK, MOVE], name: "EnergyMiner-fixb-" + Game.time + "-E36N57", memory: { role: "EnergyMiner", homeRoom: "E36N57" } });
  }
  items.push({ body: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], name: "Carrier-fixa-" + Game.time + "-E36N57", memory: { role: "carry", homeRoom: "E36N57" } });
  items.push({ body: [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], name: "Carrier-fixb-" + Game.time + "-E36N57", memory: { role: "carry", homeRoom: "E36N57" } });
  restack("E36N57", items);
}

out.kept = { E37N59: keep.E37N59.length, E36N57: keep.E36N57.length, E37N58: keep.E37N58.length, E39N58: keep.E39N58.length };
out.suicided = out.suicide.length;
out.converted = out.convert.length;
out.expandMinRcl = Memory.features.expandMinRcl;
out.bucket = Game.cpu.bucket;
return out;
