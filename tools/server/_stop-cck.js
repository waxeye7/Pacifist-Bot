const d = db.getSiblingDB("screeps");
const rooms = [
  "E5S3", "E9S1", "E12S3", "E13S9", "E18S9", "E8S5", "E11S6", "E8S3",
  "E16S9", "E4S7", "E18S5", "E6S1", "E12S1", "E3S5", "E13S7", "E21S4",
];
const attackers = ["pacifist2", "waxeye1"];
const roomSet = {};
rooms.forEach((r) => { roomSet[r] = true; });

print("users:");
d.users.find({ username: { $in: ["pacifist2", "pacifist", "pacifist-race", "waxeye"] } }).forEach((u) => {
  print("  " + u.username + " _id=" + u._id + " rooms=" + ((u.rooms && u.rooms.length) || 0));
});

const before = d["rooms.objects"].find({
  room: { $in: rooms },
  type: "creep",
  user: { $in: attackers },
}).toArray();
print("hostile creeps in race rooms: " + before.length);
before.forEach((c) => print("  " + c.room + " " + c.name + " user=" + c.user));

const del = d["rooms.objects"].deleteMany({
  room: { $in: rooms },
  type: "creep",
  user: { $in: attackers },
});
print("deleted " + del.deletedCount);

const sites = d["rooms.objects"].find({
  room: { $in: rooms },
  type: "constructionSite",
  user: { $in: attackers },
}).toArray();
print("hostile sites: " + sites.length);
sites.forEach((s) => print("  " + s.room + " " + s.structureType));
if (sites.length) {
  const ds = d["rooms.objects"].deleteMany({
    room: { $in: rooms },
    type: "constructionSite",
    user: { $in: attackers },
  });
  print("deleted sites " + ds.deletedCount);
}
