const d = db.getSiblingDB("screeps");
const del = d["rooms.objects"].deleteMany({
  type: "creep",
  user: { $in: ["pacifist1", "pacifist-race"] },
});
print("deleted racer creeps " + del.deletedCount);
