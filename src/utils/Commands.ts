// global.SQ = function(roomName, targetRoomName, boosted=false) {
//     Game.rooms[roomName].memory.spawning_squad.status = true;
//     Game.rooms[roomName].memory.spawning_squad.targetRoom = targetRoomName;
//     Game.rooms[roomName].memory.spawning_squad.boosted = boosted;

//     return "Success!"
// }
// global.SRD = function(roomName, targetRoomName) {
//     let newName = 'RemoteDismantler-BIGBOY' + roomName + Math.floor(Math.random() * 100);
//     Game.rooms[roomName].memory.spawn_list.push([MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK], newName, {memory: {role: 'RemoteDismantler', targetRoom: targetRoomName, homeRoom: roomName}});
//     console.log('Adding RemoteDismantler to Spawn List: ' + newName);
//     return "Success!"
// }
// global.SC = function(targetRoomName, x, y) {
//     Memory.target_colonise.room = targetRoomName;
//     Memory.target_colonise.spawn_pos = new RoomPosition(x,y,targetRoomName);
//     return "Success!"
// }



// export { Commands };
