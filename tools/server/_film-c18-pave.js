db = db.getSiblingDB("screeps");
var CAND = ["E5S3", "E12S3", "E18S9", "E11S6", "E16S9", "E18S5", "E12S1", "E13S7"];
function partsOf(body) {
  var m = {};
  if (!body) return m;
  for (var i = 0; i < body.length; i++) {
    var p = body[i];
    var t = typeof p === "string" ? p : (p && p.type);
    if (!t) continue;
    t = String(t).toLowerCase();
    m[t] = (m[t] || 0) + 1;
  }
  return m;
}
function bodyStr(parts) {
  var order = ["work", "carry", "move"];
  var out = [];
  for (var i = 0; i < order.length; i++) {
    var k = order[i];
    if (parts[k]) out.push(parts[k] + k[0].toUpperCase());
  }
  return out.join("") || "?";
}
function film(room) {
  var objs = db["rooms.objects"].find({ room: room, type: { $ne: "energy" } }).toArray();
  var drops = db["rooms.objects"].find({ room: room, type: "energy" }).toArray();
  var ctrl = null, spawn = null, tower = null;
  var ext = [], roads = [], roadSites = [], otherSites = [], boxes = [];
  var builders = [], miners = [];
  var sources = [], roles = {};
  var walls = 0, ramps = 0, creepsN = 0;
  for (var i = 0; i < objs.length; i++) {
    var o = objs[i];
    if (o.type === "controller") ctrl = o;
    else if (o.type === "spawn") spawn = o;
    else if (o.type === "tower") tower = o;
    else if (o.type === "extension") ext.push({ xy: o.x + "," + o.y, e: (o.store && o.store.energy) || o.energy || 0 });
    else if (o.type === "road") roads.push(o.x + "," + o.y);
    else if (o.type === "container") {
      boxes.push({ xy: o.x + "," + o.y, e: (o.store && o.store.energy) || o.energy || 0 });
    } else if (o.type === "constructedWall") walls++;
    else if (o.type === "rampart") ramps++;
    else if (o.type === "source") sources.push({ xy: o.x + "," + o.y, e: o.energy || 0 });
    else if (o.type === "constructionSite") {
      var st = o.structureType || "?";
      var rec = { st: st, xy: o.x + "," + o.y, p: o.progress || 0, t: o.progressTotal || 0 };
      if (st === "road") roadSites.push(rec);
      else otherSites.push(rec);
    } else if (o.type === "creep") {
      creepsN++;
      var name = String(o.name || "");
      var role = name.split("-")[0] || "?";
      roles[role] = (roles[role] || 0) + 1;
      var parts = partsOf(o.body);
      var mem = o.memory || {};
      var recC = {
        name: name,
        xy: o.x + "," + o.y,
        spawning: !!o.spawning,
        body: bodyStr(parts),
        e: (o.store && o.store.energy) || o.energy || 0,
        suicide: mem.suicide === true,
        sourceId: mem.sourceId || null,
      };
      if (role === "Builder" || role === "builder") builders.push(recC);
      if (role === "EnergyMiner") miners.push(recC);
    }
  }
  var dropE = 0;
  for (var d = 0; d < drops.length; d++) dropE += drops[d].energy || 0;
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
    roads: roads,
    roadSites: roadSites,
    otherSites: otherSites,
    boxes: boxes,
    tower: tower ? { xy: tower.x + "," + tower.y, e: (tower.store && tower.store.energy) || tower.energy || 0 } : null,
    walls: walls,
    ramps: ramps,
    sources: sources,
    builders: builders,
    miners: miners,
    roles: roles,
    creeps: creepsN,
    dropE: dropE,
  };
}
print("__ALL__" + JSON.stringify(CAND.map(film)));
