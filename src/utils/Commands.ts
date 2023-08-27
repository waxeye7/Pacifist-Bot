global.showBoosts = function () {

    let descriptions = {
        'XGH2O': 'UPGRADE',
        'GH2O': 'UPGRADE',
        'GH': 'UPGRADE',

        'XLH2O': 'REPAIR',
        'LH2O': 'REPAIR',
        'LH': 'REPAIR',

        'XUHO2': 'HARVEST',
        'UHO2': 'HARVEST',
        'UO': 'HARVEST',

        'XZH2O': 'DISMANTLE',
        'ZH2O': 'DISMANTLE',
        'ZH': 'DISMANTLE',

        'XUH2O': 'ATTACK',
        'UH2O': 'ATTACK',
        'UH': 'ATTACK',

        'XKHO2': 'R_ATTACK',
        'KHO2': 'R_ATTACK',
        'KO': 'R_ATTACK',

        'XLHO2': 'HEAL',
        'LHO2': 'HEAL',
        'LO': 'HEAL',

        'XKH2O': 'CARRY',
        'KH2O': 'CARRY',
        'KH': 'CARRY',

        'XGHO2': 'TOUGH',
        'GHO2': 'TOUGH',
        'GO': 'TOUGH',

        'XZHO2': 'MOVE',
        'ZHO2': 'MOVE',
        'ZO': 'MOVE',
    }

    let msg = '', sum = 0;
    ['XUH2O', 'XUHO2', 'XKH2O', 'XKHO2', 'XLH2O', 'XLHO2', 'XZH2O', 'XZHO2', 'XGH2O', 'XGHO2'].forEach(res => {
        let resCounter = 0
        _.filter(Game.rooms, r => r.controller && r.controller.my).forEach(mr => {
            if (mr.storage) resCounter += mr.storage.store[res]
            if (mr.terminal) resCounter += mr.terminal.store[res]
        })
        msg += res + ': ' + numberWithSpaces(resCounter) + '\t' + (descriptions[res] ? descriptions[res] : '') + '\n'; sum += resCounter
    })
    console.log('sum: ' + numberWithSpaces(sum) + '\n' + msg)

    function numberWithSpaces(x) {
        if (typeof x !== 'number') { return x }
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

}


global.lock_room = function (homeRoom, targetRoom) {
    let room = Game.rooms[homeRoom];
    let storage = room.storage
    if(room && room.controller.level === 8 && storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= 1000 && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 2000  && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] >= 2000 && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 1000) {


        let newName3 = 'Escort' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL], newName3, {memory: {role: 'Escort', targetRoom: targetRoom, homeRoom:room.name, line:1, boostlabs:[room.memory.labs.outputLab2, room.memory.labs.outputLab4, room.memory.labs.outputLab5, room.memory.labs.outputLab7] }});
        console.log('Adding Escort to Spawn List: ' + newName3);

        if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
            room.memory.labs.status.boost = {};
        }
        if(room.memory.labs.status.boost) {
            if(room.memory.labs.status.boost.lab2) {
                room.memory.labs.status.boost.lab2.amount += 300;
                room.memory.labs.status.boost.lab2.use += 1;
            }
            else {
                room.memory.labs.status.boost.lab2 = {};
                room.memory.labs.status.boost.lab2.amount = 300;
                room.memory.labs.status.boost.lab2.use = 1;
            }
            if(room.memory.labs.status.boost.lab4) {
                room.memory.labs.status.boost.lab4.amount += 750;
                room.memory.labs.status.boost.lab4.use += 1;
            }
            else {
                room.memory.labs.status.boost.lab4 = {};
                room.memory.labs.status.boost.lab4.amount = 750;
                room.memory.labs.status.boost.lab4.use = 1;
            }
            if(room.memory.labs.status.boost.lab5) {
                room.memory.labs.status.boost.lab5.amount += 300;
                room.memory.labs.status.boost.lab5.use += 1;
            }
            else {
                room.memory.labs.status.boost.lab5 = {};
                room.memory.labs.status.boost.lab5.amount = 300;
                room.memory.labs.status.boost.lab5.use = 1;
            }
            if(room.memory.labs.status.boost.lab7) {
                room.memory.labs.status.boost.lab7.amount += 150;
                room.memory.labs.status.boost.lab7.use += 1;
            }
            else {
                room.memory.labs.status.boost.lab7 = {};
                room.memory.labs.status.boost.lab7.amount = 150;
                room.memory.labs.status.boost.lab7.use = 1;
            }
        }



        let newName2 = 'RoomLocker' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.push([MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,CARRY,MOVE,WORK,CARRY,MOVE], newName2, {memory: {role: 'RoomLocker', targetRoom: targetRoom, homeRoom:room.name, line:3}});
        console.log('Adding RoomLocker to Spawn List: ' + newName2);


    }
}

global.spawn_hunting_party = function(homeRoomName, targetRoomName, amountToSpawn) {
    if(amountToSpawn > 5) {
        amountToSpawn = 5;
    }
    let room = Game.rooms[homeRoomName];
    if (room && room.controller && room.controller.my && room.controller.level === 8) {
        let amountZYN_ALK = 90*amountToSpawn + 600 + 30;
        if(amountToSpawn >= 2) {
            amountZYN_ALK -= 30;
        }
        let amountGHO_ALK = 30*amountToSpawn + 300;
        if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
            room.memory.labs.status.boost = {};
        }
        if(room.memory.labs.status.boost) {
            if(room.memory.labs.status.boost.lab2) {
                room.memory.labs.status.boost.lab2.amount += amountZYN_ALK;
                room.memory.labs.status.boost.lab2.use += (2+amountToSpawn);
            }
            else {
                room.memory.labs.status.boost.lab2 = {};
                room.memory.labs.status.boost.lab2.amount = amountZYN_ALK;
                room.memory.labs.status.boost.lab2.use = (2+amountToSpawn);
            }
            if(room.memory.labs.status.boost.lab3) {
                room.memory.labs.status.boost.lab3.amount += 300;
                room.memory.labs.status.boost.lab3.use += 2;
            }
            else {
                room.memory.labs.status.boost.lab3 = {};
                room.memory.labs.status.boost.lab3.amount = 300;
                room.memory.labs.status.boost.lab3.use = 2;
            }
            if(room.memory.labs.status.boost.lab4) {
                room.memory.labs.status.boost.lab4.amount += 1200;
                room.memory.labs.status.boost.lab4.use += 2;
            }
            else {
                room.memory.labs.status.boost.lab4 = {};
                room.memory.labs.status.boost.lab4.amount = 1200;
                room.memory.labs.status.boost.lab4.use = 2;
            }
            if(room.memory.labs.status.boost.lab5) {
                room.memory.labs.status.boost.lab5.amount += 600;
                room.memory.labs.status.boost.lab5.use += 2;
            }
            else {
                room.memory.labs.status.boost.lab5 = {};
                room.memory.labs.status.boost.lab5.amount = 600;
                room.memory.labs.status.boost.lab5.use = 2;
            }
            if(room.memory.labs.status.boost.lab7) {
                room.memory.labs.status.boost.lab7.amount += amountGHO_ALK;
                room.memory.labs.status.boost.lab7.use += (2+amountToSpawn);
            }
            else {
                room.memory.labs.status.boost.lab7 = {};
                room.memory.labs.status.boost.lab7.amount = amountGHO_ALK;
                room.memory.labs.status.boost.lab7.use = (2+amountToSpawn);
            }
        }

        let newNameA = "FreedomFighter-party-1-" + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding FreedomFighter to Spawn List: ' + newNameA);
        room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL], newNameA, { memory: { role: 'FreedomFighter', targetRoom: targetRoomName, homeRoom: homeRoomName, line:1, lineLength:2+amountToSpawn, boostlabs:[room.memory.labs.outputLab2, room.memory.labs.outputLab3, room.memory.labs.outputLab4, room.memory.labs.outputLab5, room.memory.labs.outputLab7] } });

        let newNameB = `FreedomFighter-party-${amountToSpawn+2}-` + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding FreedomFighter to Spawn List: ' + newNameB);
        room.memory.spawn_list.push([TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL], newNameB, { memory: { role: 'FreedomFighter', targetRoom: targetRoomName, homeRoom: homeRoomName, line:amountToSpawn+2, boostlabs:[room.memory.labs.outputLab2, room.memory.labs.outputLab3, room.memory.labs.outputLab4, room.memory.labs.outputLab5, room.memory.labs.outputLab7] } });

        let newNameFiller = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE,CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newNameFiller, { memory: { role: 'filler' } });
        console.log('Adding filler to Spawn List: ' + newNameFiller);



        let newName = 'ContinuousControllerKiller-party-2-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName);
        room.memory.spawn_list.push([TOUGH,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,MOVE,MOVE,MOVE,MOVE], newName, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:2, boostlabs:[room.memory.labs.outputLab2,room.memory.labs.outputLab7] } });

        amountToSpawn--;
        if(amountToSpawn === 0)  return;


        let normalBody = [TOUGH,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,MOVE,MOVE,MOVE];
        let lastBody = [TOUGH,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,CLAIM,MOVE,MOVE];

        let body2 = normalBody;
        if(amountToSpawn === 1) {
            body2 = lastBody
        }
        let newName2 = 'ContinuousControllerKiller-party-3-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName2);
        room.memory.spawn_list.push(body2, newName2, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:3, boostlabs:[room.memory.labs.outputLab2,room.memory.labs.outputLab7] } });

        amountToSpawn--;
        if(amountToSpawn === 0)  return;

        let body3 = normalBody;
        if(amountToSpawn === 1) {
            body3 = lastBody
        }
        let newName3 = 'ContinuousControllerKiller-party-4-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName3);
        room.memory.spawn_list.push(body3, newName3, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:4, boostlabs:[room.memory.labs.outputLab2,room.memory.labs.outputLab7] } });

        amountToSpawn--;
        if(amountToSpawn === 0)  return;

        let body4 = normalBody;
        if(amountToSpawn === 1) {
            body4 = lastBody
        }
        let newName4 = 'ContinuousControllerKiller-party-5-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName4);
        room.memory.spawn_list.push(body4, newName4, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:5, boostlabs:[room.memory.labs.outputLab2,room.memory.labs.outputLab7] } });

        amountToSpawn--;
        if(amountToSpawn === 0)  return;

        let newName5 = 'ContinuousControllerKiller-party-6-' + Math.floor(Math.random() * Game.time) + "-" + homeRoomName + "-" + targetRoomName;
        console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName5);
        room.memory.spawn_list.push(lastBody, newName5, { memory: { role: 'CCKparty', targetRoom: targetRoomName, homeRoom: homeRoomName, line:6, boostlabs:[room.memory.labs.outputLab2,room.memory.labs.outputLab7] } });


    }
}


global.SMDP = function (roomName, targetRoomName) {
    let room = Game.rooms[roomName];
    if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].storage && Game.rooms[targetRoomName].controller && Game.rooms[targetRoomName].controller.level >= 4) {
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        if (storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 1200 &&
            storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 300 &&
            room.memory.labs.outputLab3 && room.memory.labs.outputLab2 && room.memory.labs.outputLab7 && Game.rooms[targetRoomName].controller.my &&
            Game.rooms[targetRoomName].controller.level >= 3 && Game.rooms[targetRoomName].controller.level <= 5 && !Game.rooms[targetRoomName].controller.safeMode) {

            let body = [
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,MOVE, MOVE, MOVE, MOVE
            ];

            let newName = 'Guard-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push(body, newName, { memory: { role: 'Guard', homeRoom: roomName, targetRoom: targetRoomName, boostlabs: [room.memory.labs.outputLab3, room.memory.labs.outputLab2], again: true } });
            console.log('Adding Guard to Spawn List: ' + newName + roomName, targetRoomName);


            if (room.memory.labs.status && !room.memory.labs.status.boost) {
                room.memory.labs.status.boost = {};
            }

            if (room.memory.labs.status.boost) {
                // zyn alk
                if (room.memory.labs.status.boost.lab2) {
                    room.memory.labs.status.boost.lab2.amount = room.memory.labs.status.boost.lab2.amount + 300;
                    room.memory.labs.status.boost.lab2.use += 1;
                }
                else {
                    room.memory.labs.status.boost.lab2 = {};
                    room.memory.labs.status.boost.lab2.amount = 300;
                    room.memory.labs.status.boost.lab2.use = 1;
                }
                // utrium acid
                if (room.memory.labs.status.boost.lab3) {
                    room.memory.labs.status.boost.lab3.amount = room.memory.labs.status.boost.lab3.amount + 1200;
                    room.memory.labs.status.boost.lab3.use += 1;
                }
                else {
                    room.memory.labs.status.boost.lab3 = {};
                    room.memory.labs.status.boost.lab3.amount = 1200;
                    room.memory.labs.status.boost.lab3.use = 1;
                }
            }
            return "Success";

        }
    }
    else {
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        if (storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= 300 && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 900 &&
            storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 300 &&
            room.memory.labs.outputLab3 && room.memory.labs.outputLab2 && room.memory.labs.outputLab7 && Game.rooms[targetRoomName].controller.my &&
            Game.rooms[targetRoomName].controller.level >= 3 && Game.rooms[targetRoomName].controller.level <= 5 && !Game.rooms[targetRoomName].controller.safeMode) {

            let body = [
                TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                MOVE, MOVE, MOVE, MOVE,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
            ];

            let newName = 'Guard-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push(body, newName, { memory: { role: 'Guard', homeRoom: roomName, targetRoom: targetRoomName, boostlabs: [room.memory.labs.outputLab3, room.memory.labs.outputLab2, room.memory.labs.outputLab7], again: true } });
            console.log('Adding Guard to Spawn List: ' + newName + roomName, targetRoomName);


            if (room.memory.labs.status && !room.memory.labs.status.boost) {
                room.memory.labs.status.boost = {};
            }

            if (room.memory.labs.status.boost) {
                // zyn alk
                if (room.memory.labs.status.boost.lab2) {
                    room.memory.labs.status.boost.lab2.amount = room.memory.labs.status.boost.lab2.amount + 300;
                    room.memory.labs.status.boost.lab2.use += 1;
                }
                else {
                    room.memory.labs.status.boost.lab2 = {};
                    room.memory.labs.status.boost.lab2.amount = 300;
                    room.memory.labs.status.boost.lab2.use = 1;
                }
                // utrium acid
                if (room.memory.labs.status.boost.lab3) {
                    room.memory.labs.status.boost.lab3.amount = room.memory.labs.status.boost.lab3.amount + 900;
                    room.memory.labs.status.boost.lab3.use += 1;
                }
                else {
                    room.memory.labs.status.boost.lab3 = {};
                    room.memory.labs.status.boost.lab3.amount = 900;
                    room.memory.labs.status.boost.lab3.use = 1;
                }
                // gho alk
                if (room.memory.labs.status.boost.lab7) {
                    room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 300;
                    room.memory.labs.status.boost.lab7.use += 1;
                }
                else {
                    room.memory.labs.status.boost.lab7 = {};
                    room.memory.labs.status.boost.lab7.amount = 300;
                    room.memory.labs.status.boost.lab7.use = 1;
                }
            }
            return "Success";

        }
    }
    return "Fail";
}

global.SCCK = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level === 8) {

            let newName = 'ContinuousControllerKiller-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName);

            Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM,ATTACK,MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'CCK', targetRoom: targetRoomName, homeRoom: homeRoom } });
            return "Success!";
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 8). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the ContinuousControllerKiller from...")
    }
    return "Failed to spawn";
}

global.SCCK2 = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level === 8 && Game.rooms[homeRoom].storage?.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= 50 && Game.rooms[homeRoom].storage?.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 100) {

            let newName = 'ContinuousControllerKiller-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding ContinuousControllerKiller to Spawn List: ' + newName);

            Game.rooms[homeRoom].memory.spawn_list.push([TOUGH, HEAL, HEAL, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, CLAIM, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'CCK', targetRoom: targetRoomName, homeRoom: homeRoom, boostlabs: [Game.rooms[homeRoom].memory.labs.outputLab5, Game.rooms[homeRoom].memory.labs.outputLab7] } });

            if (Game.rooms[homeRoom].memory.labs.status && !Game.rooms[homeRoom].memory.labs.status.boost) {
                Game.rooms[homeRoom].memory.labs.status.boost = {};
            }

            if (Game.rooms[homeRoom].memory.labs.status.boost) {

                // lemer alk
                if (Game.rooms[homeRoom].memory.labs.status.boost.lab5) {
                    Game.rooms[homeRoom].memory.labs.status.boost.lab5.amount = Game.rooms[homeRoom].memory.labs.status.boost.lab5.amount + 60;
                    Game.rooms[homeRoom].memory.labs.status.boost.lab5.use += 1;
                }
                else {
                    Game.rooms[homeRoom].memory.labs.status.boost.lab5 = {};
                    Game.rooms[homeRoom].memory.labs.status.boost.lab5.amount = 60;
                    Game.rooms[homeRoom].memory.labs.status.boost.lab5.use = 1;
                }

                // gho alk
                if (Game.rooms[homeRoom].memory.labs.status.boost.lab7) {
                    Game.rooms[homeRoom].memory.labs.status.boost.lab7.amount = Game.rooms[homeRoom].memory.labs.status.boost.lab7.amount + 30;
                    Game.rooms[homeRoom].memory.labs.status.boost.lab7.use += 1;
                }
                else {
                    Game.rooms[homeRoom].memory.labs.status.boost.lab7 = {};
                    Game.rooms[homeRoom].memory.labs.status.boost.lab7.amount = 30;
                    Game.rooms[homeRoom].memory.labs.status.boost.lab7.use = 1;
                }
            }


            return "Success!";
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 8). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the ContinuousControllerKiller from...")
    }
    return "Failed to spawn";
}

global.spawnConvoy = function (roomName, targetRoomName) {
    let room = Game.rooms[roomName];
    if (room) {
        let newName = 'Convoy-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        let body = [];
        if(Memory.delayConvoy && Memory.delayConvoy[roomName] &&Memory.delayConvoy[roomName] > 3000) {
            body = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, ATTACK,ATTACK,ATTACK, ATTACK, ATTACK, MOVE];
        }
        else if(Memory.delayConvoy && Memory.delayConvoy[roomName] && Memory.delayConvoy[roomName] > 1000) {
            body = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, ATTACK, ATTACK, MOVE];
        }
        else {
            body = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,CARRY, MOVE]
        }
        room.memory.spawn_list.push(body,
        newName, { memory: { role: 'Convoy', homeRoom: roomName, targetRoom: targetRoomName } });
        console.log('Adding Convoy to Spawn List: ' + newName);

        return "Success!";
    }
    return "Failed to spawn Convoy to room " + targetRoomName;
}


global.spawnSafeModer = function (roomName, targetRoomName) {
    let room = Game.rooms[roomName];
    if (room) {
        let newName = 'SafeModer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
        let body = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE];
        room.memory.spawn_list.push(body,
            newName, { memory: { role: 'SafeModer', homeRoom: targetRoomName, targetRoom: targetRoomName } });
        console.log('Adding SafeModer to Spawn List: ' + newName);

        return "Success!";
    }
    return "Failed to spawn Convoy to room " + targetRoomName;
}


global.SS = function (roomName, targetRoomName, backupTR = ""): any {
    let room = Game.rooms[roomName];
    if (room) {
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        if (storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= 270 && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] >= 330 &&
            storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 300 && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 270) {

            let body = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
                HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
                HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];

            let newName = 'Solomon-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push(body, newName, { memory: { role: 'Solomon', homeRoom: roomName, targetRoom: targetRoomName, backupTR: backupTR, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab4, room.memory.labs.outputLab5, room.memory.labs.outputLab7] } });
            console.log('Adding Solomon to Spawn List: ' + newName + roomName, targetRoomName);


            if (room.memory.labs.status && !room.memory.labs.status.boost) {
                room.memory.labs.status.boost = {};
            }

            if (room.memory.labs.status.boost) {
                // kean alk
                if (room.memory.labs.status.boost.lab4) {
                    room.memory.labs.status.boost.lab4.amount += 330;
                    room.memory.labs.status.boost.lab4.use += 1;
                }
                else {
                    room.memory.labs.status.boost.lab4 = {};
                    room.memory.labs.status.boost.lab4.amount = 330;
                    room.memory.labs.status.boost.lab4.use = 1;
                }
                // lemer alk
                if (room.memory.labs.status.boost.lab5) {
                    room.memory.labs.status.boost.lab5.amount = room.memory.labs.status.boost.lab5.amount + 600;
                    room.memory.labs.status.boost.lab5.use += 1;
                }
                else {
                    room.memory.labs.status.boost.lab5 = {};
                    room.memory.labs.status.boost.lab5.amount = 600;
                    room.memory.labs.status.boost.lab5.use = 1;
                }
                // zyn alk
                if (room.memory.labs.status.boost.lab2) {
                    room.memory.labs.status.boost.lab2.amount = room.memory.labs.status.boost.lab2.amount + 300;
                    room.memory.labs.status.boost.lab2.use += 1;
                }
                else {
                    room.memory.labs.status.boost.lab2 = {};
                    room.memory.labs.status.boost.lab2.amount = 300;
                    room.memory.labs.status.boost.lab2.use = 1;
                }
                // gho alk
                if (room.memory.labs.status.boost.lab7) {
                    room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 270;
                    room.memory.labs.status.boost.lab7.use += 1;
                }
                else {
                    room.memory.labs.status.boost.lab7 = {};
                    room.memory.labs.status.boost.lab7.amount = 270;
                    room.memory.labs.status.boost.lab7.use = 1;
                }
            }
            return "Success";

        }
    }
    return "Fail";
}


global.SD = function (roomName, targetRoomName, boost = false): any {
    let bodyRam6 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK]
    let bodyRam7 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];
    let bodyRam8 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];

    let bodySignifer6 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    let bodySignifer7 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    let bodySignifer8 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];

    let bodyRam8Boosted = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];

    let bodySignifer8Boosted = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];

    let room = Game.rooms[roomName];

    if (room && room.controller && room.controller.my) {
        let creepsInRoom = room.find(FIND_MY_CREEPS);
        let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
        if (fillers < 2) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }
        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }


        if (room.controller.level == 6) {
            let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer6,
                newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam6,
                newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if (room.controller.level == 7) {
            let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer7,
                newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam7,
                newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if (room.controller.level == 8) {
            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 600 && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 1050 &&
                storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 1050 && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= 300 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab3 && room.memory.labs.outputLab5 && room.memory.labs.outputLab7) {
                if (room.memory.labs.status && !room.memory.labs.status.boost) {
                    room.memory.labs.status.boost = {};
                }

                if (room.memory.labs.status.boost) {
                    // utrium acid
                    if (room.memory.labs.status.boost.lab3) {
                        room.memory.labs.status.boost.lab3.amount = room.memory.labs.status.boost.lab3.amount + 1050;
                        room.memory.labs.status.boost.lab3.use += 1;
                    }
                    else {
                        room.memory.labs.status.boost.lab3 = {};
                        room.memory.labs.status.boost.lab3.amount = 1050;
                        room.memory.labs.status.boost.lab3.use = 1;
                    }
                    // lemer alk
                    if (room.memory.labs.status.boost.lab5) {
                        room.memory.labs.status.boost.lab5.amount = room.memory.labs.status.boost.lab5.amount + 1050;
                        room.memory.labs.status.boost.lab5.use += 1;
                    }
                    else {
                        room.memory.labs.status.boost.lab5 = {};
                        room.memory.labs.status.boost.lab5.amount = 1050;
                        room.memory.labs.status.boost.lab5.use = 1;
                    }
                    // zyn alk
                    if (room.memory.labs.status.boost.lab2) {
                        room.memory.labs.status.boost.lab2.amount = room.memory.labs.status.boost.lab2.amount + 600;
                        room.memory.labs.status.boost.lab2.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab2 = {};
                        room.memory.labs.status.boost.lab2.amount = 600;
                        room.memory.labs.status.boost.lab2.use = 2;
                    }
                    // gho alk
                    if (room.memory.labs.status.boost.lab7) {
                        room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 300;
                        room.memory.labs.status.boost.lab7.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab7 = {};
                        room.memory.labs.status.boost.lab7.amount = 300;
                        room.memory.labs.status.boost.lab7.use = 2;
                    }
                }


                let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodyRam8Boosted,
                    newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName, boostlabs: [room.memory.labs.outputLab3, room.memory.labs.outputLab2, room.memory.labs.outputLab7] } });
                console.log('Adding Ram to Spawn List: ' + newNameRam);

                let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodySignifer8Boosted,
                    newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName, boostlabs: [room.memory.labs.outputLab5, room.memory.labs.outputLab2, room.memory.labs.outputLab7] } });
                console.log('Adding Signifer to Spawn List: ' + newNameSignifer);




                return "Success with boost";
            }
            else if (room.controller.level == 8 && !boost) {
                let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodySignifer8,
                    newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
                console.log('Adding Signifer to Spawn List: ' + newNameSignifer);


                let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodyRam8,
                    newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
                console.log('Adding Ram to Spawn List: ' + newNameRam);

                return "Success without boost";
            }


        }

    }

}

global.SDB = function (roomName, targetRoomName, boost = false, defendController = false): any {
    let bodyRam6 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK]
    let bodyRam7 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];
    let bodyRam8 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];

    let bodySignifer6 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    let bodySignifer7 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];
    let bodySignifer8 = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
        HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL];

    let bodyRam8Boosted = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        TOUGH, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];

    let bodySignifer8Boosted = [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        TOUGH, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        HEAL, HEAL, HEAL, HEAL, HEAL,
        MOVE, MOVE, MOVE, MOVE, MOVE,
        MOVE, MOVE, MOVE, MOVE, MOVE];

    let room = Game.rooms[roomName];

    if (room && room.controller && room.controller.my) {
        let creepsInRoom = room.find(FIND_MY_CREEPS);
        let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
        if (fillers < 2) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }
        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }


        if (room.controller.level == 6) {
            let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer6,
                newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam6,
                newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if (room.controller.level == 7) {
            let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodySignifer7,
                newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);

            let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
            room.memory.spawn_list.push(bodyRam7,
                newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
            console.log('Adding Ram to Spawn List: ' + newNameRam);



            return "Success";
        }

        else if (room.controller.level == 8) {
            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 600 && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 870 &&
                storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 870 && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] >= 660 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab3 && room.memory.labs.outputLab5 && room.memory.labs.outputLab7) {
                if (room.memory.labs.status && !room.memory.labs.status.boost) {
                    room.memory.labs.status.boost = {};
                }

                if (room.memory.labs.status.boost) {
                    // utrium acid
                    if (room.memory.labs.status.boost.lab3) {
                        room.memory.labs.status.boost.lab3.amount = room.memory.labs.status.boost.lab3.amount + 870;
                        room.memory.labs.status.boost.lab3.use += 1;
                    }
                    else {
                        room.memory.labs.status.boost.lab3 = {};
                        room.memory.labs.status.boost.lab3.amount = 870;
                        room.memory.labs.status.boost.lab3.use = 1;
                    }
                    // lemer alk
                    if (room.memory.labs.status.boost.lab5) {
                        room.memory.labs.status.boost.lab5.amount = room.memory.labs.status.boost.lab5.amount + 870;
                        room.memory.labs.status.boost.lab5.use += 1;
                    }
                    else {
                        room.memory.labs.status.boost.lab5 = {};
                        room.memory.labs.status.boost.lab5.amount = 870;
                        room.memory.labs.status.boost.lab5.use = 1;
                    }
                    // zyn alk
                    if (room.memory.labs.status.boost.lab2) {
                        room.memory.labs.status.boost.lab2.amount = room.memory.labs.status.boost.lab2.amount + 600;
                        room.memory.labs.status.boost.lab2.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab2 = {};
                        room.memory.labs.status.boost.lab2.amount = 600;
                        room.memory.labs.status.boost.lab2.use = 2;
                    }
                    // gho alk
                    if (room.memory.labs.status.boost.lab7) {
                        room.memory.labs.status.boost.lab7.amount = room.memory.labs.status.boost.lab7.amount + 660;
                        room.memory.labs.status.boost.lab7.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab7 = {};
                        room.memory.labs.status.boost.lab7.amount = 660;
                        room.memory.labs.status.boost.lab7.use = 2;
                    }
                }


                let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodyRam8Boosted,
                    newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName, boostlabs: [room.memory.labs.outputLab3, room.memory.labs.outputLab2, room.memory.labs.outputLab7], defendController:true } });
                console.log('Adding Ram to Spawn List: ' + newNameRam);

                let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodySignifer8Boosted,
                    newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab5, room.memory.labs.outputLab7] } });
                console.log('Adding Signifer to Spawn List: ' + newNameSignifer);




                return "Success with boost";
            }
            else if (room.controller.level == 8 && !boost) {
                let newNameSignifer = 'Signifer-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodySignifer8,
                    newNameSignifer, { memory: { role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName } });
                console.log('Adding Signifer to Spawn List: ' + newNameSignifer);


                let newNameRam = 'Ram-' + Math.floor(Math.random() * Game.time) + "-" + roomName;
                room.memory.spawn_list.push(bodyRam8,
                    newNameRam, { memory: { role: 'ram', targetRoom: targetRoomName, homeRoom: roomName } });
                console.log('Adding Ram to Spawn List: ' + newNameRam);

                return "Success without boost";
            }


        }

    }

}

global.SQR = function (roomName, targetRoomName, boost = false): any {

    let room = Game.rooms[roomName];
    let creepsInRoom = room.find(FIND_MY_CREEPS);
    let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
    let CreepA = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepA"; }).length;
    let CreepB = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepB"; }).length;
    let CreepY = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepY"; }).length;
    let CreepZ = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepZ"; }).length;
    if (room.controller.level >= 6 && CreepA == 0 && CreepB == 0 && CreepY == 0 && CreepZ == 0) {

        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }

        if (fillers < 4) {
            let newName2 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName2, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName2);
        }

        if (fillers < 5) {
            let newName3 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName3, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName3);
        }


        if (Memory.CanClaimRemote >= 1) {
            let newName = 'WallClearer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, CLAIM, MOVE], newName, { memory: { role: 'WallClearer', homeRoom: room.name, targetRoom: targetRoomName } });
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }

        let bodyLevel6Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];
        let bodyLevel6Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE];

        let bodyLevel7Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];

        let bodyLevel7Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE];



        let bodyLevel8Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE]

        let bodyLevel8BoostedBack = [HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8BoostedFront = [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
            MOVE];


        let RandomWords = Math.floor(Math.random() * Game.time)

        if (room.controller.level == 6) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameA, { memory: { role: 'SquadCreepA', targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameB, { memory: { role: 'SquadCreepB' } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameY, { memory: { role: 'SquadCreepY' } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }
        else if (room.controller.level == 7) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }

        else if (room.controller.level == 8) {



            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 1200 && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] >= 2400 &&
                storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 2400 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab4 && room.memory.labs.outputLab5) {

                if (room.memory.labs.status && !room.memory.labs.status.boost) {
                    room.memory.labs.status.boost = {};
                }

                if (room.memory.labs.status.boost) {
                    // lemer alk
                    if (room.memory.labs.status.boost.lab5) {
                        room.memory.labs.status.boost.lab5.amount = room.memory.labs.status.boost.lab5.amount + 2400;
                        room.memory.labs.status.boost.lab5.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab5 = {};
                        room.memory.labs.status.boost.lab5.amount = 2400;
                        room.memory.labs.status.boost.lab5.use = 2;
                    }
                    // keanium alk
                    if (room.memory.labs.status.boost.lab4) {
                        room.memory.labs.status.boost.lab4.amount = room.memory.labs.status.boost.lab4.amount + 2400;
                        room.memory.labs.status.boost.lab4.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab4 = {};
                        room.memory.labs.status.boost.lab4.amount = 2400;
                        room.memory.labs.status.boost.lab4.use = 2;
                    }
                    // zyn alk
                    if (room.memory.labs.status.boost.lab2) {
                        room.memory.labs.status.boost.lab2.amount = room.memory.labs.status.boost.lab2.amount + 1200;
                        room.memory.labs.status.boost.lab2.use += 4;
                    }
                    else {
                        room.memory.labs.status.boost.lab2 = {};
                        room.memory.labs.status.boost.lab2.amount = 1200;
                        room.memory.labs.status.boost.lab2.use = 4;
                    }
                }

                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab5], targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab5] } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab4] } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab4] } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success with boost";


            }

            else if (room.controller.level == 8 && !boost) {
                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success!"
            }


        }
    }



}

global.SQM = function (roomName, targetRoomName, boost = false): any {

    let room = Game.rooms[roomName];
    let creepsInRoom = room.find(FIND_MY_CREEPS);
    let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
    let CreepA = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepA"; }).length;
    let CreepB = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepB"; }).length;
    let CreepY = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepY"; }).length;
    let CreepZ = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepZ"; }).length;
    if (room.controller.level >= 6 && CreepA == 0 && CreepB == 0 && CreepY == 0 && CreepZ == 0) {

        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }

        if (fillers < 4) {
            let newName2 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName2, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName2);
        }

        if (fillers < 5) {
            let newName3 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName3, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName3);
        }

        if (Memory.CanClaimRemote >= 1) {
            let newName = 'WallClearer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, CLAIM, MOVE], newName, { memory: { role: 'WallClearer', homeRoom: room.name, targetRoom: targetRoomName } });
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }

        let bodyLevel6Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];
        let bodyLevel6Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            MOVE];

        let bodyLevel7Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];

        let bodyLevel7Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, MOVE];



        let bodyLevel8Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            MOVE]

        let bodyLevel8BoostedBack = [HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8BoostedFront = [ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK,
            MOVE];


        let RandomWords = Game.time

        if (room.controller.level == 6) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameA, { memory: { role: 'SquadCreepA', targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameB, { memory: { role: 'SquadCreepB' } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameY, { memory: { role: 'SquadCreepY' } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }
        else if (room.controller.level == 7) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }

        else if (room.controller.level == 8) {



            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 1200 && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 2400 &&
                storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 2400 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab3 && room.memory.labs.outputLab5) {

                if (room.memory.labs.status && !room.memory.labs.status.boost) {
                    room.memory.labs.status.boost = {};
                }

                if (room.memory.labs.status.boost) {
                    // lemer alk
                    if (room.memory.labs.status.boost.lab5) {
                        room.memory.labs.status.boost.lab5.amount = room.memory.labs.status.boost.lab5.amount + 2400;
                        room.memory.labs.status.boost.lab5.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab5 = {};
                        room.memory.labs.status.boost.lab5.amount = 2400;
                        room.memory.labs.status.boost.lab5.use = 2;
                    }
                    // UTRIUM ACID
                    if (room.memory.labs.status.boost.lab3) {
                        room.memory.labs.status.boost.lab3.amount = room.memory.labs.status.boost.lab3.amount + 2400;
                        room.memory.labs.status.boost.lab3.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab3 = {};
                        room.memory.labs.status.boost.lab3.amount = 2400;
                        room.memory.labs.status.boost.lab3.use = 2;
                    }
                    // zyn alk
                    if (room.memory.labs.status.boost.lab2) {
                        room.memory.labs.status.boost.lab2.amount = room.memory.labs.status.boost.lab2.amount + 1200;
                        room.memory.labs.status.boost.lab2.use += 4;
                    }
                    else {
                        room.memory.labs.status.boost.lab2 = {};
                        room.memory.labs.status.boost.lab2.amount = 1200;
                        room.memory.labs.status.boost.lab2.use = 4;
                    }
                }

                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab5], targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab5] } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab3] } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab3] } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success with boost";


            }

            else if (room.controller.level == 8 && !boost) {
                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success!"
            }


        }
    }



}

global.SQD = function (roomName, targetRoomName, boost = false): any {

    let room = Game.rooms[roomName];
    let creepsInRoom = room.find(FIND_MY_CREEPS);
    let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
    let CreepA = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepA"; }).length;
    let CreepB = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepB"; }).length;
    let CreepY = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepY"; }).length;
    let CreepZ = creepsInRoom.filter(function (creep) { return creep.memory.role == "SquadCreepZ"; }).length;
    if (room.controller.level >= 6 && CreepA == 0 && CreepB == 0 && CreepY == 0 && CreepZ == 0) {

        if (fillers < 3) {
            let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName);
        }

        if (fillers < 4) {
            let newName2 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName2, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName2);
        }

        if (fillers < 5) {
            let newName3 = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName3, { memory: { role: 'filler' } });
            console.log('Adding filler to Spawn List: ' + newName3);
        }

        if (Memory.CanClaimRemote >= 1) {
            let newName = 'WallClearer-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, CLAIM, MOVE], newName, { memory: { role: 'WallClearer', homeRoom: room.name, targetRoom: targetRoomName } });
            console.log('Adding wall-clearer to Spawn List: ' + newName);
        }

        let bodyLevel6Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];
        let bodyLevel6Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK,
            MOVE];

        let bodyLevel7Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, MOVE];

        let bodyLevel7Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, MOVE];



        let bodyLevel8Back = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8Front = [MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK,
            MOVE]

        let bodyLevel8BoostedBack = [HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
            MOVE];

        let bodyLevel8BoostedFront = [WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK, WORK, WORK,
            WORK, WORK, WORK, WORK,
            MOVE];


        let RandomWords = Math.floor(Math.random() * Game.time)

        if (room.controller.level == 6) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameA, { memory: { role: 'SquadCreepA', targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Back, newNameB, { memory: { role: 'SquadCreepB' } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameY, { memory: { role: 'SquadCreepY' } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel6Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }
        else if (room.controller.level == 7) {
            let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
            console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

            let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
            console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

            let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
            console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

            let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
            room.memory.spawn_list.push(bodyLevel7Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
            console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

            return "Success!"
        }

        else if (room.controller.level == 8) {



            let storage: any = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
            if (boost && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] >= 1200 && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] >= 2400 &&
                storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 2400 &&
                room.memory.labs && room.memory.labs.outputLab2 && room.memory.labs.outputLab5 && room.memory.labs.outputLab6) {

                if (room.memory.labs.status && !room.memory.labs.status.boost) {
                    room.memory.labs.status.boost = {};
                }

                if (room.memory.labs.status.boost) {
                    // lemer alk
                    if (room.memory.labs.status.boost.lab5) {
                        room.memory.labs.status.boost.lab5.amount = room.memory.labs.status.boost.lab5.amount + 2400;
                        room.memory.labs.status.boost.lab5.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab5 = {};
                        room.memory.labs.status.boost.lab5.amount = 2400;
                        room.memory.labs.status.boost.lab5.use = 2;
                    }
                    // ZYN ACID
                    if (room.memory.labs.status.boost.lab6) {
                        room.memory.labs.status.boost.lab6.amount = room.memory.labs.status.boost.lab6.amount + 2400;
                        room.memory.labs.status.boost.lab6.use += 2;
                    }
                    else {
                        room.memory.labs.status.boost.lab6 = {};
                        room.memory.labs.status.boost.lab6.amount = 2400;
                        room.memory.labs.status.boost.lab6.use = 2;
                    }
                    // zyn alk
                    if (room.memory.labs.status.boost.lab2) {
                        room.memory.labs.status.boost.lab2.amount = room.memory.labs.status.boost.lab2.amount + 1200;
                        room.memory.labs.status.boost.lab2.use += 4;
                    }
                    else {
                        room.memory.labs.status.boost.lab2 = {};
                        room.memory.labs.status.boost.lab2.amount = 1200;
                        room.memory.labs.status.boost.lab2.use = 4;
                    }
                }

                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab5], targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedBack, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab5] } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab6] } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8BoostedFront, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name, boostlabs: [room.memory.labs.outputLab2, room.memory.labs.outputLab6] } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success with boost";


            }

            else if (room.controller.level == 8 && !boost) {
                let newNameA = 'SquadCreepA-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameA, { memory: { role: 'SquadCreepA', homeRoom: room.name, targetPosition: new RoomPosition(25, 25, targetRoomName) } });
                console.log('Adding SquadCreepA to Spawn List: ' + newNameA);

                let newNameB = 'SquadCreepB-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Back, newNameB, { memory: { role: 'SquadCreepB', homeRoom: room.name } });
                console.log('Adding SquadCreepB to Spawn List: ' + newNameB);

                let newNameY = 'SquadCreepY-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameY, { memory: { role: 'SquadCreepY', homeRoom: room.name } });
                console.log('Adding SquadCreepY to Spawn List: ' + newNameY);

                let newNameZ = 'SquadCreepZ-' + RandomWords + "-" + room.name;
                room.memory.spawn_list.push(bodyLevel8Front, newNameZ, { memory: { role: 'SquadCreepZ', homeRoom: room.name } });
                console.log('Adding SquadCreepZ to Spawn List: ' + newNameZ);

                return "Success!"
            }


        }
    }



}

global.SRDP = function (roomName, targetRoomName) {
    if (Game.rooms[roomName]) {
        if (Game.rooms[roomName].controller && Game.rooms[roomName].controller.my && Game.rooms[roomName].controller.level > 4) {


            let newName = 'RemoteDismantler-' + roomName + "-" + targetRoomName + Math.floor(Math.random() * 100000);
            console.log('Adding RemoteDismantler to Spawn List: ' + newName);


            if (Game.rooms[roomName].controller.level == 5) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName, persistent: true } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 6) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName, persistent: true } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 7) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName, persistent: true } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 8) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName, persistent: true } });
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Remote Dismantler")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Remote Dismantler from...")
    }
    return "Failed to spawn";
}

global.SRD = function (roomName, targetRoomName) {
    if (Game.rooms[roomName]) {
        if (Game.rooms[roomName].controller && Game.rooms[roomName].controller.my && Game.rooms[roomName].controller.level > 4) {


            let newName = 'RemoteDismantler-' + roomName + "-" + targetRoomName + Math.floor(Math.random() * 100000);
            console.log('Adding RemoteDismantler to Spawn List: ' + newName);


            if (Game.rooms[roomName].controller.level == 5) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 6) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 7) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName } });
                return "Success!";
            }

            else if (Game.rooms[roomName].controller.level == 8) {
                Game.rooms[roomName].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK], newName, { memory: { role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName } });
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Remote Dismantler")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Remote Dismantler from...")
    }
    return "Failed to spawn";
}

global.SC = function (targetRoomName, x, y) {
    Memory.target_colonise.room = targetRoomName;
    Memory.target_colonise.spawn_pos = new RoomPosition(x, y, targetRoomName);
    Memory.target_colonise.lastSpawnRanger = 1501;
    return "Success!"
}

global.SG = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level > 4) {

            let creepsInRoom = Game.rooms[homeRoom].find(FIND_MY_CREEPS);
            let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
            if (fillers < 3) {
                let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + Game.rooms[homeRoom].name;
                Game.rooms[homeRoom].memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
                console.log('Adding filler to Spawn List: ' + newName);
            }


            let newName = 'Goblin-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding Goblin to Spawn List: ' + newName);


            if (Game.rooms[homeRoom].controller.level == 5) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else if (Game.rooms[homeRoom].controller.level == 6) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else if (Game.rooms[homeRoom].controller.level == 7 || Game.rooms[homeRoom].controller.level == 8) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Goblin")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Goblin from...")
    }
    return "Failed to spawn";

}

global.SGB = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level > 4) {

            let creepsInRoom = Game.rooms[homeRoom].find(FIND_MY_CREEPS);
            let fillers = creepsInRoom.filter(function (creep) { return creep.memory.role == "filler"; }).length;
            if (fillers < 3) {
                let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + Game.rooms[homeRoom].name;
                Game.rooms[homeRoom].memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
                console.log('Adding filler to Spawn List: ' + newName);
            }


            let newName = 'Goblin-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding Goblin to Spawn List: ' + newName);


            if (Game.rooms[homeRoom].controller.level == 5) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else if (Game.rooms[homeRoom].controller.level == 6) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else if (Game.rooms[homeRoom].controller.level == 7 || Game.rooms[homeRoom].controller.level == 8) {
                Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], newName, { memory: { role: 'goblin', targetRoom: targetRoomName, homeRoom: homeRoom } });
                return "Success!";
            }

            else {
                console.log("Controller Level too low to spawn Goblin")
            }
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Goblin from...")
    }
    return "Failed to spawn";

}

global.SCK = function (homeRoom, targetRoomName) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && Game.rooms[homeRoom].controller.level > 4) {

            let newName = 'CreepKiller-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding CreepKiller to Spawn List: ' + newName);

            Game.rooms[homeRoom].memory.spawn_list.push([MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, MOVE], newName, { memory: { role: 'CreepKiller', targetRoom: targetRoomName, homeRoom: homeRoom } });
            return "Success!";
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the CreepKiller from...")
    }
    return "Failed to spawn";
}

global.SGD = function (homeRoom, targetRoomName, body) {
    if (Game.rooms[homeRoom]) {
        if (Game.rooms[homeRoom].controller && Game.rooms[homeRoom].controller.my && targetRoomName !== homeRoom) {

            let newName = 'Guard-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding Guard to Spawn List: ' + newName);

            Game.rooms[homeRoom].memory.spawn_list.push(body, newName, { memory: { role: 'Guard', targetRoom: targetRoomName, homeRoom: homeRoom, coma: true } });
            return "Success!";
        }
        else {
            console.log("This Room contains no Controller (or is not your controller) (or controller level less than 5). Try again")
        }
    }
    else {
        console.log("Perhaps own the room you want to spawn the Guard from...")
    }
    return "Failed to spawn";
}


global.SPK = function (homeRoom, targetRoomName) {

    if (Game.rooms[homeRoom] && !Game.rooms[homeRoom].memory.danger) {
        let meleeBody = [
            TOUGH, MOVE,
            MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
            , MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
            ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];
        let healBody = [
            MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE,
            MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL,
            HEAL, HEAL, HEAL, HEAL, HEAL];


        let creepsInRoom = Game.rooms[targetRoomName].find(FIND_MY_CREEPS);
        let PowerMelees = creepsInRoom.filter(function (creep) { return creep.memory.role == "PowerMelee"; }).length;
        if (PowerMelees <= 1) {
            if (Game.rooms[homeRoom].energyAvailable < 9750) {
                let newName = 'Filler-' + Math.floor(Math.random() * Game.time) + "-" + Game.rooms[homeRoom].name;
                Game.rooms[homeRoom].memory.spawn_list.unshift([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE], newName, { memory: { role: 'filler' } });
                console.log('Adding filler to Spawn List: ' + newName);
            }

            let newName = 'PowerMelee-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding PowerMelee to Spawn List: ' + newName);
            Game.rooms[homeRoom].memory.spawn_list.push(meleeBody, newName, { memory: { role: 'PowerMelee', targetRoom: targetRoomName, homeRoom: homeRoom } });

            let newName2 = 'PowerHeal-' + Math.floor(Math.random() * Game.time) + "-" + homeRoom + "-" + targetRoomName;
            console.log('Adding PowerHeal to Spawn List: ' + newName2);
            Game.rooms[homeRoom].memory.spawn_list.push(healBody, newName2, { memory: { role: 'PowerHeal', targetRoom: targetRoomName, homeRoom: homeRoom } });


            return "Success!";
        }
    }

    return "Failed."

}

global.SDM = function (homeRoom, targetRoomName) {
    let room = Game.rooms[homeRoom];
    if (room && !room.memory.danger && Memory.CPU.fiveHundredTickAvg.avg < Game.cpu.limit + 2 && Game.cpu.bucket > 9500) {

        let billtongs = 0;
        _.forEach(Game.creeps, function (creep) {
            switch (creep.memory.role) {
                case "billtong":
                    if (creep.memory.homeRoom == room.name) {
                        billtongs++;
                    }
                    break;
            }
        });

        if (billtongs == 0) {

            let newName = 'Billtong-' + Math.floor(Math.random() * Game.time) + "-" + room.name;
            room.memory.spawn_list.push([MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE,
                MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE, MOVE, WORK, CARRY, MOVE]
                , newName, { memory: { role: 'billtong', homeRoom: room.name, targetRoom: targetRoomName } });
            console.log('Adding Billtong to Spawn List: ' + newName);

        }

    }
}
