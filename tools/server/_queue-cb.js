return (function () {
  var room = Game.rooms.E37N58;
  if (!room) return { err: "no E37N58" };
  var body = [WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE, WORK, CARRY, MOVE];
  if (!room.memory.spawn_list) room.memory.spawn_list = [];
  var name = "ContainerBuilder-rescue-" + Game.time;
  room.memory.spawn_list.unshift(body, name, {
    memory: { role: "buildcontainer", targetRoom: "E39N58", homeRoom: "E37N58", fill: true },
  });
  return {
    t: Game.time,
    queued: name,
    e: room.energyAvailable + "/" + room.energyCapacityAvailable,
    sl: room.memory.spawn_list.length,
    site: (function () {
      var r = Game.rooms.E39N58;
      if (!r) return null;
      var s = r.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: function (x) { return x.structureType === STRUCTURE_SPAWN; },
      })[0];
      return s ? s.progress + "/" + s.progressTotal : null;
    })(),
  };
})();
