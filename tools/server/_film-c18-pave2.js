db = db.getSiblingDB("screeps");
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
function filmCreeps(room) {
  var objs = db["rooms.objects"].find({ room: room, type: "creep" }).toArray();
  return objs.map(function (o) {
    var parts = partsOf(o.body);
    var mem = o.memory || {};
    return {
      name: o.name,
      xy: o.x + "," + o.y,
      sp: !!o.spawning,
      body: bodyStr(parts),
      e: (o.store && o.store.energy) || o.energy || 0,
      fat: o.fatigue || 0,
      suicide: mem.suicide === true,
      role: mem.role,
      building: mem.building || mem.build || null,
      locked: mem.locked || mem.lock || null,
      sourceId: mem.sourceId || null,
    };
  });
}
function filmSites(room) {
  return db["rooms.objects"]
    .find({ room: room, type: { $in: ["constructionSite", "road", "tower", "extension", "container", "spawn", "controller", "source"] } })
    .toArray()
    .map(function (o) {
      return {
        t: o.type,
        st: o.structureType || o.type,
        xy: o.x + "," + o.y,
        p: o.progress || 0,
        pt: o.progressTotal || 0,
        e: (o.store && o.store.energy) || o.energy || 0,
        hits: o.hits,
      };
    });
}
var rooms = ["E16S9", "E13S7"];
var out = {};
rooms.forEach(function (r) {
  var ctrl = db["rooms.objects"].findOne({ room: r, type: "controller" });
  out[r] = {
    L: ctrl && ctrl.level,
    p: ctrl && ctrl.progress,
    creeps: filmCreeps(r),
    stuff: filmSites(r),
  };
});
var notes = db["users.notifications"]
  .find({ user: { $in: ["pacifist1", "pacifist"] } })
  .sort({ _id: -1 })
  .limit(6)
  .toArray()
  .map(function (n) {
    return { t: n.tick || n.date, msg: String(n.message || n.text || "").slice(0, 160) };
  });
print("__D__" + JSON.stringify({ out: out, notes: notes }));
