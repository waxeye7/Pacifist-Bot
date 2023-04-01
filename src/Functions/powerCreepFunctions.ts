interface PowerCreep {
    SwapPositionWithCreep:any;
    MoveCostMatrixRoadPrio:any;
    evacuate:any;
    moveToRoom:any;
}

PowerCreep.prototype.moveToRoom = function moveToRoom(roomName, travelTarget_x = 25, travelTarget_y = 25, ignoreRoadsBool = false, swampCostValue = 5, rangeValue = 20) {
    this.moveTo(new RoomPosition(travelTarget_x, travelTarget_y, roomName), {range:rangeValue, reusePath:200, ignoreRoads: ignoreRoadsBool, swampCost: swampCostValue});
}

PowerCreep.prototype.evacuate = function evacuate():any {
    if(this.room.memory.defence && this.room.memory.defence.nuke && this.room.memory.defence.evacuate || this.memory.nukeHaven) {
        if(!this.memory.nukeTimer) {
            let nukes = this.room.find(FIND_NUKES);
            if(nukes.length > 0) {
                nukes.sort((a,b) => a.timeToLand - b.timeToLand);
                this.memory.nukeTimer = nukes[0].timeToLand + 1;
            }
        }
        if(!this.memory.homeRoom) {
            this.memory.homeRoom = this.room.name;
        }
        if(this.memory.nukeTimer && this.memory.nukeTimer > 0) {
            this.memory.nukeTimer --;
        }

        if(this.memory.nukeTimer > 0) {

            if(!this.memory.nukeHaven) {
                let possibleRooms = Object.values(Game.map.describeExits(this.room.name)).filter(roomname => Game.map.getRoomStatus(roomname).status === Game.map.getRoomStatus(this.room.name).status);
                let index = Math.floor(Math.random() * possibleRooms.length);
                this.memory.nukeHaven = possibleRooms[index];
            }
            if(this.memory.nukeHaven) {
                this.moveToRoom(this.memory.nukeHaven)
            }

        }
        else {
            if(this.room.name == this.memory.homeRoom) {
                return false;
            }
            else {
                this.moveToRoom(this.memory.homeRoom);
                return true;
            }
        }

        return true;
    }
    return false;
}

PowerCreep.prototype.SwapPositionWithCreep = function SwapPositionWithCreep(direction) {
    if(direction == 1) {
        if(this.pos.y != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x, this.pos.y - 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }
            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(5);
                }
                else {
                    if(lookCreep[0].move(1) !== 0) {
                        lookCreep[0].move(5);
                    }
                }
            }
        }

    }
    else if(direction == 2) {
        if(this.pos.x != 49 && this.pos.y != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x + 1, this.pos.y - 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }
            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(6);
                }
                else {
                    if(lookCreep[0].move(2) !== 0) {
                        lookCreep[0].move(6);
                    }
                }
            }
        }

    }
    else if(direction == 3) {
        if(this.pos.x != 49) {
            let targetRoomPosition = new RoomPosition(this.pos.x + 1, this.pos.y, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }

            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(7);
                }
                else {
                    if(lookCreep[0].move(3) !== 0) {
                        lookCreep[0].move(7);
                    }
                }
            }
        }

    }
    else if(direction == 4) {
        if(this.pos.x != 49 && this.pos.y != 49) {
            let targetRoomPosition = new RoomPosition(this.pos.x + 1, this.pos.y + 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }

            if(lookCreep.length > 0 && lookCreep[0].my && lookCreep[0] && !lookCreep[0].memory.moving) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(8);
                }
                else {
                    if(lookCreep[0].move(4) !== 0) {
                        lookCreep[0].move(8);
                    }
                }
            }
        }

    }
    else if(direction == 5) {
        if(this.pos.y != 49) {
            let targetRoomPosition = new RoomPosition(this.pos.x, this.pos.y + 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }
            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(1);
                }
                else {
                    if(lookCreep[0].move(5) !== 0) {
                        lookCreep[0].move(1);
                    }
                }
            }
        }

    }
    else if(direction == 6) {
        if(this.pos.y != 49 && this.pos.x != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x - 1, this.pos.y + 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }
            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(2);
                }
                else {
                    if(lookCreep[0].move(6) !== 0) {
                        lookCreep[0].move(2);
                    }
                }
            }
        }

    }
    else if(direction == 7) {
        if(this.pos.x != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x - 1, this.pos.y, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }

            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(3);
                }
                else {
                    if(lookCreep[0].move(7) !== 0) {
                        lookCreep[0].move(3);
                    }
                }
            }
        }

    }
    else if(direction == 8) {
        if(this.pos.x != 0 && this.pos.y != 0) {
            let targetRoomPosition = new RoomPosition(this.pos.x - 1, this.pos.y - 1, this.room.name)
            let lookCreep = targetRoomPosition.lookFor(LOOK_CREEPS);
            if(lookCreep.length == 0) {
                let powerCreeps:any = targetRoomPosition.lookFor(LOOK_POWER_CREEPS);
                if(powerCreeps.length > 0) {
                    lookCreep.push(powerCreeps[0]);
                }
            }

            if(lookCreep.length > 0 && lookCreep[0].my && !lookCreep[0].memory.moving) {
                if(lookCreep[0].ticksToLive % 2 < 1) {
                    lookCreep[0].move(4);
                }
                else {
                    if(lookCreep[0].move(8) !== 0) {
                        lookCreep[0].move(4);
                    }
                }
            }
        }

    }
}



PowerCreep.prototype.MoveCostMatrixRoadPrio = function MoveCostMatrixRoadPrio(target, range) {
    if(target && this.pos.getRangeTo(target) > range) {
        if(this.memory.path && this.memory.path.length > 0 && (Math.abs(this.pos.x - this.memory.path[0].x) > 1 || Math.abs(this.pos.y - this.memory.path[0].y) > 1)) {
            this.memory.path = false;
        }

        if(!this.memory.path || this.memory.path.length == 0 || !this.memory.MoveTargetId || this.memory.MoveTargetId != target.id) {
            let costMatrix = roomCallbackRoadPrioPower;

            let path = PathFinder.search(
                this.pos, {pos:target.pos, range:range},
                {
                    maxOps: 1000,
                    maxRooms: 3,
                    roomCallback: (roomName) => costMatrix(roomName)
                }
                );

            let pos = path.path[0];
            let direction = this.pos.getDirectionTo(pos);

            this.SwapPositionWithCreep(direction);
            this.memory.path = path.path;
            this.memory.MoveTargetId = target.id;
        }



        let pos = this.memory.path[0];
        let direction = this.pos.getDirectionTo(pos);

        this.move(direction);
        this.memory.moving = true;
        this.memory.path.shift();
        // this.moveByPath(this.memory.path);
     }

}

const roomCallbackRoadPrioPower = (roomName: string): boolean | CostMatrix => {
    let room = Game.rooms[roomName];
    if (!room || room == undefined || room === undefined || room == null || room === null) {
        return false;
    }

    let costs = new PathFinder.CostMatrix;

    const terrain = new Room.Terrain(roomName);

    for(let y = 1; y < 49; y++) {
        for(let x = 1; x < 49; x++) {
            const tile = terrain.get(x, y);
            let weight;
            if(tile == TERRAIN_MASK_WALL) {
                weight = 255
            }
            else if(tile == TERRAIN_MASK_SWAMP) {
                weight = 2;
            }
            else if(tile == 0){
                weight = 2;
            }
            costs.set(x, y, weight);
        }
    }

    room.find(FIND_HOSTILE_CREEPS).forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 255);
    });




    _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
        if(struct.structureType == STRUCTURE_ROAD) {
            costs.set(struct.pos.x, struct.pos.y, 3);
        }
        else if(struct.structureType == STRUCTURE_CONTAINER) {
            return;
        }
        else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
            return;
        }
        else {
            costs.set(struct.pos.x, struct.pos.y, 255);
        }
    });

    room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
        if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
            costs.set(site.pos.x, site.pos.y, 255);
        }
    });

    let myCreepsNotSpawning = room.find(FIND_MY_CREEPS, {filter: (c) => {return (!c.spawning);}});
    myCreepsNotSpawning.forEach(function(creep) {
        if(creep.memory.role == "upgrader" && creep.memory.upgrading && creep.room.controller && creep.pos.getRangeTo(creep.room.controller) <= 3) {
            costs.set(creep.pos.x, creep.pos.y, 6);
        }
        else if(creep.memory.role == "EnergyMiner" && creep.memory.source) {
            let source:any = Game.getObjectById(creep.memory.source)
            if(creep.pos.isNearTo(source)) {
                costs.set(creep.pos.x, creep.pos.y, 11);
            }
        }
        else if(creep.memory.role == "builder" && creep.memory.building && creep.memory.locked) {
            let locked:any = Game.getObjectById(creep.memory.locked);
            if(creep.pos.getRangeTo(locked) <= 3) {
                costs.set(creep.pos.x, creep.pos.y, 3);
            }
        }
        else if(creep.memory.role == "buildcontainer" && creep.store[RESOURCE_ENERGY] > 0) {
            costs.set(creep.pos.x, creep.pos.y, 3);
        }
        else if(creep.memory.role == "ram") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "signifer") {
            costs.set(creep.pos.x, creep.pos.y, 255);
        }
        else if(creep.memory.role == "PowerMelee") {
            costs.set(creep.pos.x, creep.pos.y, 20);
        }
        else if(creep.memory.role == "PowerHeal") {
            costs.set(creep.pos.x, creep.pos.y, 14);
        }
    });


    for(let y = 0; y < 50; y++) {
        for(let x = 0; x < 50; x++) {
            if(x == 0 || x == 49 || y == 0 || y == 49) {
                costs.set(x, y, 255);
            }
        }
    }


    return costs;
}
