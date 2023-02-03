function PowerCreepManager() {
if(Game.time % 5000 == 1) {

    let myGpl = Game.gpl.level;
    let myLevels = 0;
    let PowerCreeps = [];
    for(let name in Game.powerCreeps) {
        PowerCreeps.push(Game.powerCreeps[name]);
    }

    for(let powerCreep of PowerCreeps) {
        myLevels += powerCreep.level + 1;
    }

    if(myGpl > myLevels) {
        if(PowerCreeps.length > 0) {
            PowerCreeps.sort((a,b) => a.level - b.level);
            let level = PowerCreeps[0].level;
            if(level == 0) {
                PowerCreeps[0].upgrade(PWR_GENERATE_OPS);
                console.log("adding power", PWR_GENERATE_OPS, "to", PowerCreeps[0]);
            }
            else if(level == 1) {
                PowerCreeps[0].upgrade(PWR_OPERATE_EXTENSION);
                console.log("adding power", PWR_OPERATE_EXTENSION, "to", PowerCreeps[0]);
            }
            else if(level == 2) {
                PowerCreeps[0].upgrade(PWR_GENERATE_OPS);
                console.log("adding power", PWR_GENERATE_OPS, "to", PowerCreeps[0]);
            }
            else if(level == 3) {
                PowerCreeps[0].upgrade(PWR_OPERATE_EXTENSION);
                console.log("adding power", PWR_OPERATE_EXTENSION, "to", PowerCreeps[0]);
            }
        }
    }

}}

export default PowerCreepManager;
