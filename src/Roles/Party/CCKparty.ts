/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
  creep.memory.moving = false;

  if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
      let result = creep.Boost();
      if(!result) {
          return;
      }
  }

}


const roleCCKparty = {
  run,
  //run: run,
  //function2,
  //function3
};
export default roleCCKparty;
