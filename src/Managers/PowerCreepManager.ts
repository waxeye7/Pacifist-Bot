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
                console.log("adding power", "PWR_GENERATE_OPS", "to", PowerCreeps[0]);
            }
            else if(level == 1) {
                PowerCreeps[0].upgrade(PWR_OPERATE_EXTENSION);
                console.log("adding power", "PWR_OPERATE_EXTENSION", "to", PowerCreeps[0]);
            }
            else if(level == 2) {
                PowerCreeps[0].upgrade(PWR_GENERATE_OPS);
                console.log("adding power", "PWR_GENERATE_OPS", "to", PowerCreeps[0]);
            }
            else if(level == 3) {
                PowerCreeps[0].upgrade(PWR_OPERATE_EXTENSION);
                console.log("adding power", "PWR_OPERATE_EXTENSION", "to", PowerCreeps[0]);
            }
            else if(level == 4) {
                PowerCreeps[0].upgrade(PWR_OPERATE_TOWER);
                console.log("adding power", "PWR_OPERATE_TOWER", "to", PowerCreeps[0]);
            }
            else if(level == 5) {
                PowerCreeps[0].upgrade(PWR_OPERATE_TOWER);
                console.log("adding power", "PWR_OPERATE_TOWER", "to", PowerCreeps[0]);
            }
            else if(level == 6) {
                PowerCreeps[0].upgrade(PWR_OPERATE_SPAWN);
                console.log("adding power", "PWR_OPERATE_SPAWN", "to", PowerCreeps[0]);
            }
            else if(level == 7) {
                PowerCreeps[0].upgrade(PWR_GENERATE_OPS);
                console.log("adding power", "PWR_GENERATE_OPS", "to", PowerCreeps[0]);
            }
            else if(level == 8) {
                PowerCreeps[0].upgrade(PWR_OPERATE_EXTENSION);
                console.log("adding power", "PWR_OPERATE_EXTENSION", "to", PowerCreeps[0]);
            }
            else if(level == 9) {
                PowerCreeps[0].upgrade(PWR_OPERATE_TOWER);
                console.log("adding power", "PWR_OPERATE_TOWER", "to", PowerCreeps[0]);
            }
            else if(level == 10) {
                PowerCreeps[0].upgrade(PWR_OPERATE_SPAWN);
                console.log("adding power", "PWR_OPERATE_SPAWN", "to", PowerCreeps[0]);
            }
            else if(level == 11) {
                PowerCreeps[0].upgrade(PWR_OPERATE_SPAWN);
                console.log("adding power", "PWR_OPERATE_SPAWN", "to", PowerCreeps[0]);
            }
            else if(level == 12) {
                PowerCreeps[0].upgrade(PWR_OPERATE_LAB);
                console.log("adding power", "PWR_OPERATE_LAB", "to", PowerCreeps[0]);
            }
            else if(level == 13) {
                PowerCreeps[0].upgrade(PWR_OPERATE_LAB);
                console.log("adding power", "PWR_OPERATE_LAB", "to", PowerCreeps[0]);
            }
            else if(level == 14) {
                PowerCreeps[0].upgrade(PWR_GENERATE_OPS);
                console.log("adding power", "PWR_GENERATE_OPS", "to", PowerCreeps[0]);
            }
            else if(level == 15) {
                PowerCreeps[0].upgrade(PWR_OPERATE_EXTENSION);
                console.log("adding power", "PWR_OPERATE_EXTENSION", "to", PowerCreeps[0]);
            }
            else if(level == 16) {
                PowerCreeps[0].upgrade(PWR_OPERATE_TOWER);
                console.log("adding power", "PWR_OPERATE_TOWER", "to", PowerCreeps[0]);
            }
            else if(level == 17) {
                PowerCreeps[0].upgrade(PWR_OPERATE_SPAWN);
                console.log("adding power", "PWR_OPERATE_SPAWN", "to", PowerCreeps[0]);
            }
            else if(level == 18) {
                PowerCreeps[0].upgrade(PWR_OPERATE_LAB);
                console.log("adding power", "PWR_OPERATE_LAB", "to", PowerCreeps[0]);
            }
            else if(level == 19) {
                PowerCreeps[0].upgrade(PWR_OPERATE_LAB);
                console.log("adding power", "PWR_OPERATE_LAB", "to", PowerCreeps[0]);
            }
            else if(level == 20) {
                PowerCreeps[0].upgrade(PWR_FORTIFY);
                console.log("adding power", "PWR_FORTIFY", "to", PowerCreeps[0]);
            }
            else if(level == 21) {
                PowerCreeps[0].upgrade(PWR_FORTIFY);
                console.log("adding power", "PWR_FORTIFY", "to", PowerCreeps[0]);
            }
            else if(level == 22) {
                PowerCreeps[0].upgrade(PWR_GENERATE_OPS);
                console.log("adding power", "PWR_GENERATE_OPS", "to", PowerCreeps[0]);
            }
            else if(level == 23) {
                PowerCreeps[0].upgrade(PWR_OPERATE_TOWER);
                console.log("adding power", "PWR_OPERATE_TOWER", "to", PowerCreeps[0]);
            }
            else if(level == 24) {
                PowerCreeps[0].upgrade(PWR_OPERATE_SPAWN);
                console.log("adding power", "PWR_OPERATE_SPAWN", "to", PowerCreeps[0]);
            }
        }
    }

}}

export default PowerCreepManager;
