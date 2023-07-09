/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep: Creep) {
  if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
    let result = creep.Boost();
    if(!result) {
        return;
    }
}

  const hostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
  if (hostile) {
    let result = creep.attack(hostile);

    if(result === 0 && (Game.time % 25 === 0 || hostile.hits !== hostile.hitsMax)) {
      creep.room.roomTowersAttackEnemy(hostile);
    }
    creep.moveTo(hostile);

  }

};

const roleClearer = {
  run
  //run: run,
  //function2,
  //function3
};
export default roleClearer;
