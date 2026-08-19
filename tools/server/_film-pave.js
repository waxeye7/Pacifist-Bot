db = db.getSiblingDB("screeps");
var CAND = ["E5S3","E12S3","E18S9","E11S6","E16S9","E18S5","E12S1","E13S7"];
print("users " + db.users.find({username: /pacifist/}).map(function (u) { return u.username + "=" + u._id; }));
CAND.forEach(function (room) {
  var objs = db["rooms.objects"].find({room: room, type: {$ne: "energy"}}).toArray();
  var ctrl = null, spawn = null, ext = 0, roads = [], roadSites = [], otherSites = [];
  var builders = [];
  var boxes = [];
  var sources = [];
  var miners = 0;
  var creeps = 0;
  for (var i = 0; i < objs.length; i++) {
    var o = objs[i];
    if (o.type === "controller") ctrl = o;
    else if (o.type === "spawn") spawn = o;
    else if (o.type === "extension") ext++;
    else if (o.type === "road") roads.push(o.x + "," + o.y);
    else if (o.type === "container") boxes.push(o.x + "," + o.y);
    else if (o.type === "source") sources.push(o.x + "," + o.y);
    else if (o.type === "constructionSite") {
      var st = o.structureType || "?";
      var rec = st + " " + o.x + "," + o.y + " " + (o.progress || 0) + "/" + (o.progressTotal || 0);
      if (st === "road") roadSites.push(rec);
      else otherSites.push(rec);
    } else if (o.type === "creep") {
      creeps++;
      var name = String(o.name || "");
      if (name.indexOf("Builder") === 0) builders.push((o.spawning ? "sp" : "lv") + " " + o.x + "," + o.y);
      if (name.indexOf("EnergyMiner") === 0) miners++;
    }
  }
  var cap = 300 + ext * 50;
  print(
    room +
      " L" + (ctrl && ctrl.level) +
      " p=" + (ctrl && ctrl.progress) +
      " ext=" + ext + "/" + cap +
      " roads=" + roads.length +
      " rSites=" + roadSites.length +
      " B=" + builders.length +
      " M=" + miners +
      " c=" + creeps
  );
  print("  geom spawn=" + (spawn ? spawn.x + "," + spawn.y : "-") +
    " ctrl=" + (ctrl ? ctrl.x + "," + ctrl.y : "-") +
    " src=" + sources.join("|") +
    " boxes=" + boxes.join("|"));
  if (roads.length) print("  standing " + roads.join(" "));
  if (roadSites.length) print("  rsites   " + roadSites.join(" · "));
  if (otherSites.length) print("  others   " + otherSites.join(" · "));
  if (builders.length) print("  builders " + builders.join(" · "));
});
