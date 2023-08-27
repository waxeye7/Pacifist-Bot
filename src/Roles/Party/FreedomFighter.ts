/**
 * A little description of this function
 * @param {Creep} creep
 **/
const run = function (creep) {
  creep.memory.moving = false;

  if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
      let result = creep.Boost();
      if(!result) {
          return;
      }
  }

  if(creep.memory.line === 1) {
    if(!creep.memory.party) {
      let party = creep.room.find(FIND_MY_CREEPS, {filter: c => (c.memory.role === "FreedomFighter" || c.memory.role === "CCKparty") && c.memory.boostlabs && !c.memory.boostlabs.length});
      if(party.length === creep.memory.lineLength) {
        party.sort((a,b) => a.memory.line - b.memory.line);
        let partyIDs = party.map(c => c.id);
        creep.memory.party = partyIDs;
      }
    }

    if(creep.memory.party) {
      let party = creep.memory.party.map(id => Game.getObjectById(id));
      party = party.filter(c => c !== null);
      party.reverse();
      if(creep.room.name === creep.memory.targetRoom && creep.pos.x > 4 && creep.pos.x < 45 &&creep.pos.y > 4 && creep.pos.y) party.push(party.shift());


      let allGood = true;
      let readyToAttackController = true;
      let lowestHealthInParty = party.reduce((lowest, creep) => creep.hits < lowest.hits && creep.hits !== creep.hitsMax ? creep : lowest, party[party.length-1]);
      for(let partyMember of party) {
        let overrideMove = false;

        if(partyMember.memory.role === "FreedomFighter") {
          let heal = true;
          let hostileCreepsInRange3 = partyMember.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
          if(hostileCreepsInRange3.length > 0) {
            let closestHostile = partyMember.pos.findClosestByRange(hostileCreepsInRange3);
            if(partyMember.pos.isNearTo(closestHostile)) {
              partyMember.rangedMassAttack();
              partyMember.attack(closestHostile);
              heal = false;
            }
            else {
              partyMember.rangedAttack(closestHostile);
            }
          }
          else if(partyMember.room.name !== partyMember.memory.homeRoom && (!partyMember.room.controller || !partyMember.room.controller.my && !partyMember.room.controller.reservation)) {
            let structures = creep.room.find(FIND_STRUCTURES);
            let closestStructure = partyMember.pos.findClosestByRange(structures);
            partyMember.rangedAttack(closestStructure);
          }

          if(heal) {
            if(partyMember.hits > partyMember.hitsMax - 250 && partyMember.room.name === lowestHealthInParty.room.name && partyMember.pos.getRangeTo(lowestHealthInParty) <= 3) {
              if(partyMember.pos.getRangeTo(lowestHealthInParty) <= 1) {
                partyMember.heal(lowestHealthInParty);
              }
              else {
                partyMember.rangedHeal(lowestHealthInParty);
              }
            }
            else if(partyMember.hits !== partyMember.hitsMax && hostileCreepsInRange3.length || partyMember.room.name === partyMember.memory.targetRoom) {
              partyMember.heal(partyMember);
            }
          }
        }

        else if(partyMember.memory.role === "CCKparty") {
          if(partyMember.room.name === partyMember.memory.targetRoom) {
            let controller = partyMember.room.controller;
            if(controller && party[party.length -1].pos.getRangeTo(controller) <= 8 && !partyMember.pos.isNearTo(controller)) {
              partyMember.moveTo(controller, {reusePath:0});
              readyToAttackController = false;
              overrideMove = true;
              continue;
            }
          }
          else {
            readyToAttackController = false;
          }
        }

        if(partyMember.memory.line === creep.memory.lineLength) {
          if(overrideMove) {
            continue;
          }
          if(partyMember.room.name === party[1].room.name && !partyMember.pos.isNearTo(party[1])) {
            allGood = false;
          }
          if(partyMember.room.name !== party[1].room.name || partyMember.pos.isNearTo(party[1])) {
            partyMember.moveTo(party[1]);
          }
          else {
            partyMember.MoveCostMatrixRoadPrio(party[1], 1);
          }
        }
        else if(partyMember.memory.line > 1) {
          if(partyMember.memory.role === "CCKparty" && overrideMove) {
            continue;
          }
          if(partyMember.room.name === party[creep.memory.lineLength - (partyMember.memory.line - 1)].room.name && !partyMember.pos.isNearTo(party[creep.memory.lineLength - (partyMember.memory.line - 1)])) {
            allGood = false;
          }
          if(partyMember.room.name !== party[creep.memory.lineLength - (partyMember.memory.line - 1)].room.name || partyMember.pos.getRangeTo(party[creep.memory.lineLength - (partyMember.memory.line - 1)]) === 1) {
            partyMember.moveTo(party[creep.memory.lineLength - (partyMember.memory.line - 1)]);
          }
          else {
            partyMember.MoveCostMatrixRoadPrio(party[creep.memory.lineLength - (partyMember.memory.line - 1)], 1);
            allGood = false;
          }
        }
        else if(allGood || (creep.room.name === creep.memory.targetRoom  && (creep.pos.x < 45 || creep.pos.x > 5 || creep.pos.y < 45 || creep.pos.y > 5))) {
          if(creep.room.name === creep.memory.targetRoom) {
            let controller = creep.room.controller;
            if(controller && creep.pos.getRangeTo(controller) > 4) {
              GoToController(creep, controller.pos, 3);
            }
          }
          else {
            creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
          }
        }
        else if(creep.room.name === creep.memory.homeRoom && (creep.pos.x < 47 && creep.pos.x > 2 && creep.pos.y < 47 && creep.pos.y > 2)) {
          creep.moveToRoomAvoidEnemyRooms(creep.memory.targetRoom);
        }
      }
      if(readyToAttackController) {
        for(let partyMember of party) {
          if(partyMember.memory.role === "CCKparty") {
            let controller = partyMember.room.controller;
            if(controller) {
              partyMember.attackController(controller);
              if(controller.upgradeBlocked > 0) {
                partyMember.suicide();
                party[0].memory.role = "Solomon";
                party[party.length-1].memory.role = "Solomon";

                if(creep.room.controller) {
                  Memory.commandsToExecute.push({delay:360, bucketNeeded:5000, formation:"CCKparty", homeRoom:creep.memory.homeRoom, targetRoom:creep.room.name,controllerFreePositions:creep.room.controller.pos.getOpenPositionsIgnoreCreeps().length})
                }
                return;
              }
            }
          }
        }
      }
    }
  }
}


const roleFreedomFighter = {
  run,

};
export default roleFreedomFighter;


function GoToController(creep, target, range) {
  if(target && creep.fatigue == 0 && creep.pos.getRangeTo(target) > range) {
      if(creep.memory.path && creep.memory.path.length > 0 && (Math.abs(creep.pos.x - creep.memory.path[0].x) > 1 || Math.abs(creep.pos.y - creep.memory.path[0].y) > 1)) {
          creep.memory.path = false;
      }
      if(!creep.memory.path || creep.memory.path.length == 0 || !creep.memory.MoveTargetId || creep.memory.MoveTargetId != target.id || target.roomName !== creep.room.name) {
          let costMatrix = GoToTheController;

          let path = PathFinder.search(
              creep.pos, {pos:target, range:range},
              {
                  maxOps: 1000,
                  maxRooms: 1,
                  roomCallback: (roomName) => costMatrix(roomName)
              }
          );
          creep.memory.path = path.path;
          creep.memory.MoveTargetId = target.id;
      }


      let pos = creep.memory.path[0];
      let direction = creep.pos.getDirectionTo(pos);
      creep.move(direction);
      creep.memory.moving = true;
      creep.memory.path.shift();
  }
}



const GoToTheController = (roomName: string): boolean | CostMatrix => {
  let room = Game.rooms[roomName];
  if (!room || room == undefined || room === undefined || room == null || room === null) {
      return false;
  }

  let costs = new PathFinder.CostMatrix;

  const terrain = new Room.Terrain(roomName);

  for(let y = 0; y <= 49; y++) {
      for(let x = 0; x <= 49; x++) {
          const tile = terrain.get(x, y);
          let weight;
          if(tile == TERRAIN_MASK_WALL) {
              weight = 255
          }
          else if(tile == TERRAIN_MASK_SWAMP) {
              weight = 10;
          }
          else if(tile == 0){
              weight = 2;
          }
          costs.set(x, y, weight);
      }
  }

  let EnemyCreeps = room.find(FIND_HOSTILE_CREEPS);
  for(let eCreep of EnemyCreeps) {
      costs.set(eCreep.pos.x, eCreep.pos.y, 255);
  }

  room.find(FIND_MY_CONSTRUCTION_SITES).forEach(function(site) {
      if(site.structureType !== STRUCTURE_CONTAINER && site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_RAMPART) {
          costs.set(site.pos.x, site.pos.y, 255);
      }
  });

  let myCreeps = room.find(FIND_MY_CREEPS);
  for(let myCreep of myCreeps) {
      if(myCreep.memory.role == "DismantleControllerWalls") {
          costs.set(myCreep.pos.x, myCreep.pos.y, 140);
      }
  }

  _.forEach(room.find(FIND_STRUCTURES), function(struct:any) {
      if(struct.structureType == STRUCTURE_ROAD) {
          costs.set(struct.pos.x, struct.pos.y, 1);
      }
      else if(struct.structureType == STRUCTURE_CONTAINER) {
          return;
      }
      else if(struct.structureType == STRUCTURE_RAMPART && struct.my) {
          return;
      }
      else {
          if(struct.hits >= 5000000) {
              costs.set(struct.pos.x, struct.pos.y, 175);
          }
          else if(struct.hits >= 2500000) {
              costs.set(struct.pos.x, struct.pos.y, 150);
          }
          else if(struct.hits >= 1000000) {
              costs.set(struct.pos.x, struct.pos.y, 100);
          }
          else if(struct.hits >= 500000) {
              costs.set(struct.pos.x, struct.pos.y, 75);
          }
          else {
              costs.set(struct.pos.x, struct.pos.y, 50);
          }

      }
  });
  return costs;
}
