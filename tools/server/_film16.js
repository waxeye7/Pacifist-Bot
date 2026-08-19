db = db.getSiblingDB("screeps");
var CAND = ["E5S3","E12S3","E18S9","E11S6","E16S9","E18S5","E12S1","E13S7"];
var CTRL = ["E9S1","E13S9","E8S5","E8S3","E4S7","E6S1","E3S5","E21S4"];
var ALL = CAND.concat(CTRL);
function workOf(body) {
  if (!body) return 0;
  var n = 0;
  for (var i = 0; i < body.length; i++) {
    var p = body[i];
    var t = typeof p === "string" ? p : (p && p.type);
    if (t === "work" || t === "WORK") n++;
  }
  return n;
}
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
function costOf(parts) {
  var c = {work:100,move:50,carry:50,attack:80,ranged_attack:150,heal:250,claim:600,tough:10};
  var s = 0;
  for (var k in parts) s += (c[k] || 0) * parts[k];
  return s;
}
function bodyStr(parts) {
  var order = ["work","carry","move","attack","ranged_attack","heal","claim","tough"];
  var out = [];
  for (var i = 0; i < order.length; i++) {
    var k = order[i];
    if (parts[k]) out.push(parts[k] + k[0].toUpperCase());
  }
  return out.join("");
}
function filmRoom(room) {
  var objs = db["rooms.objects"].find({room: room, type: {$ne: "energy"}}).toArray();
  var ctrl = null, spawn = null;
  var ext = 0, extE = 0, siteExt = 0, sites = {};
  var miners = [];
  var creeps = 0, roles = {};
  var sources = [];
  var spawnE = 0;
  for (var i = 0; i < objs.length; i++) {
    var o = objs[i];
    if (o.type === "controller") ctrl = o;
    else if (o.type === "spawn") {
      spawn = o;
      spawnE += (o.store && o.store.energy) || o.energy || 0;
    } else if (o.type === "extension") {
      ext++;
      extE += (o.store && o.store.energy) || o.energy || 0;
    } else if (o.type === "constructionSite") {
      var st = o.structureType || "?";
      sites[st] = (sites[st] || 0) + 1;
      if (st === "extension") siteExt++;
    } else if (o.type === "source") {
      sources.push({id: String(o._id), x: o.x, y: o.y, e: o.energy || 0, cap: o.energyCapacity || 0});
    } else if (o.type === "creep") {
      creeps++;
      var name = o.name || "";
      var role = name.split("-")[0] || "?";
      roles[role] = (roles[role] || 0) + 1;
      if (name.indexOf("EnergyMiner") === 0) {
        var parts = partsOf(o.body);
        var mem = o.memory || {};
        miners.push({
          name: name,
          room: o.room,
          spawning: !!o.spawning,
          w: parts.work || 0,
          m: parts.move || 0,
          c: parts.carry || 0,
          body: bodyStr(parts),
          cost: costOf(parts),
          n: (o.body && o.body.length) || 0,
          sourceId: mem.sourceId || null,
          targetRoom: mem.targetRoom || null,
          homeRoom: mem.homeRoom || null,
          role: mem.role || null,
          x: o.x, y: o.y,
          ttl: o.ageTime || null
        });
      }
    }
  }
  var cap = 300 + ext * 50;
  return {
    room: room,
    user: ctrl && ctrl.user ? String(ctrl.user) : null,
    L: ctrl ? (ctrl.level || 0) : 0,
    p: ctrl ? (ctrl.progress || 0) : 0,
    ttd: ctrl ? (ctrl.ticksToDowngrade || 0) : 0,
    ext: ext,
    cap: cap,
    siteExt: siteExt,
    sites: sites,
    spawnE: spawnE,
    extE: extE,
    fill: spawnE + extE,
    spawning: spawn && spawn.spawning ? spawn.spawning : null,
    lastSpawnUsed: spawn && spawn.spawning ? null : (spawn && spawn.lastSpawnTime) || null,
    creeps: creeps,
    roles: roles,
    sources: sources,
    miners: miners
  };
}
var rooms = {};
for (var i = 0; i < ALL.length; i++) rooms[ALL[i]] = filmRoom(ALL[i]);
var owned = db["rooms.objects"].find({type:"controller", user:{$ne:null}}, {room:1,user:1,level:1,_id:0}).toArray();
var cck = db["rooms.objects"].find({type:"creep", $or:[{name:/^CCK/},{name:/ContinuousControllerKiller/}]} , {name:1,room:1,_id:0}).toArray();
print("__FILM__" + JSON.stringify({
  cand: CAND.map(function(r){return rooms[r];}),
  ctrl: CTRL.map(function(r){return rooms[r];}),
  owned: owned,
  cck: cck
}));
