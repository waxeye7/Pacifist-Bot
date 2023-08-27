const run = function (creep) {
  creep.memory.moving = false;
  if(creep.room.name === creep.memory.targetRoom) {
    if(creep.pos.x >= 2 || creep.pos.x <= 47 || creep.pos.y >= 2 || creep.pos.y <= 47) {
      creep.memory.role = "Solomon"; return;
    }
    else {
      creep.moveTo(25,25,{range:20})
    }
  }
  if (creep.ticksToLive === 1499) {
    let room = creep.room;
    let newName = "Claimer-" + Math.floor(Math.random() * Game.time) + "-" + room.name;
    room.memory.spawn_list.push([TOUGH, MOVE, MOVE, MOVE, MOVE, CLAIM, HEAL, HEAL], newName, {
      memory: {
        role: "claimer",
        targetRoom: creep.memory.targetRoom,
        homeRoom: room.name,
        boostlabs: [room.memory.labs.outputLab5, room.memory.labs.outputLab7],
        line: 2
      }
    });
    console.log("Adding Claimer to Spawn List: " + newName);

    if(room.memory.labs && room.memory.labs.status && !room.memory.labs.status.boost) {
      room.memory.labs.status.boost = {};
  }
  if(room.memory.labs.status.boost) {
      if(room.memory.labs.status.boost.lab5) {
          room.memory.labs.status.boost.lab5.amount += 60;
          room.memory.labs.status.boost.lab5.use += 1;
      }
      else {
          room.memory.labs.status.boost.lab5 = {};
          room.memory.labs.status.boost.lab5.amount = 60;
          room.memory.labs.status.boost.lab5.use = 1;
      }
      if(room.memory.labs.status.boost.lab7) {
          room.memory.labs.status.boost.lab7.amount += 30;
          room.memory.labs.status.boost.lab7.use += 1;
      }
      else {
          room.memory.labs.status.boost.lab7 = {};
          room.memory.labs.status.boost.lab7.amount = 30;
          room.memory.labs.status.boost.lab7.use = 1;
      }
  }

  }
  if (creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
    let result = creep.Boost();
    if (!result) {
      return;
    }
  }

  if (!creep.memory.party) {
    // filter by creeps with the memory.line property and with role claimer or role RoomLocker
    let party = creep.room.find(FIND_MY_CREEPS, {filter: c => (c.memory.role === "RoomLocker" || c.memory.role === "claimer" || c.memory.role === "Escort") && c.memory.line && (!c.memory.boostlabs || c.memory.boostlabs && !c.memory.boostlabs.length)});

    if (party.length === 3) {
      party.sort((a, b) => a.memory.line - b.memory.line);
      let partyIDs = party.map(c => c.id);
      creep.memory.party = partyIDs;
    }
  }

  if (creep.memory.party) {
    let party = [];
    for (let id of creep.memory.party) {
      let partyMember = Game.getObjectById(id);
      if (partyMember) {
        party.push(partyMember);
      }
    }
    party.reverse();
    let allGood = true;
    for (let partyMember of party) {
      if (partyMember.memory.line === 3 && partyMember.memory.full) {
        if (partyMember.room.name === party[1].room.name && !partyMember.pos.isNearTo(party[1])) {
          allGood = false;
          partyMember.MoveCostMatrixRoadPrio(party[1], 1);
        } else if (partyMember.room.name !== party[1].room.name || partyMember.pos.isNearTo(party[1])) {
          partyMember.moveTo(party[1]);
        }
      } else if (partyMember.memory.line === 2 && !partyMember.memory.boostlabs.length) {
        if (partyMember.room.name === party[2].room.name && !partyMember.pos.isNearTo(party[2])) {
          allGood = false;
          partyMember.MoveCostMatrixRoadPrio(party[2], 1);
        } else if (partyMember.room.name !== party[2].room.name || partyMember.pos.isNearTo(party[2])) {
          partyMember.moveTo(party[2]);
        }
      } else if (partyMember.memory.line === 1 && !partyMember.memory.boostlabs.length) {
        if (allGood) {
          partyMember.moveToRoomAvoidEnemyRooms(partyMember.memory.targetRoom);
        }
        let lowestHealthInParty = party.reduce((lowest, creep) => creep.hits < lowest.hits && creep.hits !== creep.hitsMax ? creep : lowest, party[party.length-1]);

        let hostileCreepsInRange3 = partyMember.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
        if(hostileCreepsInRange3.length > 0) {
          let closestHostile = partyMember.pos.findClosestByRange(hostileCreepsInRange3);
          if(partyMember.pos.isNearTo(closestHostile)) {
            partyMember.rangedMassAttack();
          }
          else {
            partyMember.rangedAttack(closestHostile);
          }
        }
        else if(partyMember.room.name !== partyMember.memory.homeRoom && (!partyMember.room.controller || !partyMember.room.controller.my && !partyMember.room.controller.reservation)) {
          // filter structures not mine and not container and not road and not controller and not power bank and not invader core lair and not invader core

          let structures = creep.room.find(FIND_STRUCTURES);
          structures = structures.filter(s => !s.my && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_POWER_BANK && s.structureType !== STRUCTURE_INVADER_CORE && s.structureType !== STRUCTURE_KEEPER_LAIR && s.structureType !== STRUCTURE_PORTAL && s.structureType !== STRUCTURE_CONTAINER);
          let closestStructure = partyMember.pos.findClosestByRange(structures);
          partyMember.rangedAttack(closestStructure);
        }

        if(partyMember.room.name === lowestHealthInParty.room.name && partyMember.pos.getRangeTo(lowestHealthInParty) <= 3) {
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
  }
};

const roleEscort = {
  run
  //run: run,
  //function2,
  //function3
};
export default roleEscort;
