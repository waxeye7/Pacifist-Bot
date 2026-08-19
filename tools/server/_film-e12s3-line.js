db = db.getSiblingDB("screeps");
var tiles = [[28,24],[27,25],[26,26],[25,27],[24,27],[23,27],[22,27],[21,27],[20,27],[29,23],[31,21],[30,22]];
tiles.forEach(function (t) {
  var os = db["rooms.objects"].find({ room: "E12S3", x: t[0], y: t[1], type: { $ne: "energy" } }).toArray();
  print(t[0] + "," + t[1] + " " + os.map(function (o) {
    return o.type + (o.structureType ? "/" + o.structureType : "") + " p=" + (o.progress || 0);
  }).join("|"));
});
print("sites " + db["rooms.objects"].countDocuments({ room: "E12S3", type: "constructionSite" }));
print("roads " + db["rooms.objects"].countDocuments({ room: "E12S3", type: "road" }));
