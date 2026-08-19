const d = db.getSiblingDB("screeps");
d.users.find({}, { username: 1, cpu: 1, cpuAvailable: 1, active: 1, rooms: 1 }).forEach((u) => {
  print(
    (u.username || u._id) +
      " cpu=" + (u.cpu || "?") +
      " rooms=" + ((u.rooms && u.rooms.length) || 0) +
      " " + ((u.rooms || []).slice(0, 12).join(",")),
  );
});
print("--- code ---");
d["users.code"].find({ branch: "main" }, { user: 1, activeWorld: 1, activeSim: 1 }).forEach((c) => {
  print(c.user + " activeWorld=" + c.activeWorld + " activeSim=" + c.activeSim);
});
