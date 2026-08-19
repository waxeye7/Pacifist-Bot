return (function () {
  var rooms = ["E37N58", "E39N58", "E36N57", "E37N59"];
  var o = {
    t: Game.time,
    rescue: Memory.spawnRescue,
    em: Memory._spawnEmergency,
    tc: Memory.target_colonise,
    rooms: {},
    cbs: [],
  };
  rooms.forEach(function (n) {
    var r = Game.rooms[n];
    if (!r || !r.controller) {
      o.rooms[n] = { vis: !!r };
      return;
    }
    var site = r.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: function (s) { return s.structureType === STRUCTURE_SPAWN; },
    })[0];
    o.rooms[n] = {
      rcl: r.controller.level,
      dg: r.controller.ticksToDowngrade,
      my: r.controller.my,
      e: r.energyAvailable + "/" + r.energyCapacityAvailable,
      spawns: r.find(FIND_MY_SPAWNS).map(function (s) {
        return s.pos.x + "," + s.pos.y + " e" + s.store[RESOURCE_ENERGY];
      }),
      site: site ? (site.pos.x + "," + site.pos.y + " " + site.progress + "/" + site.progressTotal) : null,
      sl: (r.memory.spawn_list || []).length,
    };
  });
  for (var k in Game.creeps) {
    var c = Game.creeps[k];
    if (!c.memory || c.memory.role !== "buildcontainer") continue;
    o.cbs.push({
      n: c.name,
      rm: c.room.name,
      tgt: c.memory.targetRoom,
      xy: c.pos.x + "," + c.pos.y,
      e: c.store[RESOURCE_ENERGY] || 0,
      w: c.getActiveBodyparts(WORK),
      fill: !!c.memory.fill,
      bld: !!c.memory.building,
      dg: !!c.memory.dgRescue,
      ttl: c.ticksToLive,
    });
  }
  return o;
})();
