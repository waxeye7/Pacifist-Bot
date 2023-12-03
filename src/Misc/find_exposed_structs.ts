function find_exposed_structs(pos: RoomPosition, structures: Array<Structure>): Array<Structure> {
  let exposedStructs: Array<Structure> = [];
  structures.forEach(struct => {
    let range = pos.getRangeTo(struct);
    if (range > 3) return;
    let structures = struct.pos.lookFor(LOOK_STRUCTURES);
    let ramparts = structures.filter(s => s.structureType === STRUCTURE_RAMPART);
    if (ramparts.length && ramparts[0].hits > 1000) return;
    exposedStructs.push(struct);
  });
  return exposedStructs;
}

export default find_exposed_structs;
