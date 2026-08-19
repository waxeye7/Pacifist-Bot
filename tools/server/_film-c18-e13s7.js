db = db.getSiblingDB("screeps");
var CAND = ["E5S3", "E12S3", "E18S9", "E11S6", "E16S9", "E18S5", "E12S1", "E13S7"];
var CTRL = ["E9S1", "E13S9", "E8S5", "E8S3", "E4S7", "E6S1", "E3S5", "E21S4"];
function partsOf(body) {
  var m = {};
  if (!body) return m;
  for (var i = 0; i < body.length; i++) {
    var p = body[i];
    var t = typeof p === "string" ? p : p && p.type;
    if (!t) continue;
    t = String(t).toLowerCase();
    m[t] = (m[t] || 0) + 1;
  }
  return m;
}
function bodyStr(parts) {
  var order = ["work", "carry", "move", "attack", "ranged_attack", "heal", "claim", "tough"];
  var out = [];
  for (var i = 0; i < order.length; i++) {
    var k = order[i];
    if (parts[k]) out.push(parts[k] + k[0].toUpperCase());
  }
  return out.join("") || "?";
}
function filmCreep(o) {
  var parts = partsOf(o.body);
  var mem = o.memory || {};
  var name = String(o.name || "");
  return {
    name: name,
    role: name.split("-")[0] || "?",
    xy: o.x + "," + o.y,
    spawning: !!o.spawning,
    body: bodyStr(parts),
    parts: parts,
    e: (o.store && o.store.energy) || o.energy || 0,
    fat: o.fatigue || 0,
    ttl: o.ageTime || null,
    suicide: mem.suicide === true,
    sourceId: mem.sourceId || null,
    targetRoom: mem.targetRoom || null,
    homeRoom: mem.homeRoom || null,
    roleMem: mem.role || null,
    building: mem.building || mem.build || null,
    locked: mem.locked || mem.lock || mem.target || null,
    task: mem.task || mem.Job || null,
  };
}
function filmDeep(room) {
  var objs = db["rooms.objects"].find({ room: room, type: { $ne: "energy" } }).toArray();
  var drops = db["rooms.objects"].find({ room: room, type: "energy" }).toArray();
  var ctrl = null, spawn = null, tower = null, storage = null, mineral = null;
  var ext = [], roads = [], boxes = [], walls = [], ramps = [];
  var sites = [], creeps = [], sources = [];
  var typeN = {};
  for (var i = 0; i < objs.length; i++) {
    var o = objs[i];
    typeN[o.type] = (typeN[o.type] || 0) + 1;
    if (o.type === "controller") ctrl = o;
    else if (o.type === "spawn") spawn = o;
    else if (o.type === "tower") tower = o;
    else if (o.type === "storage") storage = o;
    else if (o.type === "mineral") mineral = o;
    else if (o.type === "extension") ext.push({ xy: o.x + "," + o.y, e: (o.store && o.store.energy) || o.energy || 0 });
    else if (o.type === "road") roads.push({ xy: o.x + "," + o.y, hits: o.hits || 0, max: o.hitsMax || 0 });
    else if (o.type === "container") boxes.push({ xy: o.x + "," + o.y, e: (o.store && o.store.energy) || o.energy || 0 });
    else if (o.type === "constructedWall") walls.push(o.x + "," + o.y);
    else if (o.type === "rampart") ramps.push({ xy: o.x + "," + o.y, hits: o.hits || 0, user: o.user || null });
    else if (o.type === "source") sources.push({ id: String(o._id), xy: o.x + "," + o.y, e: o.energy || 0, cap: o.energyCapacity || 0 });
    else if (o.type === "constructionSite") {
      sites.push({
        st: o.structureType || "?",
        xy: o.x + "," + o.y,
        p: o.progress || 0,
        t: o.progressTotal || 0,
        user: o.user || null,
      });
    } else if (o.type === "creep") creeps.push(filmCreep(o));
  }
  var dropE = 0;
  var dropTiles = [];
  for (var d = 0; d < drops.length; d++) {
    dropE += drops[d].energy || 0;
    if ((drops[d].energy || 0) > 0) dropTiles.push({ xy: drops[d].x + "," + drops[d].y, e: drops[d].energy || 0 });
  }
  var siteBy = {};
  var siteProg = {};
  for (var s = 0; s < sites.length; s++) {
    var st = sites[s].st;
    siteBy[st] = (siteBy[st] || 0) + 1;
    if (!siteProg[st]) siteProg[st] = { p: 0, t: 0, n: 0 };
    siteProg[st].p += sites[s].p;
    siteProg[st].t += sites[s].t;
    siteProg[st].n++;
  }
  var roles = {};
  for (var c = 0; c < creeps.length; c++) roles[creeps[c].role] = (roles[creeps[c].role] || 0) + 1;
  return {
    room: room,
    user: ctrl && ctrl.user,
    L: ctrl && ctrl.level,
    p: ctrl && ctrl.progress,
    ttd: ctrl && ctrl.ticksToDowngrade,
    ctrl: ctrl ? ctrl.x + "," + ctrl.y : null,
    spawn: spawn ? spawn.x + "," + spawn.y : null,
    spawnE: spawn ? ((spawn.store && spawn.store.energy) || spawn.energy || 0) : 0,
    spawning: spawn && spawn.spawning ? spawn.spawning : null,
    extN: ext.length,
    ext: ext,
    cap: 300 + ext.length * 50,
    roadsN: roads.length,
    roads: roads,
    boxes: boxes,
    tower: tower
      ? { xy: tower.x + "," + tower.y, e: (tower.store && tower.store.energy) || tower.energy || 0, user: tower.user || null }
      : null,
    storageStand: storage
      ? {
          xy: storage.x + "," + storage.y,
          e: (storage.store && storage.store.energy) || storage.energy || 0,
          user: storage.user || null,
          my: !!(storage.user && ctrl && storage.user === ctrl.user),
          hits: storage.hits || 0,
        }
      : null,
    wallsN: walls.length,
    walls: walls,
    rampsN: ramps.length,
    ramps: ramps,
    sources: sources,
    sitesN: sites.length,
    siteBy: siteBy,
    siteProg: siteProg,
    sites: sites,
    creepsN: creeps.length,
    roles: roles,
    creeps: creeps,
    dropE: dropE,
    dropTiles: dropTiles,
    typeN: typeN,
    mineral: mineral ? { xy: mineral.x + "," + mineral.y, mineralType: mineral.mineralType } : null,
  };
}
function filmLite(room) {
  var d = filmDeep(room);
  return {
    room: d.room,
    user: d.user,
    L: d.L,
    p: d.p,
    ttd: d.ttd,
    extN: d.extN,
    cap: d.cap,
    roadsN: d.roadsN,
    wallsN: d.wallsN,
    rampsN: d.rampsN,
    boxesN: d.boxes.length,
    tower: !!d.tower,
    storageStand: !!d.storageStand,
    sitesN: d.sitesN,
    siteBy: d.siteBy,
    roles: d.roles,
    creepsN: d.creepsN,
    miners: d.creeps
      .filter(function (c) {
        return c.role === "EnergyMiner";
      })
      .map(function (c) {
        return { body: c.body, xy: c.xy, home: c.homeRoom, tgt: c.targetRoom, src: c.sourceId, sp: c.spawning };
      }),
    builders: d.creeps
      .filter(function (c) {
        return c.role === "Builder" || c.role === "builder";
      })
      .map(function (c) {
        return { body: c.body, xy: c.xy, e: c.e, suicide: c.suicide, locked: c.locked, building: c.building };
      }),
  };
}
var env = db.env.findOne({ _id: "gameTime" }) || db.env.findOne({ key: "gameTime" });
var envAll = db.env.find().limit(20).toArray().map(function (e) { return { id: e._id, k: e.key, v: e.value }; });
print(
  "__E13__" +
    JSON.stringify({
      envGameTime: env,
      envAll: envAll,
      e13s7: filmDeep("E13S7"),
      e21s4: filmLite("E21S4"),
      cand: CAND.map(filmLite),
      ctrl: CTRL.map(filmLite),
    })
);
