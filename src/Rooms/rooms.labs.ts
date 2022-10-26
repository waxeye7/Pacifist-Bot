function labs(room) {
    let LabsInRoom = room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LAB});
    let LastLab = LabsInRoom.pop();
    let CloseEnoughLabs = LastLab.pos.findInRange(LabsInRoom, 2);
    let ThreeLabs = [];
    ThreeLabs.push(LastLab);
    CloseEnoughLabs.forEach(lab => {
        ThreeLabs.push(lab);
    });

    if(ThreeLabs.length < 3) {
        console.log("less than three labs together");
        return;
    }

    while (ThreeLabs.length > 3) {
        ThreeLabs.pop();
    }

    // console.log(ThreeLabs);
    // console.log(ThreeLabs[0].store[RESOURCE_UTRIUM_HYDRIDE], ThreeLabs[1].store[RESOURCE_UTRIUM], ThreeLabs[2].store[RESOURCE_HYDROGEN])

    let labIDS = [];
    ThreeLabs.forEach(lab => {
       labIDS.push(lab.id);
    });
    room.memory.labs = labIDS;

    let resultLab = ThreeLabs[0];
    let firstLab = ThreeLabs[1];
    let secondLab = ThreeLabs[2];

    if(resultLab.store[RESOURCE_UTRIUM_HYDRIDE] <= 2995 && firstLab.store[RESOURCE_UTRIUM] >= 5 && secondLab.store[RESOURCE_HYDROGEN] >= 5) {
        resultLab.runReaction(firstLab, secondLab);
    }


}

export default labs;
// module.exports = market;
