db = db.getSiblingDB("screeps");
var t = db["rooms.terrain"].findOne({ room: "E12S3" });
var raw = t && (t.terrain || t);
function tile(x, y) {
  if (typeof raw === "string") {
    var ch = raw.charCodeAt(y * 50 + x) - 48;
    return ch === 1 ? "wall" : ch === 2 ? "swamp" : "plain";
  }
  return typeof raw;
}
print("terrain type " + typeof raw + " len=" + (raw && raw.length));
for (var y = 20; y <= 28; y++) {
  var row = "";
  for (var x = 18; x <= 36; x++) {
    var k = tile(x, y);
    var m = k === "wall" ? "#" : k === "swamp" ? "~" : ".";
    if (x === 31 && y === 21) m = "H";
    if (x === 19 && y === 27) m = "C";
    if (x === 33 && y === 21) m = "S";
    row += m;
  }
  print(y + " " + row);
}
print("sites all-cand " + db["rooms.objects"].countDocuments({ type: "constructionSite", room: { $in: ["E5S3","E12S3","E18S9","E11S6","E16S9","E18S5","E12S1","E13S7"] } }));
