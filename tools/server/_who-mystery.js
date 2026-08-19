const d = db.getSiblingDB("screeps");
const u = d.users.findOne({ _id: "6a6dcb80237d70004bc82b91" });
print("user " + (u && u.username) + " rooms=" + ((u && u.rooms && u.rooms.length) || 0));
d["users.code"].updateOne(
  { user: "6a6dcb80237d70004bc82b91", branch: "main" },
  { $set: { activeWorld: false } },
);
print("paused mystery bot");
