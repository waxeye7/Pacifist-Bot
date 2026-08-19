const d = db.getSiblingDB("screeps");
const r = d["users.code"].updateMany(
  { user: { $in: ["pacifist2", "waxeye1"] }, branch: "main" },
  { $set: { activeWorld: false } },
);
print("paused extra bots matched=" + r.matchedCount + " modified=" + r.modifiedCount);
d["users.code"].find({ branch: "main" }, { user: 1, activeWorld: 1 }).forEach((c) => {
  print(c.user + " activeWorld=" + c.activeWorld);
});
