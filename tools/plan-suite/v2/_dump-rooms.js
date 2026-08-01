db = db.getSiblingDB("screeps");
var rooms = ["E14S2"];
var out = [];
for (var i = 0; i < rooms.length; i++) {
  var room = rooms[i];
  var t = db["rooms.terrain"].findOne({room: room});
  if (!t) continue;
  var objects = db["rooms.objects"].find({room: room, type: {$in: ["source","controller","mineral"]}}).toArray();
  out.push({ room: room, terrain: t.terrain, objects: objects });
}
print(JSON.stringify(out));
