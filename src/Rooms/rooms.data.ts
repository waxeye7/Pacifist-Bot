function data(room) {
    if(!room.memory.data) {
        room.memory.data = {};
    }
    if(!room.memory.data.DOB) {
        room.memory.data.DOB = 0;
    }
    if(!room.memory.data.DOBug) {
        room.memory.data.DOBug = 0;
    }
    if(room.controller.progress <= 200) {
        room.memory.data.DOBug = 0;
    }
    if(!room.memory.data.c_spawned) {
        room.memory.data.c_spawned = 0;
    }


    let data = room.memory.data;
    data.DOB += 1;
    data.DOBug += 1;
    room.memory.data = data;

}

export default data;
// module.exports = market;
