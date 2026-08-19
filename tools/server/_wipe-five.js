const d = db.getSiblingDB("screeps");
const rooms = ["E12S1", "E13S7", "E16S9", "E3S5", "E6S1"];
const users = ["pacifist1", "pacifist-race"];
rooms.forEach((r) => {
  const del = d["rooms.objects"].deleteMany({
    room: r,
    user: { $in: users },
    type: { $ne: "controller" },
  });
  const ctrl = d["rooms.objects"].updateOne(
    { room: r, type: "controller" },
    {
      $set: { level: 0, progress: 0, progressTotal: 0 },
      $unset: {
        user: "",
        downgradeTime: "",
        ticksToDowngrade: "",
        reservation: "",
        sign: "",
        safeMode: "",
        safeModeCooldown: "",
        safeModeAvailable: "",
        upgradeBlocked: "",
        isPowerEnabled: "",
      },
    },
  );
  d.rooms.updateOne({ _id: r }, { $set: { active: false } });
  users.forEach((u) => d.users.updateOne({ _id: u }, { $pull: { rooms: r } }));
  print(r + " deleted=" + del.deletedCount + " ctrl=" + ctrl.modifiedCount);
});
