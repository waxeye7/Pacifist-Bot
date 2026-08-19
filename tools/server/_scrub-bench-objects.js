const d = db.getSiblingDB("screeps");
const rooms = [
  "E5S3", "E9S1", "E12S3", "E13S9", "E18S9", "E8S5", "E11S6", "E8S3",
  "E16S9", "E4S7", "E18S5", "E6S1", "E12S1", "E3S5", "E13S7", "E21S4",
];
const keep = { source: 1, mineral: 1, controller: 1 };
rooms.forEach((r) => {
  const del = d["rooms.objects"].deleteMany({
    room: r,
    type: { $nin: ["source", "mineral", "controller"] },
  });
  const left = {};
  d["rooms.objects"].find({ room: r }).forEach((o) => {
    left[o.type] = (left[o.type] || 0) + 1;
  });
  print(r + " deleted=" + del.deletedCount + " left=" + JSON.stringify(left));
});
