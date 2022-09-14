function findLinks(room){
    if(!room.memory.links) {
        room.memory.links = {};
    }
    if(!room.memory.links[room.name]) {
        let links = room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_LINK}});

        _.forEach(links, function(link) {
            let data = _.get(room.memory, ['links', link.id]);
            if(data === undefined) {
                _.set(room.memory, ['links', link.id], {})
            }});
    }
}

function roomRunLinks(room) {
    // if(!room.memory.links || Game.time % 1000 == 0) {
    //     findLinks(room)
    // }


    // if(!room.memory.links.closestLink) {
    //     let storage = Game.getObjectById(room.memory.storage) || room.findStorage();
    //     let links = room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_LINK}});
    //     let storageLink = storage.pos.findClosestByRange(links);
    //     room.memory.links.closestLink = storageLink.id;
    // }

    // if(!room.memory.links.farLink1) {
    //     let links = room.find(FIND_MY_STRUCTURES, {filter: { structureType : STRUCTURE_LINK}});
    //     for(let link in links) {
    //         if(link.id != )
    //     }
    // }

    return null;
    


}

module.exports = roomRunLinks