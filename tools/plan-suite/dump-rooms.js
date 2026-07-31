db = db.getSiblingDB("screeps");
var rooms = ["E4S7","E7S8","E2S7","E5S1","E8S3","E1S4"];
var out = [];
for (var i = 0; i < rooms.length; i++) {
  var rn = rooms[i];
  var ter = db["rooms.terrain"].findOne({ room: rn });
  if (!ter || !ter.terrain) continue;
  var objs = db["rooms.objects"].find({ room: rn, type: { $in: ["source", "controller", "mineral"] } }, { type: 1, x: 1, y: 1 }).toArray();
  out.push({ room: rn, terrain: ter.terrain, objects: objs });
}
print(JSON.stringify(out));
