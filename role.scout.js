/**
 * A little description of this function 
 * @param {Creep} creep
 **/

 const run = function (creep) {
    if(creep.room.name == 'W7N8') {
        creep.moveTo(24,32);
    }
    else {
        creep.moveTo(25,0);
    }
}

const roleScout = {
    run,
    //run: run,
    //function2,
    //function3
};

module.exports = roleScout;