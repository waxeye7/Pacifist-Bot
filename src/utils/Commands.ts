import randomWords from "random-words";


global.SD = function(roomName, targetRoomName):any {
    let bodyRam6 = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE]
    let bodyRam7 = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
        MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
    let bodyRam8 = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
        ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
        MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];

    let bodySignifer6 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];
    let bodySignifer7 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];
    let bodySignifer8 = [MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
        HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];

    if(Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) {

        if(Game.rooms[roomName].controller.level == 6) {
            let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodyRam6,
                newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Ram to Spawn List: ' + newNameRam);


            let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodySignifer6,
                newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);
            return "Success";
        }

        else if(Game.rooms[roomName].controller.level == 7) {
            let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodyRam7,
                newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Ram to Spawn List: ' + newNameRam);


            let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodySignifer7,
                newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);
            return "Success";
        }

        else if(Game.rooms[roomName].controller.level == 8) {
            let newNameRam = 'Ram-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodyRam8,
                newNameRam, {memory: {role: 'ram', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Ram to Spawn List: ' + newNameRam);


            let newNameSignifer = 'Signifer-'+ randomWords({exactly:2,wordsPerString:1,join: '-'}) + "-" + roomName;
            Game.rooms[roomName].memory.spawn_list.push(bodySignifer8,
                newNameSignifer, {memory: {role: 'signifer', targetRoom: targetRoomName, homeRoom: roomName}});
            console.log('Adding Signifer to Spawn List: ' + newNameSignifer);
            return "Success";
        }

    }

}


global.SQ = function(roomName, targetRoomName, boosted=false) {
    Game.rooms[roomName].memory.spawning_squad.status = true;
    Game.rooms[roomName].memory.spawning_squad.targetRoom = targetRoomName;
    Game.rooms[roomName].memory.spawning_squad.boosted = boosted;

    return "Success!"
}
global.SRD = function(roomName, targetRoomName) {
    let newName = 'RemoteDismantler-BIGBOY' + roomName + Math.floor(Math.random() * 100);
    Game.rooms[roomName].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName}});
    console.log('Adding RemoteDismantler to Spawn List: ' + newName);
    return "Success!"
}
global.SC = function(targetRoomName, x, y) {
    Memory.target_colonise.room = targetRoomName;
    Memory.target_colonise.spawn_pos = new RoomPosition(x,y,targetRoomName);
    Memory.target_colonise.lastSpawnRanger = 1501;
    return "Success!"
}
