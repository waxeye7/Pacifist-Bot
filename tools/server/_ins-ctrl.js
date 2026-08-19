const d = db.getSiblingDB("screeps");
const inserts = [
  { room: "E4S7", x: 33, y: 39 },
  { room: "E21S4", x: 42, y: 23 },
];
inserts.forEach((c) => {
  if (d["rooms.objects"].findOne({ room: c.room, type: "controller" })) {
    print(c.room + " already has controller");
    return;
  }
  d["rooms.objects"].insertOne({
    room: c.room,
    type: "controller",
    x: c.x,
    y: c.y,
    level: 0,
    progress: 0,
    progressTotal: 0,
  });
  print(c.room + " controller inserted at " + c.x + "," + c.y);
});

const inv = d["rooms.objects"]
  .find({ room: "E5S3", $or: [{ type: "creep" }, { type: "invaderCore" }] })
  .toArray();
print("E5S3 invader-like objects: " + inv.length);
inv.forEach((o) => print(o.type + " user=" + o.user + " " + o.x + "," + o.y));
const del = d["rooms.objects"].deleteMany({
  room: "E5S3",
  user: "2",
});
print("E5S3 deleted user=2 objects: " + del.deletedCount);
d["rooms.objects"].updateOne(
  { room: "E5S3", type: "controller" },
  { $unset: { reservation: "", user: "" }, $set: { level: 0, progress: 0, progressTotal: 0 } },
);
print("E5S3 reservation unset again");
