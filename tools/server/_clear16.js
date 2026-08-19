const d = db.getSiblingDB("screeps");
const rooms = [
  "E5S3", "E9S1", "E12S3", "E13S9", "E18S9", "E8S5", "E11S6", "E8S3",
  "E16S9", "E4S7", "E18S5", "E6S1", "E12S1", "E3S5", "E13S7", "E21S4",
];
const users = ["pacifist1", "pacifist2", "pacifist-race", "waxeye1"];
rooms.forEach((r) => {
  d["rooms.objects"].deleteMany({
    room: r,
    type: { $nin: ["source", "mineral", "controller"] },
  });
  d["rooms.objects"].updateOne(
    { room: r, type: "controller" },
    {
      $set: { level: 0, progress: 0, progressTotal: 0 },
      $unset: {
        user: "",
        reservation: "",
        downgradeTime: "",
        ticksToDowngrade: "",
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
});
print("cleared 16");
