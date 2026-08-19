return (function () {
  var NEED = "E39N58";
  var XY = { x: 14, y: 24, roomName: NEED };
  Memory.spawnRescue = NEED;
  Memory._spawnEmergency = true;
  Memory.target_colonise = Memory.target_colonise || {};
  Memory.target_colonise.room = NEED;
  Memory.target_colonise.spawn_pos = XY;

  var n = 0;
  var names = [];
  for (var k in Game.creeps) {
    var c = Game.creeps[k];
    if (!c.memory) continue;
    if (c.memory.role === "buildcontainer" && c.memory.targetRoom === NEED) continue;
    var role = c.memory.role;
    if (role === "EnergyMiner" || role === "mineralMiner") continue;
    if (c.getActiveBodyparts(WORK) === 0) continue;
    if (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) ||
        c.getActiveBodyparts(HEAL) || c.getActiveBodyparts(CLAIM)) continue;
    c.memory.role = "buildcontainer";
    c.memory.targetRoom = NEED;
    c.memory.fill = c.store.getFreeCapacity() > 0;
    n++;
    names.push(c.name + "@" + c.room.name);
  }

  var stripped = 0;
  for (var rn in Game.rooms) {
    var r = Game.rooms[rn];
    if (!r.controller || !r.controller.my) continue;
    var q = r.memory.spawn_list;
    if (!q || !q.length) continue;
    var next = [];
    for (var i = 0; i < q.length; i += 3) {
      var o = q[i + 2];
      var role2 = o && o.memory && o.memory.role;
      if (role2 === "buildcontainer") next.push(q[i], q[i + 1], q[i + 2]);
      else stripped++;
    }
    r.memory.spawn_list = next;
  }

  var roles = {};
  for (var k2 in Game.creeps) {
    var c2 = Game.creeps[k2];
    var key = (c2.memory && c2.memory.role || "?") +
      (c2.memory && c2.memory.targetRoom ? (">" + c2.memory.targetRoom) : "") +
      "@" + c2.room.name;
    roles[key] = (roles[key] || 0) + 1;
  }
  return {
    t: Game.time,
    retasked: n,
    names: names,
    stripped: stripped,
    rescue: Memory.spawnRescue,
    roles: roles,
  };
})();
