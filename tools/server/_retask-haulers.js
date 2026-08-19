return (function () {
  var NEED = "E39N58";
  var n = 0;
  var names = [];
  for (var k in Game.creeps) {
    var c = Game.creeps[k];
    if (!c.memory) continue;
    if (c.memory.role === "buildcontainer" && c.memory.targetRoom === NEED) continue;
    var role = c.memory.role;
    if (role === "EnergyMiner" || role === "mineralMiner") continue;
    if (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK) ||
        c.getActiveBodyparts(HEAL) || c.getActiveBodyparts(CLAIM)) continue;
    var home = Game.rooms[c.memory.homeRoom || c.room.name] || c.room;
    var homeHasSpawn = home.find(FIND_MY_SPAWNS).length > 0;
    if (homeHasSpawn && (role === "filler" || role === "carry")) continue;
    if (c.getActiveBodyparts(WORK) === 0 && c.getActiveBodyparts(CARRY) === 0) continue;
    c.memory.role = "buildcontainer";
    c.memory.targetRoom = NEED;
    var e = c.store[RESOURCE_ENERGY] || 0;
    c.memory.fill = e === 0 && c.store.getFreeCapacity() > 0;
    c.memory.building = e > 0;
    n++;
    names.push(c.name + ":" + role + "@" + c.room.name);
  }
  var r = Game.rooms.E37N58;
  if (r && r.memory.spawn_list) {
    var q = r.memory.spawn_list;
    var next = [];
    for (var i = 0; i < q.length; i += 3) {
      var o = q[i + 2];
      var role2 = o && o.memory && o.memory.role;
      if (role2 === "buildcontainer" || role2 === "EnergyMiner" ||
          role2 === "filler" || role2 === "carry") next.push(q[i], q[i + 1], q[i + 2]);
    }
    r.memory.spawn_list = next;
  }
  return { t: Game.time, retasked: n, names: names, sl: r && r.memory.spawn_list && r.memory.spawn_list.length };
})();
