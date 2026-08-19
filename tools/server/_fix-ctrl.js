const d = db.getSiblingDB("screeps");
const sample = d["rooms.objects"].findOne({ room: "E9S1", type: "controller" });
print("sample keys " + Object.keys(sample || {}));
printjson(sample);

["E4S7", "E21S4"].forEach((r) => {
  const have = d["rooms.objects"].findOne({ room: r, type: "controller" });
  print(r + " have=" + !!have);
  if (!have && sample) {
    const copy = Object.assign({}, sample);
    delete copy._id;
    copy.room = r;
    copy.level = 0;
    copy.progress = 0;
    copy.progressTotal = 0;
    delete copy.user;
    delete copy.reservation;
    delete copy.downgradeTime;
    delete copy.ticksToDowngrade;
    delete copy.safeMode;
    delete copy.safeModeCooldown;
    delete copy.safeModeAvailable;
    delete copy.sign;
    // keep x,y? WRONG - must use that room's controller position
    print("need real xy for " + r);
  }
});

const e5 = d["rooms.objects"].findOne({ room: "E5S3", type: "controller" });
print("E5S3 reservation=");
printjson(e5 && e5.reservation);
if (e5) {
  d["rooms.objects"].updateOne(
    { _id: e5._id },
    { $unset: { reservation: "", user: "" }, $set: { level: 0, progress: 0, progressTotal: 0 } },
  );
  print("E5S3 reservation cleared");
}
