let rooms = require('./rooms');

require('./creepFunctions');
require('./roomFunctions')
require('./roomPositionFunctions');


global.ROLES = {
    MineralMiner: require('./role.mineralMiner'),

    EnergyMiner : require('./role.energyMiner'),
    carry: require('./role.carry'),

    EnergyManager: require('./role.energyManager'),

    Dismantler: require('./role.Dismantler'),
    RemoteRepair: require('./role.remoteRepair'),


    builder: require('./role.builder'),
    upgrader: require('./role.upgrader'),
    repair: require('./role.repair'),
    
    filler: require('./role.filler'),
    defender: require('./role.defender'),

    attacker: require('./role.attacker'),
    RangedAttacker: require('./role.RangedAttacker'),

    DrainTower: require('./role.DrainTower'),
    healer: require('./role.healer'),

    buildcontainer: require('./role.buildcontainer'),
    claimer: require('./role.claimer'),
    RemoteDismantler: require('./role.remoteDismantler'),
    scout: require('./role.scout'),
}


module.exports.loop = function () {

    rooms();

    for(let name in Memory.creeps) {
        let creep = Game.creeps[name];
        if(!creep) {
            delete Memory.creeps[name];
        }
        else {
            if(creep.memory.role == undefined) {
                console.log("i am undefined", name)
                creep.suicide();
                break;
            }
            ROLES[creep.memory.role].run(creep);
        }
    }

    if(Game.time % 17 == 1 && Game.shard.name == "shard0" || 
       Game.time % 17 == 1 && Game.shard.name == "shard1" || 
       Game.time % 17 == 1 && Game.shard.name == "shard2" || 
       Game.time % 17 == 1 && Game.shard.name == "shard3") {
        console.log(" ");
        console.log("------------------------",Game.cpu.bucket, 'unused cpu in my bucket', "------------------------");
        console.log(" ");
        if(Game.cpu.bucket == 10000) {
            if(Game.cpu.generatePixel() == 0) {
                console.log('1');
                console.log('2');
                console.log('3');
                console.log('4');
                console.log('5');
                console.log('6');
                console.log('7');
                console.log('8');
                console.log('9');
                console.log('x');
                console.log('generating pixel');
                console.log('x');
                console.log('9');
                console.log('8');
                console.log('7');
                console.log('6');
                console.log('5');
                console.log('4');
                console.log('3');
                console.log('2');
                console.log('1');
            }
        }
    }
}