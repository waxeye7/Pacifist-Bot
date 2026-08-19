const d = db.getSiblingDB("screeps");
const ctrls = {
  E5S3: [37, 41],
  E9S1: [24, 37],
  E12S3: [19, 27],
  E13S9: [10, 27],
  E18S9: [25, 6],
  E8S5: [43, 9],
  E11S6: [12, 24],
  E8S3: [18, 5],
  E16S9: [42, 22],
  E4S7: [33, 39],
  E18S5: [8, 9],
  E6S1: [40, 5],
  E12S1: [15, 38],
  E3S5: [44, 30],
  E13S7: [25, 14],
  E21S4: [42, 23],
};
Object.keys(ctrls).forEach((room) => {
  const have = d["rooms.objects"].findOne({ room: room, type: "controller" });
  if (have) {
    print(room + " already has controller");
    return;
  }
  const xy = ctrls[room];
  d["rooms.objects"].insertOne({
    room: room,
    type: "controller",
    x: xy[0],
    y: xy[1],
    level: 0,
    progress: 0,
    progressTotal: 0,
  });
  const src = d["rooms.objects"].countDocuments({ room: room, type: "source" });
  print(room + " controller inserted " + xy[0] + "," + xy[1] + " sources=" + src);
});
