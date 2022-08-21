var roleClaimer = {

    /** @param {Creep} creep **/
    run: function(creep) {
        if(creep.room.name == "E12S39") {
            creep.moveTo(47,0);
        }
        else if(creep.room.name == "E12S38") {
            if(creep.pos != 36,21) {
                creep.moveTo(36,21);
            }
            else {
                let thisController = Game.getObjectById('5bbcada69099fc012e63793e');
                console.log(creep.reserveController(thisController));
                
            }

        }
        else if(creep.room.name == "E12S37") {
            creep.moveTo(21,49);
            // let thisController = Game.getObjectById('5bbcada69099fc012e63793a');
            // if(creep.pos != 26,14) {
            //     creep.moveTo(26,14);
            // }
            // else {
            //     creep.claimController(thisController);
            // }
            // let thisController = Game.getObjectById('5bbcada69099fc012e63793a');
            // console.log(creep.claimController(thisController));
            // if(thisController.level > 0) {
            //     if(creep.attackController(thisController) == ERR_NOT_IN_RANGE) {
            //         console.log("moving to their controller");
            //         creep.moveTo(thisController);
            //         return;
            //     }
            //     if(creep.attackController(thisController) == 0) {
            //         console.log("attacking their controller");
            //         return;
            //     }
            // }
            // if(thisController.level == 0) {
            //     if(creep.claimController(thisController) == ERR_NOT_IN_RANGE) {
            //         creep.moveTo(thisController);
            //         return;
            //     }
            //     if(creep.claimController(thisController) == 0) {
            //         return;
                // }
            // }
        }
	}
};

module.exports = roleClaimer;