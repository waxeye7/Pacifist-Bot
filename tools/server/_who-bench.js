const d = db.getSiblingDB("screeps");
const rooms = ["E12S1", "E13S7", "E16S9", "E3S5", "E6S1"];
rooms.forEach((r) => {
  const c = d["rooms.objects"].findOne({ room: r, type: "controller" });
  const uid = c && c.user;
  const u = uid ? d.users.findOne({ _id: uid }) : null;
  print(r + " ctrlUser=" + uid + " name=" + (u && u.username) + " lvl=" + (c && c.level));
});
print("--- users ---");
d.users.find({}, { username: 1, rooms: 1 }).forEach((u) => {
  print((u.username || u._id) + " " + u._id + " rooms=" + ((u.rooms && u.rooms.join(",")) || ""));
});
