

import {
  calc_incoming_damage,
  calc_incoming_damage_potential_next_tick,
  calc_incoming_damage_potential_next_tick_next_pos
} from "./calc_incoming_damage";
import find_exposed_creeps from "./find_exposed_creeps";
import find_exposed_structs from "./find_exposed_structs";
function mosquito_attack() {
  if(!Memory.e) {
    Memory.e = {mosquito: []};
  }
  for (let attack of Memory.e.mosquito) {
    let room = Game.rooms[attack.n];

    if (!room) continue;

    const terrain = new Room.Terrain(room.name);
    let nukes = room.find(FIND_NUKES);
    // filter nukes by time to land less than 50 ticks
    nukes = nukes.filter(n => n.timeToLand < 50);
    // find lowest nuke timer
    if(nukes.length > 0) {
    nukes.sort((a, b) => a.timeToLand - b.timeToLand);
    }



    let creeps = room.find(FIND_CREEPS);
    let myCreeps = creeps.filter(c => c.my);
    let enemyCreeps = creeps.filter(c => !c.my);

    let mosquitos = myCreeps.filter(c => c.memory.role === "mosquito");
    let myOtherCreeps = myCreeps.filter(c => c.memory.role !== "mosquito");

    let structures = room.find(FIND_STRUCTURES);
    let neutralStructures = structures.filter(
      s => !(s instanceof OwnedStructure) && s.structureType !== STRUCTURE_CONTAINER
    );
    let enemyStructures = structures.filter(
      s =>
        s instanceof OwnedStructure &&
        s.owner &&
        s.owner.username !== "PacifistBot" &&
        s.structureType !== STRUCTURE_CONTROLLER
    );
    let combinedStructures = neutralStructures.concat(enemyStructures);
    let towers = <Array<StructureTower>>enemyStructures.filter(s => s.structureType === STRUCTURE_TOWER);
    let spawns = enemyStructures.filter(s => s.structureType === STRUCTURE_SPAWN);

    let controller = room.controller;
    let safeMode = false;
    if (controller && controller.safeMode && controller.safeMode > 0) {
      attack.ts = 0;
      safeMode = true;
    }

    let centermostPosition: RoomPosition | null = null;

    if (!attack.cp || Game.time % 500 === 0) {
      // Create an object to store the scores for each position
      let positionScores = {};

      // Calculate the score for each position based on the number of hostile structures around it
      for (let structure of enemyStructures) {
        for (let x = structure.pos.x - 4; x <= structure.pos.x + 4; x++) {
          for (let y = structure.pos.y - 4; y <= structure.pos.y + 4; y++) {
            if (x < 0 || x > 49 || y < 0 || y > 49) continue;
            let positionKey = x + "-" + y;
            if (!positionScores[positionKey]) positionScores[positionKey] = 0;
            positionScores[positionKey]++;
          }
        }
      }

      // Find the position with the highest score (highest concentration of hostile structures)
      let maxScore = 0;
      for (let key in positionScores) {
        let score = positionScores[key];
        if (score > maxScore) {
          maxScore = score;
          let [x, y] = key.split("-").map(Number);
          centermostPosition = new RoomPosition(x, y, room.name);
        }
      }
      attack.cp = centermostPosition;
    }

    if (attack.cp) {
      centermostPosition = new RoomPosition(attack.cp.x, attack.cp.y, room.name);
    }

    console.log(centermostPosition?.x, centermostPosition?.y, "is the centre position");

    for (let mosquito of mosquitos) {
      if (mosquito.ticksToLive === 200 && !safeMode && spawns.length) {
        attack.ts++;
      }

      let mosquitosNearby = mosquitos.filter(c => c.pos.getRangeTo(mosquito.pos) <= 2 && c.id !== mosquito.id).length;


      let myHealPotential = mosquito.getActiveBodyparts(HEAL) * 48;
      let myActiveToughParts = mosquito.getActiveBodyparts(TOUGH);

      let enemyCreepsInRange5 = mosquito.pos.findInRange(enemyCreeps, 5);
      let enemyCreepsInRange3 = mosquito.pos.findInRange(enemyCreepsInRange5, 3);

      let enemyCreepsInRange3WithArms = enemyCreepsInRange3.filter(
        c => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0
      );

      let enemyStructuresInRange3 = mosquito.pos.findInRange(enemyStructures, 3);
      let neutralStructuresInRange3 = mosquito.pos.findInRange(neutralStructures, 3);

      const result = calc_incoming_damage_potential_next_tick(
        mosquito.pos,
        towers,
        enemyCreepsInRange5,
        mosquito.fatigue,
        mosquitosNearby
      );
      const hostileDamagePotentialNextTick = result.totalDamage;
      const advance = result.advance;

      let hostileDamagePotentialThisTick = calc_incoming_damage(mosquito.pos, towers, enemyCreepsInRange3);

      let myDamageWithstandPotential = myHealPotential + myActiveToughParts * 233.33333;

      console.log(
        mosquito.name,
        "has",
        myDamageWithstandPotential,
        "damage withstand potential",
        "and could potentially recieve",
        hostileDamagePotentialNextTick.toFixed(3),
        "damage"
      );

      // heal part
      if (mosquito.hits === mosquito.hitsMax) {
        let mosquitosInRange3 = mosquito.pos.findInRange(mosquitos, 3);
        mosquitosInRange3 = mosquitosInRange3.filter(u => u.id !== mosquito.id && u.hits < u.hitsMax);
        let nonMosquitosInRange3 = mosquito.pos.findInRange(myOtherCreeps, 3);
        let nonMosquitosInRange1 = mosquito.pos.findInRange(nonMosquitosInRange3, 1);
        let nonMosquitosInRange1WithHits = nonMosquitosInRange1.filter(u => u.hits < u.hitsMax);
        let nonMosquitosInRange3WithHits = nonMosquitosInRange3.filter(u => u.hits < u.hitsMax);


        if (mosquitosInRange3.length > 0) {
          let lowestHitsmosquito = mosquitosInRange3.reduce((p, c) => (p.hits < c.hits ? p : c));
          if (lowestHitsmosquito) {
            let range = mosquito.pos.getRangeTo(lowestHitsmosquito);
            if (range > 1) {
              mosquito.rangedHeal(lowestHitsmosquito);
            } else {
              mosquito.heal(lowestHitsmosquito);
            }
          }
        }
        else if(nonMosquitosInRange1WithHits.length > 0) {
          let lowestHitsNonMosquito = nonMosquitosInRange1WithHits.reduce((p, c) => (p.hits < c.hits ? p : c));
          if (lowestHitsNonMosquito) {
            mosquito.heal(lowestHitsNonMosquito);
          }
        }
        else if(nonMosquitosInRange3WithHits.length > 0) {
          let lowestHitsNonMosquito = nonMosquitosInRange3WithHits.reduce((p, c) => (p.hits < c.hits ? p : c));
          if (lowestHitsNonMosquito) {
            mosquito.rangedHeal(lowestHitsNonMosquito);
          }
        }
        else {
        if (myDamageWithstandPotential / 3 < hostileDamagePotentialThisTick) mosquito.heal(mosquito);
        }
      } else {
        mosquito.heal(mosquito);
      }

      // move part
      if (mosquito.fatigue === 0) {

        if(nukes.length > 0) {

          const exits = mosquito.room.find(FIND_EXIT)
                    // random number between 0 - exits length - 1
          let closestexit = mosquito.pos.findClosestByRange(exits);

                  if (closestexit) {
                    if(nukes[0].timeToLand === 2) {

                      const exitPos = new RoomPosition(closestexit.x, closestexit.y, mosquito.room.name);
                    mosquito.moveTo(exitPos, { visualizePathStyle: { stroke: "#ffffff" } });

                    }
                    else {
                    const exitPos = new RoomPosition(closestexit.x, closestexit.y, mosquito.room.name);
                    mosquito.moveTo(exitPos, {range:1, visualizePathStyle: { stroke: "#ffffff" } });

                    }

                  }


        }

        else {
        let range = 6;
        let flee = false;
        if (mosquito.hits !== mosquito.hitsMax || hostileDamagePotentialNextTick >= myDamageWithstandPotential * 1.25) {
          flee = true;
          range = 25;
        }
        let targetPos = centermostPosition;
        if (!targetPos) {
          let closestSpawn = mosquito.pos.findClosestByRange(spawns);
          if (closestSpawn) {
            targetPos = closestSpawn.pos;
          }
        }
        if (targetPos) {
          // add custom cost matrix to pathfinder.search method
          let closestHostileCreep = mosquito.pos.findClosestByRange(enemyCreepsInRange3WithArms);
          if (closestHostileCreep) {
            targetPos = closestHostileCreep.pos;
            range = 6;
          }
          let path: Array<RoomPosition> | null = null;
          let targetMemory = mosquito.memory.target;
          let targetMemoryPosition: RoomPosition | null = null;
          if (targetMemory)
            targetMemoryPosition = new RoomPosition(targetMemory.x, targetMemory.y, targetMemory.roomName);
          if (
            <number>mosquito.ticksToLive % 41 === 0 ||
            flee ||
            !mosquito.memory.path ||
            !targetMemoryPosition ||
            !targetMemoryPosition.isNearTo(targetPos)
          ) {
            path = PathFinder.search(
              mosquito.pos,
              { pos: targetPos, range: range },
              {
                roomCallback: roomName =>
                  goToTheClosestSpawnWrapper(
                    mosquito,
                    roomName,
                    enemyCreeps,
                    myCreeps,
                    combinedStructures,
                    flee,
                    terrain
                  ),
                maxRooms: 1,
                flee
              }
            ).path;
            if (path.length > 0) {
              mosquito.memory.path = path;
              if (!flee) mosquito.memory.target = targetPos;
              else mosquito.memory.target = undefined;
            }
          } else if (mosquito.memory.path?.length) {
            path = [];
            for (let i = 0; i < mosquito.memory.path.length; i++) {
              let posMemory = mosquito.memory.path[i];
              let pos = new RoomPosition(posMemory.x, posMemory.y, posMemory.roomName);
              path.push(pos);
            }
          }

          if (path && path.length > 0) {
            if (!flee) {
              let nextPos = path[0];
              let potentialDamageAtNextPos = calc_incoming_damage_potential_next_tick_next_pos(
                nextPos,
                towers,
                enemyCreepsInRange5
              );
              if (potentialDamageAtNextPos < myDamageWithstandPotential * 1.25 && advance) {
                mosquito.moveByPath(path);
                console.log(mosquito.name, "is moving to", nextPos.x, nextPos.y, "because not too much damage");
              } else {
                console.log(
                  mosquito.name,
                  "wants to stand still, because it would take too much damage at the next position"
                );
              }
            } else {
              mosquito.moveByPath(path);
              console.log(mosquito.name, "is fleeing to", path[0].x, path[0].y);
            }
          }
        }
        }

      }

      // attack part
      let exposedCreeps = find_exposed_creeps(mosquito.pos, enemyCreepsInRange3);
      if (exposedCreeps.length) {
        let closestExposedCreep = mosquito.pos.findClosestByRange(exposedCreeps);
        if (closestExposedCreep && mosquito.pos.isNearTo(closestExposedCreep)) {
          mosquito.rangedMassAttack();
        } else {
          exposedCreeps.sort((a, b) => a.hits - b.hits);
          mosquito.rangedAttack(exposedCreeps[0]);
        }
        if (
          closestExposedCreep &&
          mosquito.hits === mosquito.hitsMax &&
          hostileDamagePotentialNextTick < myDamageWithstandPotential * 1.25 &&
          closestExposedCreep.getActiveBodyparts(ATTACK) < 5
        ) {
          mosquito.moveTo(closestExposedCreep);
        }
        continue;
      }

      let exposedNeutralStructs = find_exposed_structs(mosquito.pos, neutralStructuresInRange3);
      // filter out walls
      let exposedNeutralStructsNoWalls = exposedNeutralStructs.filter(s => s.structureType !== STRUCTURE_WALL);
      if (exposedNeutralStructsNoWalls.length) {
        exposedNeutralStructsNoWalls.sort((a, b) => b.pos.getRangeTo(mosquito) - a.pos.getRangeTo(mosquito));
        mosquito.rangedAttack(exposedNeutralStructsNoWalls[0]);
        continue;
      }

      let exposedEnemyStructs = find_exposed_structs(mosquito.pos, enemyStructuresInRange3);
      if (exposedEnemyStructs.length) {
        let rangeOne = exposedEnemyStructs.filter(s => s.pos.getRangeTo(mosquito) === 1);
        if (rangeOne.length) {
          mosquito.rangedMassAttack();
          continue;
        }

        let rangeTwo = exposedEnemyStructs.filter(s => s.pos.getRangeTo(mosquito) === 2);
        let rangeThree = exposedEnemyStructs.filter(s => s.pos.getRangeTo(mosquito) === 3);

        let damageScore = 0;
        for (let s of rangeThree) {
          damageScore++;
        }
        for (let s of rangeTwo) {
          damageScore += 4;
        }

        if (damageScore >= 10) {
          mosquito.rangedMassAttack();
        } else {
          // Prioritize attacking non-STRUCTURE_WALL targets
          let nonWallStructures = exposedEnemyStructs.filter(s => s.structureType !== STRUCTURE_WALL);
          if (nonWallStructures.length > 0) {
            nonWallStructures.sort((a, b) => a.hits - b.hits);
            mosquito.rangedAttack(nonWallStructures[0]);
          } else {
            // If there are only STRUCTURE_WALL targets, attack the one with the lowest hits
            exposedEnemyStructs.sort((a, b) => a.hits - b.hits);
            mosquito.rangedAttack(exposedEnemyStructs[0]);
          }
        }

        continue;
      }

      if (enemyStructuresInRange3.length) {
        let rangeOne = enemyStructuresInRange3.filter(s => s.pos.getRangeTo(mosquito) === 1);
        if (rangeOne.length) {
          mosquito.rangedMassAttack();
          continue;
        }

        let rangeTwo = enemyStructuresInRange3.filter(s => s.pos.getRangeTo(mosquito) === 2);
        let rangeThree = enemyStructuresInRange3.filter(s => s.pos.getRangeTo(mosquito) === 3);

        let damageScore = 0;
        for (let s of rangeThree) {
          damageScore++;
        }
        for (let s of rangeTwo) {
          damageScore += 4;
        }

        if (damageScore >= 10) {
          mosquito.rangedMassAttack();
        } else {
          // Prioritize attacking non-STRUCTURE_WALL targets
          let nonWallStructures = enemyStructuresInRange3.filter(s => s.structureType !== STRUCTURE_WALL);
          if (nonWallStructures.length > 0) {
            nonWallStructures.sort((a, b) => a.hits - b.hits);
            mosquito.rangedAttack(nonWallStructures[0]);
          } else {
            // If there are only STRUCTURE_WALL targets, attack the one with the lowest hits
            enemyStructuresInRange3.sort((a, b) => a.hits - b.hits);
            mosquito.rangedAttack(enemyStructuresInRange3[0]);
          }
        }

        continue;
      }
    }
  }

  if (Game.time % 1000 === 0) {
    let occupiedRooms: Array<string> = [];

    for (let creepName in Game.creeps) {
      let creep = Game.creeps[creepName];
      if (creep.memory.role === "mosquito") {
        if (creep.memory.targetRoom) {
          occupiedRooms.push(creep.memory.targetRoom);
        }
      }
    }

    let occupiedRoomsSet = new Set(occupiedRooms);

    let mosquitoRooms = Memory.e.mosquito;
    for (let i = 0; i < mosquitoRooms.length; i++) {
      if (mosquitoRooms[i].ts > 0) continue;
      if (!occupiedRoomsSet.has(mosquitoRooms[i].n)) {
        mosquitoRooms.splice(i, 1);
        i--;
      }
    }
  }
}

export default mosquito_attack;

const goToTheClosestSpawnWrapper = (
  creep: Creep,
  roomName: string,
  hostileCreeps: Creep[],
  myCreeps: Creep[],
  combinedStructures: AnyStructure[],
  flee: boolean,
  terrain: RoomTerrain
): boolean | CostMatrix => {
  return GoToTheClosestSpawn(creep, roomName, hostileCreeps, myCreeps, combinedStructures, flee, terrain);
};

const GoToTheClosestSpawn = (
  creep: Creep,
  roomName: string,
  hostileCreeps: Array<Creep>,
  myCreeps: Array<Creep>,
  combinedStructures: Array<AnyStructure>,
  flee: boolean,
  terrain: RoomTerrain
): boolean | CostMatrix => {
  let room = Game.rooms[roomName];
  if (!room || room == undefined || room === undefined || room == null || room === null) {
    return false;
  }

  let costs = new PathFinder.CostMatrix();

  for (let y = 0; y <= 49; y++) {
    for (let x = 0; x <= 49; x++) {
      const tile = terrain.get(x, y);
      let weight;
      if (tile == TERRAIN_MASK_WALL) {
        weight = 255;
      } else if (tile == TERRAIN_MASK_SWAMP) {
        weight = 65;
      } else if (tile == 0) {
        weight = 2;
      }
      costs.set(x, y, weight);
    }
  }

  for (let myCreep of myCreeps) {
    if (myCreep && myCreep.memory && myCreep.memory.role === "mosquito") {
      costs.set(myCreep.pos.x, myCreep.pos.y, 160);
    }
    else {
      costs.set(myCreep.pos.x, myCreep.pos.y, 255);
    }
  }

  for (let eCreep of hostileCreeps) {
    let hasDamageBodyParts = eCreep.getActiveBodyparts(ATTACK) > 5 || eCreep.getActiveBodyparts(RANGED_ATTACK) > 5;
    let range = creep.pos.getRangeTo(eCreep);
    if (hasDamageBodyParts && flee && range <= 4) {
      let radius = 2;
      if (eCreep.getActiveBodyparts(RANGED_ATTACK) > 5) {
        radius += 0;
      }
      for (let x = eCreep.pos.x - radius; x <= eCreep.pos.x + radius; x++) {
        for (let y = eCreep.pos.y - radius; y <= eCreep.pos.y + radius; y++) {
          if (x < 0 || x > 49 || y < 0 || y > 49) continue;
          let distance = Math.abs(eCreep.pos.x - x) + Math.abs(eCreep.pos.y - y);
          let weight = 254 - distance * 40; // You can adjust the multiplier (20) to control the weight gradient.
          weight = Math.max(weight, 1); // Ensure the weight is at least 1 to avoid blocking the path completely.
          if (costs.get(x, y) < weight) {
            costs.set(x, y, weight);
          }
        }
      }
    } else if (hasDamageBodyParts && !flee && range <= 6) {
      let radius = 2
      if(eCreep.getActiveBodyparts(RANGED_ATTACK) > 5) {
        radius += 0;
      }
      for (let x = eCreep.pos.x - radius; x <= eCreep.pos.x + radius; x++) {
        for (let y = eCreep.pos.y - radius; y <= eCreep.pos.y + radius; y++) {
          if (x < 0 || x > 49 || y < 0 || y > 49) continue;
          let distance = Math.abs(eCreep.pos.x - x) + Math.abs(eCreep.pos.y - y);
          let weight = 254 - distance * 40; // You can adjust the multiplier (20) to control the weight gradient.
          weight = Math.max(weight, 1); // Ensure the weight is at least 1 to avoid blocking the path completely.
          if (costs.get(x, y) < weight) {
            costs.set(x, y, weight);
          }
        }
      }
    } else {
      costs.set(eCreep.pos.x, eCreep.pos.y, 10);
    }
  }

  _.forEach(combinedStructures, function (struct: any) {
    if (costs.get(struct.pos.x, struct.pos.y) >= 100) return;
    if (struct.structureType === STRUCTURE_ROAD || struct.structureType === STRUCTURE_CONTAINER) {
      return;
    } else if (struct.structureType === STRUCTURE_RAMPART && struct.my) {
      return;
    } else {
      if (struct.hits >= 5000000) {
        costs.set(struct.pos.x, struct.pos.y, 175);
      } else if (struct.hits >= 2500000) {
        costs.set(struct.pos.x, struct.pos.y, 150);
      } else if (struct.hits >= 1000000) {
        costs.set(struct.pos.x, struct.pos.y, 100);
      } else if (struct.hits >= 500000) {
        costs.set(struct.pos.x, struct.pos.y, 75);
      } else {
        costs.set(struct.pos.x, struct.pos.y, 50);
      }
    }
  });
  return costs;
};
