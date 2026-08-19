const d = db.getSiblingDB("screeps");
const rooms = ["E12S1", "E13S7", "E16S9", "E3S5", "E6S1"];
const allowed = { pacifist1: 1, "pacifist-race": 1 };
rooms.forEach((r) => {
  const objs = d["rooms.objects"]
    .find({ room: r, user: { $exists: true, $ne: null } })
    .toArray();
  const counts = {};
  objs.forEach((o) => {
    const k = String(o.user) + ":" + o.type;
    counts[k] = (counts[k] || 0) + 1;
  });
  print(r + " " + JSON.stringify(counts));
});
