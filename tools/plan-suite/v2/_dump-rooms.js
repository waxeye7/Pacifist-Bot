db = db.getSiblingDB("screeps");
var rooms = ["E11S0","E11S1","E11S10","E11S2","E11S3","E11S4","E11S5","E11S6","E11S7","E11S8","E11S9","E12S0","E12S1","E12S10","E12S2","E12S3","E12S4","E12S5","E12S6","E12S7","E12S8","E12S9","E13S0","E13S1","E13S10","E13S2","E13S3","E13S4","E13S5","E13S6","E13S7","E13S8","E13S9","E14S0","E14S1","E14S10","E14S2","E14S3","E14S4","E14S5","E14S6","E14S7","E14S8","E14S9","E15S0","E15S1","E15S10","E15S2","E15S3","E15S4","E15S5","E15S6","E15S7","E15S8","E15S9","E16S0","E16S1","E16S10","E16S2","E16S3","E16S4","E16S5","E16S6","E16S7","E16S8","E16S9","E17S0","E17S1","E17S10","E17S2","E17S3","E17S4","E17S5","E17S6","E17S7","E17S8","E17S9","E18S0","E18S1","E18S10","E18S2","E18S3","E18S4","E18S5","E18S6","E18S7","E18S8","E18S9","E19S0","E19S1","E19S10","E19S2","E19S3","E19S4","E19S5","E19S6","E19S7","E19S8","E19S9","E1S2","E1S4","E1S6","E1S8","E20S0","E20S1","E20S10","E20S2","E20S3","E20S4","E20S5","E20S6","E20S7","E20S8","E20S9","E21S0","E21S1","E21S10","E21S2","E21S3","E21S4","E21S5","E21S6","E21S7","E21S8","E21S9","E2S3","E2S7","E2S9","E3S2","E3S3","E4S2","E4S3","E4S7","E4S8","E4S9","E5S1","E5S3","E5S7","E5S8","E5S9","E6S1","E6S2","E7S1","E7S8","E7S9","E8S2","E8S3","E8S4","E8S5","E8S6","E8S7","E9S1","E9S2","E9S3","E9S4","E9S5","E9S6","E9S8","W0S5"];
var out = [];
for (var i = 0; i < rooms.length; i++) {
  var room = rooms[i];
  var t = db["rooms.terrain"].findOne({room: room});
  if (!t) continue;
  var objects = db["rooms.objects"].find({room: room, type: {$in: ["source","controller","mineral"]}}).toArray();
  out.push({ room: room, terrain: t.terrain, objects: objects });
}
print(JSON.stringify(out));
