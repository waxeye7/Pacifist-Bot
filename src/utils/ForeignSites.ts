/** Leftover sites from the previous owner. remove() only works on ours;
 *  hostile ones die when a creep steps on the tile (range 0). */
export function foreignSites(room: Room): ConstructionSite[] {
  return room.find(FIND_CONSTRUCTION_SITES, {
    filter: (s: ConstructionSite) => !s.my,
  });
}

export function wipeForeignSites(room: Room): number {
  const sites = foreignSites(room);
  let n = 0;
  for (const s of sites) {
    if (s.remove() === OK) n++;
  }
  return n;
}

/** True if this creep issued a stomp move (caller should return). */
export function stompForeignSite(creep: Creep): boolean {
  const room = creep.room;
  if (!room.controller || !room.controller.my) return false;
  wipeForeignSites(room);
  const left = foreignSites(room);
  if (!left.length) return false;
  const target = creep.pos.findClosestByRange(left);
  if (!target) return false;
  if (creep.pos.x === target.pos.x && creep.pos.y === target.pos.y) return true;
  creep.moveTo(target.pos.x, target.pos.y);
  return true;
}
