const d = db.getSiblingDB("screeps");
const rooms = [
  { room: "E5S3", x: 37, y: 41 },
  { room: "E9S1", x: 24, y: 37 },
  { room: "E12S3", x: 19, y: 27 },
  { room: "E13S9", x: 10, y: 27 },
  { room: "E18S9", x: 25, y: 6 },
  { room: "E8S5", x: 43, y: 9 },
  { room: "E11S6", x: 12, y: 24 },
  { room: "E8S3", x: 18, y: 5 },
  { room: "E16S9", x: 42, y: 22 },
  { room: "E4S7", x: 33, y: 39 },
  { room: "E18S5", x: 8, y: 9 },
  { room: "E6S1", x: 40, y: 5 },
  { room: "E12S1", x: 15, y: 38 },
  { room: "E3S5", x: 44, y: 30 },
  { room: "E13S7", x: 25, y: 14 },
  { room: "E21S4", x: 42, y: 23 },
];
rooms.forEach(function (c) {
  var extra = d["rooms.objects"].deleteMany({
    room: c.room,
    type: { $nin: ["source", "mineral", "controller"] },
  });
  var has = d["rooms.objects"].findOne({ room: c.room, type: "controller" });
  if (!has) {
    d["rooms.objects"].insertOne({
      room: c.room,
      type: "controller",
      x: c.x,
      y: c.y,
      level: 0,
      progress: 0,
      progressTotal: 0,
    });
    print(c.room + " inserted " + c.x + "," + c.y + " extras=" + extra.deletedCount);
  } else {
    d["rooms.objects"].updateOne(
      { _id: has._id },
      {
        $set: { level: 0, progress: 0, progressTotal: 0, x: c.x, y: c.y },
        $unset: {
          user: "",
          reservation: "",
          safeMode: "",
          safeModeAvailable: "",
          safeModeCooldown: "",
          upgradeBlocked: "",
          sign: "",
        },
      },
    );
    print(c.room + " reset extras=" + extra.deletedCount);
  }
  d.rooms.updateOne({ _id: c.room }, { $set: { active: true, status: "normal" } });
});
