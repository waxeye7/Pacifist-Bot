const d = db.getSiblingDB("screeps");
["E4S7", "E21S4"].forEach((r) => {
  const objs = d["rooms.objects"]
    .find({ room: r, type: { $nin: ["source", "mineral", "controller"] } })
    .toArray();
  print(r + " extras " + objs.length);
  objs.forEach((o) => print("  " + o.type + " user=" + o.user + " " + o.x + "," + o.y));
  const del = d["rooms.objects"].deleteMany({
    room: r,
    type: { $nin: ["source", "mineral", "controller"] },
  });
  print(r + " deleted extras " + del.deletedCount);
});
