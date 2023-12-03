function calc_incoming_damage(pos: RoomPosition, towers: Array<StructureTower>, hostileCreeps: Array<Creep>) {
  // Constants for damage values
  const BASE_MELEE_CREEP_DAMAGE = 30;
  const BASE_RANGED_CREEP_DAMAGE = 10;
  const MAX_TOWER_DAMAGE = 600;
  const MIN_TOWER_DAMAGE = 150;
  const TOWER_RANGE_RAMP_RATE = (MAX_TOWER_DAMAGE - MIN_TOWER_DAMAGE) / 14;

  // Boost multipliers for different tiers
  const BOOST_MULTIPLIERS = {
    XUH2O: 4, // T3 boost for ATTACK
    XKHO2: 4, // T3 boost for RANGED_ATTACK
    UH2O: 3, // T2 boost for ATTACK
    KHO2: 3, // T2 boost for RANGED_ATTACK
    UH: 2, // T1 boost for ATTACK
    KO: 2 // T1 boost for RANGED_ATTACK
  };

  let totalDamage = 0;

  let attackParts = 0;
  let rangedAttackParts = 0;
  let totalTowerDamage = 0;

  hostileCreeps.forEach(Hostile => {
    let range = pos.getRangeTo(Hostile);
    if (range > 3) return;
    let meleeWorthy = false;
    if (range === 1) {
      meleeWorthy = true;
    }
    for (let part of Hostile.body) {
      let boostMultiplier = 1;

      if (part.boost) {
        boostMultiplier = BOOST_MULTIPLIERS[part.boost] || 1;
      }

      if (part.type === ATTACK && meleeWorthy) {
        attackParts += boostMultiplier;
      } else if (part.type === RANGED_ATTACK) {
        rangedAttackParts += boostMultiplier;
      }
    }
  });

  towers.forEach(tower => {
    if (tower.store[RESOURCE_ENERGY] < 10) return;

    const rangeToTower = pos.getRangeTo(tower);
    const towerDistance = Math.max(Math.min(rangeToTower, 20), 1); // Adjusted lower bound to 1
    const towerDamage =
      towerDistance <= 5 ? MAX_TOWER_DAMAGE : MAX_TOWER_DAMAGE - (towerDistance - 5) * TOWER_RANGE_RAMP_RATE;
    totalTowerDamage += towerDamage;
  });

  totalDamage += attackParts * BASE_MELEE_CREEP_DAMAGE;
  totalDamage += rangedAttackParts * BASE_RANGED_CREEP_DAMAGE;
  totalDamage += totalTowerDamage;

  return totalDamage;
}

function calc_incoming_damage_potential_next_tick(
  pos: RoomPosition,
  towers: Array<StructureTower>,
  hostileCreeps: Array<Creep>,
  fatigue: number=0,
  mosquitosNearby:number=0
) {
  let advance = true;
  // Constants for damage values
  const BASE_MELEE_CREEP_DAMAGE = 30;
  const BASE_RANGED_CREEP_DAMAGE = 10;
  const MAX_TOWER_DAMAGE = 600;
  const MIN_TOWER_DAMAGE = 150;
  const TOWER_RANGE_RAMP_RATE = (MAX_TOWER_DAMAGE - MIN_TOWER_DAMAGE) / 14;

  // Boost multipliers for different tiers
  const BOOST_MULTIPLIERS = {
    XUH2O: 4, // T3 boost for ATTACK
    XKHO2: 4, // T3 boost for RANGED_ATTACK
    UH2O: 3, // T2 boost for ATTACK
    KHO2: 3, // T2 boost for RANGED_ATTACK
    UH: 2, // T1 boost for ATTACK
    KO: 2 // T1 boost for RANGED_ATTACK
  };

  let totalDamage = 0;

  let attackParts = 0;
  let rangedAttackParts = 0;
  let totalTowerDamage = 0;

  hostileCreeps.forEach(Hostile => {
    let range = pos.getRangeTo(Hostile);
    let pathRange = Hostile.pos.findPathTo(pos, { ignoreCreeps: true, ignoreRoads: true, swampCost: 1 }).length;
    if(pathRange > range) {
      range = pathRange;
    }
    if (range > 5 || (range === 5 && (Hostile.fatigue === 0 && fatigue !== 0) || (Hostile.fatigue !== 0 && fatigue === 0)) || (range === 4 && Hostile.fatigue !== 0 && fatigue !== 0) || Hostile.ticksToLive === 1) return;
    let meleeWorthy = false;
    if (range === 1 || (range === 2 && (Hostile.fatigue === 0 || fatigue === 0))) {
      meleeWorthy = true;
    }
    else if(range === 3 && Hostile.fatigue === 0 && fatigue === 0 && meleeWorthy || range === 5 && Hostile.fatigue === 0 && fatigue === 0 && mosquitosNearby < 3 && Game.time % 5 < 3) {
      if (mosquitosNearby < 2) advance = false;
    }
    for (let part of Hostile.body) {
      let boostMultiplier = 1;

      if (part.boost) {
        boostMultiplier = BOOST_MULTIPLIERS[part.boost] || 1;
      }

      if (part.type === ATTACK && meleeWorthy) {
        attackParts += boostMultiplier;
      } else if (part.type === RANGED_ATTACK) {
        rangedAttackParts += boostMultiplier;
      }
    }
  });

  towers.forEach(tower => {
    if (tower.store[RESOURCE_ENERGY] < 10) return;

    const rangeToTower = pos.getRangeTo(tower);
    const towerDistance = Math.max(Math.min(rangeToTower, 20), 1); // Adjusted lower bound to 1
    const towerDamage =
      towerDistance <= 5 ? MAX_TOWER_DAMAGE : MAX_TOWER_DAMAGE - (towerDistance - 5) * TOWER_RANGE_RAMP_RATE;
    totalTowerDamage += towerDamage;
  });

  totalDamage += attackParts * BASE_MELEE_CREEP_DAMAGE;
  totalDamage += rangedAttackParts * BASE_RANGED_CREEP_DAMAGE;
  totalDamage += totalTowerDamage;

  return { totalDamage, advance };
}

function calc_incoming_damage_potential_next_tick_next_pos(
  pos: RoomPosition,
  towers: Array<StructureTower>,
  hostileCreeps: Array<Creep>
) {
  // Constants for damage values
  const BASE_MELEE_CREEP_DAMAGE = 30;
  const BASE_RANGED_CREEP_DAMAGE = 10;
  const MAX_TOWER_DAMAGE = 600;
  const MIN_TOWER_DAMAGE = 150;
  const TOWER_RANGE_RAMP_RATE = (MAX_TOWER_DAMAGE - MIN_TOWER_DAMAGE) / 14;

  // Boost multipliers for different tiers
  const BOOST_MULTIPLIERS = {
    XUH2O: 4, // T3 boost for ATTACK
    XKHO2: 4, // T3 boost for RANGED_ATTACK
    UH2O: 3, // T2 boost for ATTACK
    KHO2: 3, // T2 boost for RANGED_ATTACK
    UH: 2, // T1 boost for ATTACK
    KO: 2 // T1 boost for RANGED_ATTACK
  };

  let totalDamage = 0;

  let attackParts = 0;
  let rangedAttackParts = 0;
  let totalTowerDamage = 0;

  hostileCreeps.forEach(Hostile => {
    let range = pos.getRangeTo(Hostile);
    if (
      range > 4 ||
      (range === 4 && Hostile.fatigue !== 0) ||
      Hostile.ticksToLive === 1
    )
      return;
    let meleeWorthy = false;
    if (
      range === 1 ||
      (range === 2 && (Hostile.fatigue === 0))
    ) {
      meleeWorthy = true;
    }
    for (let part of Hostile.body) {
      let boostMultiplier = 1;

      if (part.boost) {
        boostMultiplier = BOOST_MULTIPLIERS[part.boost] || 1;
      }

      if (part.type === ATTACK && meleeWorthy) {
        attackParts += boostMultiplier;
      } else if (part.type === RANGED_ATTACK) {
        rangedAttackParts += boostMultiplier;
      }
    }
  });

  towers.forEach(tower => {
    if (tower.store[RESOURCE_ENERGY] < 10) return;

    const rangeToTower = pos.getRangeTo(tower);
    const towerDistance = Math.max(Math.min(rangeToTower, 20), 1); // Adjusted lower bound to 1
    const towerDamage =
      towerDistance <= 5 ? MAX_TOWER_DAMAGE : MAX_TOWER_DAMAGE - (towerDistance - 5) * TOWER_RANGE_RAMP_RATE;
    totalTowerDamage += towerDamage;
  });

  totalDamage += attackParts * BASE_MELEE_CREEP_DAMAGE;
  totalDamage += rangedAttackParts * BASE_RANGED_CREEP_DAMAGE;
  totalDamage += totalTowerDamage;

  return totalDamage;
}

export { calc_incoming_damage, calc_incoming_damage_potential_next_tick, calc_incoming_damage_potential_next_tick_next_pos};
