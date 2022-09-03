let roleRemoteWorker = require('./role.remoteWorker');
let roleAttacker = require('./role.attacker');
let roleClaimer = require('./role.claimer');
// let roleDefender = require('./role.defender');
let roleBuildContainer = require('./role.buildcontainer');
let roleCarry = require('./role.carry');


const roleColoBuild = require('./role.colobuild');

let creepFunctions = require('./creepFunctions');

let rooms = require('./rooms');
let roomPositionFunctions = require('./roomPositionFunctions');



global.ROLES = {
    worker: require('./role.worker'),

    MineralMiner: require('./role.mineralMiner'),

    EnergyMiner : require('./role.energyMiner'),
    carry: require('./role.carry'),
    RemoteRepair: require('./role.remoteRepair'),
    builder: require('./role.builder'),
    upgrader: require('./role.upgrader'),
    filler: require('./role.filler'),
    repair: require('./role.repair'),
    defender: require('./role.defender'),
    attacker: require('./role.attacker'),
    // scout: require('./role.scout'),
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