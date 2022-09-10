let creepFunctions = require('./creepFunctions');
let rooms = require('./rooms');
let roomPositionFunctions = require('./roomPositionFunctions');


global.ROLES = {
    worker: require('./role.worker'),

    MineralMiner: require('./role.mineralMiner'),

    EnergyMiner : require('./role.energyMiner'),
    carry: require('./role.carry'),

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
                break;
            }
            ROLES[creep.memory.role].run(creep);
        }
    }
    
    if(Game.time % 25 == 1) {
        console.log(Game.cpu.bucket, 'unused cpu in my bucket');
    }
}