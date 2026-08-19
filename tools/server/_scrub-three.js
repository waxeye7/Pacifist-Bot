const d = db.getSiblingDB("screeps");
const rooms = ["E5S3", "E8S5", "E4S7"];
rooms.forEach((r) => {
  const del = d["rooms.objects"].deleteMany({
    room: r,
    type: { $nin: ["source", "mineral", "controller"] },
  });
  print(r + " deleted=" + del.deletedCount);
});
