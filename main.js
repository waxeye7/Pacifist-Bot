let creepFunctions = require('./creepFunctions');
let roomFunctions = require('./roomFunctions')
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
    const start = Game.cpu.getUsed()
    rooms();
    console.log('Rooms Ran in', Math.floor((Game.cpu.getUsed() - start) * 1000) / 1000, 'ms')

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
    
    if(Game.time % 17 == 1) {
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