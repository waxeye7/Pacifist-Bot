return (function () {
  var o = {
    t: Game.time,
    cpu: Math.round(Game.cpu.getUsed()),
    bucket: Game.cpu.bucket,
    rescue: Memory.spawnRescue,
    em: Memory._spawnEmergency,
    tc: Memory.target_colonise && Memory.target_colonise.room,
    creeps: Object.keys(Game.creeps).length,
    rooms: {},
    roles: {},
    idle: [],
    stuck: [],
    migrate: {},
  };
  for (var name in Game.rooms) {
    var r = Game.rooms[name];
    if (!r.controller || !r.controller.my) continue;
    var sites = r.find(FIND_MY_CONSTRUCTION_SITES);
    var spawnSite = sites.filter(function (s) { return s.structureType === STRUCTURE_SPAWN; })[0];
    var rm = r.memory || {};
    o.rooms[name] = {
      rcl: r.controller.level,
      dg: r.controller.ticksToDowngrade,
      e: r.energyAvailable + "/" + r.energyCapacityAvailable,
      spawns: r.find(FIND_MY_SPAWNS).map(function (s) {
        return s.pos.x + "," + s.pos.y + " e" + (s.store[RESOURCE_ENERGY] || 0) + (s.spawning ? (" hatch " + s.spawning.name) : "");
      }),
      spawnSite: spawnSite ? (spawnSite.pos.x + "," + spawnSite.pos.y + " " + spawnSite.progress + "/" + spawnSite.progressTotal) : null,
      sites: sites.length,
      siteTypes: (function () {
        var t = {};
        for (var i = 0; i < sites.length; i++) t[sites[i].structureType] = (t[sites[i].structureType] || 0) + 1;
        return t;
      })(),
      structs: (function () {
        var t = {};
        var ss = r.find(FIND_MY_STRUCTURES);
        for (var i = 0; i < ss.length; i++) t[ss[i].structureType] = (t[ss[i].structureType] || 0) + 1;
        return t;
      })(),
      force: !!(rm.planMigration && rm.planMigration.force),
      paused: !!rm.planMigratePaused,
      sl: (rm.spawn_list || []).length,
      danger: !!rm.danger,
    };
    o.migrate[name] = rm.planMigration || null;
  }
  for (var k in Game.creeps) {
    var c = Game.creeps[k];
    var role = (c.memory && c.memory.role) || "?";
    var key = role + (c.memory && c.memory.targetRoom ? (">" + c.memory.targetRoom) : "") + "@" + c.room.name;
    o.roles[key] = (o.roles[key] || 0) + 1;
    var w = c.getActiveBodyparts(WORK);
    var e = c.store[RESOURCE_ENERGY] || 0;
    var saying = c.saying;
    if (w && e > 0 && role === "buildcontainer" && c.room.name === (c.memory && c.memory.targetRoom)) {
      var site = c.room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: function (s) { return s.structureType === STRUCTURE_SPAWN; },
      })[0];
      var range = site ? c.pos.getRangeTo(site) : -1;
      if (range > 3) {
        o.stuck.push({
          n: c.name,
          xy: c.pos.x + "," + c.pos.y,
          e: e,
          w: w,
          range: range,
          fill: !!(c.memory && c.memory.fill),
          bld: !!(c.memory && c.memory.building),
          fatigue: c.fatigue,
          saying: saying,
        });
      }
    }
    if (!c.memory || (!c.memory.role && !c.spawning)) {
      o.idle.push(c.name + "@" + c.room.name);
    }
  }
  return o;
})();
