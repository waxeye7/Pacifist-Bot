const d = db.getSiblingDB("screeps");
const rooms = ["E5S3", "E8S5", "E18S9", "E11S6", "E12S1", "E21S4"];
rooms.forEach(function (r) {
  const objs = d["rooms.objects"].find({ room: r }, { type: 1, user: 1, x: 1, y: 1, level: 1, reservation: 1 }).toArray();
  const rd = d.rooms.findOne({ _id: r });
  print("--- " + r + " status=" + (rd && rd.status) + " active=" + (rd && rd.active) + " n=" + objs.length);
  objs.forEach(function (o) {
    print("  " + o.type + " u=" + o.user + " " + o.x + "," + o.y + " L=" + o.level + " res=" + !!o.reservation);
  });
});
