const d = db.getSiblingDB("screeps");
const RACE = {
  E5S3: 1, E9S1: 1, E12S3: 1, E13S9: 1, E18S9: 1, E8S5: 1, E11S6: 1, E8S3: 1,
  E16S9: 1, E4S7: 1, E18S5: 1, E6S1: 1, E12S1: 1, E3S5: 1, E13S7: 1, E21S4: 1,
};
const ctrls = d["rooms.objects"]
  .find({ type: "controller", level: { $gte: 6 }, user: { $in: ["pacifist1", "pacifist2", "waxeye1"] } })
  .toArray();
print("high rcl rooms:");
ctrls.forEach((c) => {
  print("  " + c.room + " RCL" + c.level);
  if (RACE[c.room]) {
    print("    skip (bench)");
    return;
  }
  const r = d.rooms.updateOne({ _id: c.room }, { $set: { active: false } });
  print("    parked active=false matched=" + r.matchedCount);
});
