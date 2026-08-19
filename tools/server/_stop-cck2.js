const d = db.getSiblingDB("screeps");
const rooms = [
  "E5S3", "E9S1", "E12S3", "E13S9", "E18S9", "E8S5", "E11S6", "E8S3",
  "E16S9", "E4S7", "E18S5", "E6S1", "E12S1", "E3S5", "E13S7", "E21S4",
];
const re = /(ContinuousControllerKiller|Claimer|RangedAttacker|Ranger)/;
const creeps = d["rooms.objects"].find({ type: "creep", user: "pacifist2" }).toArray();
let n = 0;
creeps.forEach((c) => {
  const name = c.name || "";
  if (!re.test(name)) return;
  const hit = rooms.some((r) => name.indexOf(r) !== -1) || rooms.indexOf(c.room) !== -1;
  if (!hit) return;
  print("del " + c.room + " " + name);
  d["rooms.objects"].deleteOne({ _id: c._id });
  n++;
});
print("deleted transit/hostiles " + n);
