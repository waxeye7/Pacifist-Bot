import { roomPart } from "utils/Profile";
import roomDefence from "./rooms.defence";
import spawning from "./rooms.spawning";
import construction, { Remote_Roads_Tick, Situational_Building } from "./rooms.construction";
import market from "./rooms.market";
import labs from "./rooms.labs";
import observe from "./rooms.observe";
import data from "./rooms.data";
import remotes, { manageRemotes, scanRemoteThreats, roomTickOffset } from "./rooms.remotes";
import powerSpawning from "./rooms.powerSpawning";
import supportOtherRooms from "./rooms.supportOtherRooms";
import { getCpuPolicy, REMOTE_INFRA_BUCKET } from "utils/CpuPolicy";
import { powerDisabled, speedrunEnabled } from "utils/Features";
import { applySpeedrunSpawnHints, skipHighRclRoom } from "utils/Speedrun";
import { placeFromPlanV2 } from "utils/PlanV2";
import { refreshUnreachable, pruneBadFill } from "utils/Reachability";
import { forwardToControllerLink } from "../Roles/energyMiner";
import { retireStopgapsFor } from "./spawnLadder";
import { logAlways } from "utils/Logger";
import { isSkeleton } from "War/mode";
import { wipeForeignSites } from "utils/ForeignSites";
import { cachedHostileCreeps } from "utils/RoomCache";

/**
 * The rampart emergency releases when the bank that raised it comes back...
 * 80,000 is the exact number the raise below tests, so the flag is symmetric.
 */
const RAMP_URGENT_CLEAR_BANK = 80000;
/**
 * ...or when it simply gets old. ~17 hours of "emergency" is a description of
 * the room, not an event, and a latch that cannot fall carries no information.
 */
const RAMP_URGENT_MAX_TICKS = 20000;


/*
 * PER-ROOM FAULT ISOLATION.
 *
 * ErrorMapper.wrapLoop in main.ts is the only try/catch above this file, so a
 * throw anywhere in the room pass (spawning / defence / market / labs /
 * construction / observe / ...) used to abort the WHOLE tick before the creeps
 * ever ran - one bad room froze the empire. Every room iteration now runs
 * inside guarded(): the room that threw is skipped, the rest of the tick
 * continues, and the error is logged (never swallowed silently).
 *
 * Heap-level (not Memory) throttle: at most one line per room per 100 ticks,
 * so a room that throws every tick cannot flood the console.
 */
const lastRoomErrorTick = new Map<string, number>();

function guarded(room: any, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    const name = typeof room === "string" ? room : (room && room.name) || "unknown";
    const last = lastRoomErrorTick.get(name);
    if (last === undefined || Game.time - last >= 100) {
      lastRoomErrorTick.set(name, Game.time);
      logAlways("[rooms] ERROR in", name, "-", (e && e.stack) || e);
    }
  }
}

function rooms() {
  /* */

  const start = Game.cpu.getUsed();
  // _.forEach(Memory.rooms, function(RoomMemory) {

  // });

  let myRooms = [];

  let roomsIController = 0;

  /*
   * PER-ROOM CADENCES ARE PHASED, NOT SYNCHRONISED.
   *
   * Every `Game.time % N == 0` gate in this pass used to fire for ALL owned
   * rooms on the SAME tick, because the residue was read off absolute Game.time
   * with no room term. Seven communes therefore ran construction() together
   * once per 1,000 ticks, pruneBadFill() together every 100, placeFromPlanV2()
   * together every 15, identifySources() together every 10 and
   * scanRemoteThreats() together every 5. Same total work either way - but all
   * of it landed on one tick instead of being spread over N.
   *
   * That is what the CPU spikes were. Live shard3 runs a 100-tick average of
   * 18.0 against a limit of 20, which should bank +2/tick and float the bucket
   * to its 10,000 ceiling in under an hour. It has instead sat at 2,700-3,100
   * for the whole watch, because the synchronised ticks overshoot 20 and every
   * overshoot is paid straight out of the bucket. The last-30 window carried a
   * 21.0 against a 14.1 minimum on an unchanged roster.
   *
   * The bucket is not a vanity number here: CpuPolicy gates the optional roster
   * at 5,000 and remotes at 4,000, so a bucket pinned near 3,000 means repair,
   * maintainer, sweeper AND every remote have been switched off continuously.
   * Flattening the peak is what re-opens them, and it costs nothing - no pass
   * runs less often than it did, each one just starts on its own residue.
   *
   * roomTickOffset is the existing hash (rooms.remotes.ts:403) already used for
   * market() and manageRemotes(); this only extends it to the rest of the pass.
   * Measured spread over the seven live rooms: 7/7 distinct residues at mod 100
   * and mod 1000, 6/7 at mod 15, 5/7 at mod 10 and 20, 4/7 at mod 5.
   *
   * DELIBERATELY LEFT SYNCHRONISED: the `% 400` / `% 25000` targetRampRoom
   * election, the `% 3012` keepTheseRoads wipe and the `% 25000` site sweep all
   * iterate Game.rooms from inside the per-room body, so phasing them would run
   * a whole-empire pass seven times per period instead of once. labs() keeps
   * its plain `% 10` for the reason documented at its call site.
   */
  // Body of the per-visible-room pass. Hoisted out of the _.forEach purely so
  // it can be handed to guarded() below - contents unchanged.
  const eachVisibleRoom = function (room: any) {
    // if(!room.controller) {
    //     delete room.memory;
    // }
    // if(room.controller.level == 0) {
    //     delete room.memory;
    // }

    if (room && room.controller && room.controller.my) {
      if (skipHighRclRoom(room)) return;
      if (Game.time % 100 == 0) {
        let spawnAmount = room.find(FIND_MY_SPAWNS).length;
        if (room.controller.level >= 6 && spawnAmount == 0) {
          if (!Memory.keepAfloat.includes(room.name)) {
            Memory.keepAfloat.push(room.name);
          }
        } else if (room.controller.level >= 6 && spawnAmount > 0) {
          if (Memory.keepAfloat.includes(room.name)) {
            Memory.keepAfloat = Memory.keepAfloat.filter(r => r !== room.name);
          }
        }
      }

      if (room.controller.safeMode && room.controller.safeMode > 100 && Game.time % 100 === 0) {
        let hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
        if (!hostileCreeps.length) {
          room.memory.danger = false;
          room.memory.danger_timer = 0;
        }
      }

      if (room.memory.danger) {
        if (room.memory.danger_timer % 50 === 0) console.log(room.name, "danger", room.memory.danger_timer);
        room.memory.danger_timer++;
        if (room.memory.danger_timer > 10000) {
          room.memory.danger_timer = 0;
        }
      } else if (!room.memory.danger && room.memory.danger_timer !== 0) {
        if (room.memory.danger_timer > 5) {
          room.memory.danger_timer -= 5;
        } else {
          room.memory.danger_timer = 0;
        }
      }

      roomsIController += 1;
      myRooms.push(room.name);
    }

    if (Game.time % 400 == 0) {
      let progress = 0;
      let level = 1;
      let current = false;
      if (Game.time % 25000 === 0) {
        _.forEach(Game.rooms, function (anyroom: any) {
          if (
            anyroom &&
            anyroom.controller &&
            anyroom.controller.my &&
            anyroom.controller.level < 8 &&
            anyroom.controller.level >= 6
          ) {
            if (anyroom.controller.level > level) {
              current = anyroom.name;
              level = anyroom.controller.level;
              progress = anyroom.controller.progress;
            } else if (anyroom.controller.level == level) {
              if (anyroom.controller.progress > progress) {
                current = anyroom.name;
                level = anyroom.controller.level;
                progress = anyroom.controller.progress;
              }
            }
          }
        });
      }

      if (current) Memory.targetRampRoom.room = current;

      // .my is load-bearing here: this % 400 block runs for EVERY visible
      // room (the owned-room branch only opens further down), so an OBSERVED
      // foreign RCL6 room could capture the ramp target - and because the
      // urgent-latch release requires targetRampRoom.room to equal an OWNED
      // room's name, a foreign name could never be released.
      if (room.controller && room.controller.my && room.controller.level == 6 && room.controller.progress < 10000) {
        Memory.targetRampRoom.room = room.name;
      }
      if (room.memory.Structures) {
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        if (room.controller && room.controller.my && room.controller.level >= 6 && room.terminal && storage && storage.store[RESOURCE_ENERGY] < 75000) {
          Memory.targetRampRoom.room = room.name;
        }
      }
    }

    if (room && room.controller && room.controller.my) {
      if (!isSkeleton(room.name)) supportOtherRooms(room);

      if (!room.memory.Structures) {
        room.memory.Structures = {};
      }

      // Structures.storage can hold the pre-storage CONTAINER id forever:
      // the container keeps existing after the real storage is built, so
      // every `getObjectById(cache) || findStorage()` caller short-circuits
      // on it (bit fillers, spawn gates, and links). Re-point when stale.
      if (room.storage && room.memory.Structures.storage !== room.storage.id) {
        room.memory.Structures.storage = room.storage.id;
        delete room.memory.Structures.bin; // re-derive next to the real storage
      }

      if (!room.memory.reserveFill) {
        room.memory.reserveFill = [];
      }

      // Keep the controller link fed. Room-level on purpose: this is a
      // structure action, and the rooms that strand energy in a link are the
      // ones that have already lost the creep that used to drive it.
      // See Roles/energyMiner.ts forwardToControllerLink().
      if (room.controller.level >= 5) {
        forwardToControllerLink(room);
      }

      // Stopgaps yield to the real creep — room-level for the same reason as
      // the link forward above. This used to live inside runSpawnLadder, which
      // bails the moment `spawn.spawning` is true, so a one-spawn room retired
      // nothing while it was busy and paid two miner annuities for one 10 e/t
      // source. See Rooms/spawnLadder.ts retireStopgapsFor().
      retireStopgapsFor(room);

      if (room.controller.level >= 5 && room.memory.Structures.container) {
        delete room.memory.Structures.container;
      }

      if (room.memory.danger && room.memory.danger_timer > 125 && Game.time % 25 == 0) {
        let remoteRooms = Object.keys(room.memory.resources);
        if (remoteRooms.length > 1) {
          remoteRooms = remoteRooms.filter(function (remoteRoom) {
            return remoteRoom !== room.name;
          });
          if (remoteRooms.length > 1) {
            for (let remoteRoom of remoteRooms) {
              room.memory.resources[remoteRoom].active = false;
            }
          }
        }
      }

      if (Game.time % 1000 === 0) {
        if (Memory.AvoidRooms) {
          if (Memory.AvoidRooms.includes(room.name)) {
            Memory.AvoidRooms = Memory.AvoidRooms.filter(function (roomname) {
              return roomname !== room.name;
            });
          }
        } else {
          Memory.AvoidRooms = [];
        }
      }

      if (Game.time % 84 == 0 && room.controller.level > 1 && room.controller.level !== 8) {
        console.log(
          room.name,
          "has",
          Math.floor((room.controller.progress / room.controller.progressTotal) * 100) + "%",
          "and is level",
          room.controller.level
        );
      }

      // Squatter cleanup for a freshly claimed room. This used to hang off the
      // GLOBAL `Game.time % 25000`, so a room claimed one tick after that
      // modulus landed kept the previous owner's walls for another 25000 ticks
      // (~21h) - the one window where they hurt most. Now it is claim-relative:
      // once as soon as we see the room at RCL1, then at most every 25000 ticks.
      if (room.controller.level == 1 && !room.controller.safeMode) {
        const lastSweep = room.memory.squatterSweepTick;
        if (!room.memory.squatterSweepDone || lastSweep === undefined || Game.time - lastSweep >= 25000) {
          room.memory.squatterSweepDone = true;
          room.memory.squatterSweepTick = Game.time;
          let walls = room.find(FIND_STRUCTURES, {
            filter: building =>
              building.structureType == STRUCTURE_WALL ||
              (!building.my &&
                building.structureType != STRUCTURE_ROAD &&
                building.structureType != STRUCTURE_CONTAINER)
          });
          for (let wall of walls) {
            wall.destroy();
          }
        }
      }

      if (room.memory.danger && room.memory.danger_timer > 100) {
        if (room.memory.danger_timer > 350) {
          Memory.CPU.reduce = true;
        }
        let storage: any = Game.getObjectById(room.memory.Structures.storage);
        if (storage && storage.store[RESOURCE_ENERGY] < 175000) {
          Memory.targetRampRoom.room = room.name;
          if (storage.store[RESOURCE_ENERGY] < 80000) {
            // Stamp the raise. An emergency with no start time cannot be given
            // a deadline, and the release below is a deadline as much as it is
            // a condition — see RAMP_URGENT_MAX_TICKS.
            if (!Memory.targetRampRoom.urgent) Memory.targetRampRoom.t = Game.time;
            Memory.targetRampRoom.urgent = true;
          } else if (Game.time % 400 == 0) {
            Memory.targetRampRoom.urgent = false;
          }
        }
      } else {
        if (Game.time % 1000 == 0) {
          Memory.CPU.reduce = false;
        }

        /*
         * RELEASE THE RAMPART-EMERGENCY LATCH.
         *
         * `urgent` is raised at the top of this block, and its ONLY reset
         * (`Game.time % 400 == 0`) lived INSIDE `danger && danger_timer > 100`
         * and `storage < 175000` — i.e. the reset was only reachable while the
         * room was still under attack. The moment the raid ended the branch
         * stopped running and the flag stayed true forever.
         *
         * Live cost on W1N1 (RCL7, no hostiles, danger:false, danger_timer:0):
         * `Memory.targetRampRoom = {room:"W1N1", urgent:true}` kept the room
         * pinned as the empire's rampart target with an extra filler and the
         * SpecialRepair rung primed, while two 36-WORK repairers burned ~72
         * energy/tick into ramparts already at 4.2-7.5M hits — storage fell
         * 35 454 -> 19 826 in 444 ticks and the upgrader starved.
         *
         * THE FIRST RELEASE COULD NOT FIRE EITHER. It demanded that EVERY
         * rampart in the room be above 3,000,000 hits (10,000,000 at RCL8),
         * which is a finished-wall bar, not an emergency-is-over bar. Live
         * shard3 2026-09-10: `{room:"E39N58", urgent:true}` with the room at
         * peace, its 46 ramparts between 85,561 and 386,201 hits, and a bot
         * whose entire empire minimum had only just crossed 100,000. So the
         * flag was permanently latched AND it re-ran a room-wide
         * find(FIND_MY_STRUCTURES) every 25 ticks, forever, to re-confirm that
         * it could not release — on an empire sitting at a 2,350 CPU bucket.
         *
         * So release on the condition that RAISED it, which costs one
         * getObjectById and no find: the bank is back. And give the emergency
         * a deadline regardless. A rampart emergency that has run for
         * RAMP_URGENT_MAX_TICKS is not an emergency, it is the room's normal
         * state, and a flag that can never fall is a flag that means nothing.
         * A latch with no timestamp predates this code and is released at once.
         */
        if (Game.time % 25 == 0 && Memory.targetRampRoom && Memory.targetRampRoom.urgent &&
          Memory.targetRampRoom.room == room.name && !room.memory.danger) {
          const bank: any = Game.getObjectById(room.memory.Structures.storage);
          const banked = bank && bank.store ? bank.store[RESOURCE_ENERGY] : 0;
          const raised = Memory.targetRampRoom.t;
          const expired = raised === undefined || Game.time - raised > RAMP_URGENT_MAX_TICKS;
          if (banked >= RAMP_URGENT_CLEAR_BANK || expired) {
            Memory.targetRampRoom.urgent = false;
            delete Memory.targetRampRoom.t;
            console.log("[ramp-latch]", room.name, "releasing targetRampRoom.urgent -",
              expired ? "emergency older than " + RAMP_URGENT_MAX_TICKS + " ticks" : "bank back to " + banked);
          }
        }
      }

      if (
        room.memory.danger &&
        (room.controller.level == 2 || room.controller.level == 3) &&
        (!room.memory.Structures.towers || room.memory.Structures.towers.length == 0)
      ) {
        room.controller.activateSafeMode();
      }

      if (!Memory.AvoidRooms) {
        Memory.AvoidRooms = [];
      }

      if (!Memory.AvoidRoomsTemp) {
        Memory.AvoidRoomsTemp = {};
      }

      if (!Memory.billtong_rooms) {
        Memory.billtong_rooms = [];
      }

      if (!powerDisabled()) {
        roomPart("powerSpawn", () => powerSpawning(room));
      }
      if (speedrunEnabled()) {
        roomPart("speedrunHints", () => applySpeedrunSpawnHints(room));
      }
      roomPart("spawning", () => spawning(room));
      // Every 20 ticks: foreign sites only exist right after a claim, and the
      // find behind this ran in every owned room every tick.
      if (room.controller && room.controller.my && (Game.time + roomTickOffset(room.name)) % 20 === 0)
        roomPart("wipeForeignSites", () => wipeForeignSites(room));
      // Orphan migrate flag after a stripped plan keeps siting the old bunker.
      if ((room.memory as any).planMigration && !room.memory.planV2) {
        delete (room.memory as any).planMigration;
      }

      if (Game.time % 500 === 0 && room.memory.ram_coming) {
        delete room.memory.ram_coming;
      }

      // const defenceTime = Game.cpu.getUsed()

      roomPart("defence", () => roomDefence(room));
      // console.log('Room Defence Ran in', Game.cpu.getUsed() - defenceTime, 'ms')

      if (room.controller.level == 8 && (!Memory.CPU.reduce || Game.cpu.bucket >= 8000) && !isSkeleton(room.name)) {
        roomPart("observe", () => observe(room));
      }
      roomPart("data", () => data(room));

      if (room.terminal && room.controller.level >= 6 && !isSkeleton(room.name)) {
        // Staggered per room so every terminal room does not scan Game.market
        // on the same tick (same idiom as manageRemotes). Labs stays on the
        // plain %10: its internal refresh cadences (%120 / %500 / %21000 in
        // rooms.labs.ts) sit on absolute Game.time, and a %120 tick only
        // lands on a staggered %10 gate when the room's offset is itself a
        // multiple of 10 - for every other room they would simply never run.
        if ((Game.time + roomTickOffset(room.name)) % 10 === 0) {
          // Was an ad-hoc getUsed() pair plus a console.log on every single
          // market pass — a string built every time whether or not
          // Memory.verbose let it print. Memory.CPU.roomParts.market is the
          // same number, kept as an EMA, readable from outside the game.
          roomPart("market", () => market(room));
        }
        if (Game.time % 10 === 0) {
          roomPart("labs", () => labs(room));
        }
      }

      if ((Game.time + roomTickOffset(room.name)) % 10 == 0 || Game.time < 10) {
        // const start = Game.cpu.getUsed()
        roomPart("identifySources", () => identifySources(room));
        // console.log('Identify Sources Ran in', Game.cpu.getUsed() - start, 'ms')
      }

      let bucket = Game.cpu.bucket;

      // v2-planned rooms: keep the 4 site slots recycling. placeFromPlanV2 is
      // cheap (one FIND_STRUCTURES + one FIND_MY_CONSTRUCTION_SITES, no
      // PathFinder), so it does not need the 100/1000-tick construction
      // cadence — at RCL4+ that cadence meant ~4 structures per 1000 ticks.
      // construction() still calls it too; the function is idempotent.
      if (room.memory.planV2 && (Game.time + roomTickOffset(room.name)) % 15 === 0 && !isSkeleton(room.name)) {
        roomPart("planV2Place", () => placeFromPlanV2(room));
      }

      // Which structures can a creep actually stand next to? Self-throttling
      // (one flood fill per ~50 ticks) and it MUST run before the fill target
      // pickers, which is why it sits in the room loop and not in a role.
      roomPart("refreshUnreachable", () => refreshUnreachable(room));
      if ((Game.time + roomTickOffset(room.name)) % 100 === 0) {
        roomPart("pruneBadFill", () => pruneBadFill(room));
      }

      // Low RCL: build more often so extensions/containers aren't stuck waiting 1000 ticks.
      // High RCL keeps the old expensive cadence.
      const constructionInterval = room.controller.level < 4 ? 100 : 1000;
      // Same recalibration as the remote-roads gate below: `bucket > 3500`
      // against a live bucket that sits at 3,357-3,595 made this a COIN FLIP
      // once per 1,000 ticks, which is how a room ends up carrying a plan it
      // never finishes. One pass per room per 1,000 ticks is affordable at any
      // bucket that is not an actual emergency.
      if (
        !isSkeleton(room.name) &&
        (((Game.time + roomTickOffset(room.name)) % constructionInterval == 0 && bucket > REMOTE_INFRA_BUCKET) ||
          room.memory.data.DOB == 2 ||
          room.memory.data.DOBug == 2)
      ) {
        roomPart("construction", () => construction(room));
      }

      // Which neighbours this commune remotes. Cheap, self-throttling
      // (per-room stagger inside), owns room.memory.resources[*].active.
      if (!isSkeleton(room.name)) manageRemotes(room);

      // Threat sweep runs far more often than manageRemotes' 25-tick cadence:
      // "leave fast" is only fast if we notice fast.
      if ((Game.time + roomTickOffset(room.name)) % 5 === 0) {
        roomPart("scanRemoteThreats", () => scanRemoteThreats(room));
      }

      // Remote roads + per-source pathLength. Every tick, but per-REMOTE
      // cadence and vision-triggered inside: `Game.time % 500` here meant the
      // pass only did anything if a creep happened to be standing in the
      // remote on that one tick, so remotes stayed unscored and unpaved
      // forever. Remote_Roads_Tick is a for-in over room.memory.resources with
      // early continues (no find, no PathFinder) when nothing is due, and does
      // at most one remote's PathFinder work per room per tick.
      // BUCKET GATE: 5000 -> REMOTE_INFRA_BUCKET. Live shard3 runs a stable
      // bucket of 3,357-3,595 (limit 20, 100-tick avg 17.3), so `> 5000` meant
      // this pass had not executed in months: no remote was ever paved and no
      // per-source pathLength was ever derived — and pathLength is the ONLY
      // input to remote scoring and carrier sizing, per Build_Remote_Roads.
      //
      // The gate was also wildly out of proportion to the cost. Remote_Roads_-
      // Tick does at most ONE Build_Remote_Roads per room per tick (it returns
      // straight after), and each remote is stamped with a 500-tick cadence
      // (REMOTE_ROAD_PASS_EVERY / REMOTE_PATH_PASS_EVERY), so a three-remote
      // room averages 0.006 PathFinder passes a tick. That is a rounding error
      // guarded by a threshold the bot cannot reach.
      //
      // Which made it self-defeating: roads are what REDUCE the CPU this gate
      // is protecting. A loaded hauler pays 1 fatigue per non-MOVE part on
      // road against 2 on plain, so paving a remote lane halves the MOVE parts
      // (or the creep count) needed for the same throughput — and creep
      // headcount is where 10.4 of this bot's 17.3 CPU goes.
      if (bucket > REMOTE_INFRA_BUCKET && room.controller.level >= 4 && getCpuPolicy().allowRemotes) {
        roomPart("remoteRoads", () => Remote_Roads_Tick(room));
      }
      roomPart("situationalBuild", () => Situational_Building(room));
    }

    // const establishMemoryTime = Game.cpu.getUsed()
    roomPart("establishMemory", () => establishMemory(room));
    // console.log('Establish Memory Ran in', Game.cpu.getUsed() - establishMemoryTime, 'ms');

    // let list = Memory.tasks.wipeRooms.destroyStructures
    // console.log(JSON.stringify(list.length))

    if (Game.time % 25000 == 0) {
      _.forEach(Game.constructionSites, function (site) {
        // Spawn sites wait for CBs; 0-creep is the bootstrap, not stale remotes.
        if (site.structureType == STRUCTURE_SPAWN) return;
        if (site.room == undefined || site.room.find(FIND_MY_CREEPS).length == 0) {
          site.remove();
          console.log("site removed for being unbuilt for ages");
        }
      });
    }
    // let constructionSites = room.find(FIND_CONSTRUCTION_SITES);
    // console.log(constructionSites.length)
    // for (var site of constructionSites) {
    //     if (site.structureType == STRUCTURE_ROAD) {
    //         if(site.remove() == 0) {
    //             console.log("it's working")
    //         }
    //     }
    // }
  };

  _.forEach(Game.rooms, function (room: any) {
    guarded(room, function () {
      eachVisibleRoom(room);
    });
  });

  /*
   * ONCE PER EMPIRE, NOT ONCE PER ROOM PER EMPIRE.
   *
   * This sweep lived inside the per-visible-room body while iterating
   * Game.rooms itself, so with seven communes it ran the whole-empire pass
   * seven times on the same tick and did a FIND_MY_CONSTRUCTION_SITES in every
   * visible room seven times over. The result was identical after the first
   * pass — the list is set to [] and re-reading it changes nothing — so six
   * sevenths of the work was pure waste, spent as a spike on one tick.
   *
   * Hoisted verbatim; the inner guards are unchanged and still do the real
   * filtering. The outer `!room.memory.danger` term is dropped because it was
   * the CURRENT room's flag deciding whether to sweep the OTHER six, which was
   * never the intent — each room's own danger flag is already checked inside.
   */
  if (Game.time % 3012 == 0 && Game.cpu.bucket > 3500) {
    _.forEach(Game.rooms, function (everyRoom) {
      guarded(everyRoom, function () {
        if (
          everyRoom &&
          everyRoom.memory &&
          !everyRoom.memory.danger &&
          // OWNED rooms only. For a REMOTE this list is RemoteRepair's
          // entire repair enrollment; wiping it made the repairer arrive,
          // find nothing repairable, latch serviced and recycle — while
          // the rung kept re-spawning it for the still-decaying roads.
          everyRoom.controller && everyRoom.controller.my &&
          everyRoom.find(FIND_MY_CONSTRUCTION_SITES).length == 0
        ) {
          everyRoom.memory.keepTheseRoads = [];
        }
      });
    });
  }

  if (Game.time % 300 == 0) {
    if (Game.gcl.level > roomsIController) {
      Memory.CanClaimRemote = Game.gcl.level - roomsIController;
    } else {
      Memory.CanClaimRemote = 0;
    }
  }

  if (Game.time % 10000 == 0) {
    _.forEach(Memory.rooms, function (memoryRoom, roomName) {
      if (!Game.rooms[roomName] || (Game.rooms[roomName].controller && Game.rooms[roomName].controller.level == 0)) {
        delete Memory.rooms[roomName];
      }
    });
  }
  // let uselessMemory = false;
  // if(!visibleRoom.controller || (visibleRoom.controller && visibleRoom.controller.level == 0)) {
  //     delete Memory.rooms[visibleRoom.name];
  // }

  if (Game.time % 500 == 1) {
    const policy = getCpuPolicy();

    // NOTE: opening remotes now lives in manageRemotes() (rooms.remotes.ts),
    // which runs per-room every 25 ticks instead of flipping one flag on one
    // randomly-picked commune every 500 ticks. What stays here is the CPU
    // panic valve: when the bot is over budget, shut every remote down.
    // A pinned bucket means we are under budget regardless of the averages
    // (see CpuPolicy.allowRemotes) - the valve is for a DRAINING bucket, and
    // closing every remote in the empire while it sits at 10000 is what
    // oscillated E37N59's fleet on and off every 500 ticks.
    // Trust CpuPolicy.allowRemotes only. The old `fiveHundredTickAvg > limit-2`
    // closed remotes at avg 18.5 / limit 20 / bucket 7400 — the same
    // double-counted margin that latched remotes off in CpuPolicy before
    // the monotone fix. Closing remotes drops income, not CPU.
    if (!policy.allowRemotes) {
      for (let roomName of myRooms) {
        let room = Game.rooms[roomName];
        guarded(room || roomName, function () {
          if (!room || !room.memory.resources) return;
          let remoteRooms = Object.keys(room.memory.resources);
          if (remoteRooms.length > 1) {
            remoteRooms = remoteRooms.filter(function (remoteRoom) {
              return remoteRoom !== roomName;
            });
            // Close every remote this commune owns. (The old loop re-read
            // `.active` immediately after setting it to false and broke out on
            // the result, so `found` could never be true - both the flag and
            // the outer break were dead code.)
            if (remoteRooms.length > 1) {
              for (let remoteRoom of remoteRooms) {
                const e = room.memory.resources[remoteRoom];
                if (!e) continue;
                // Stamp the TRANSITION only: remoteRecalled's 100-tick
                // debounce and the queued-reserver drop both mature against
                // closedAt, and a valve close without a stamp read as
                // "closed forever ago" — instant recall, instant drop.
                if (e.active !== false) e.closedAt = Game.time;
                e.active = false;
              }
            }
          }
        });
      }
    }
  }

  console.log("Rooms Ran in", Game.cpu.getUsed() - start, "ms");
}

/*
 * How many of OUR attacker / RangedAttacker creeps are standing in each room.
 *
 * establishMemory() ran this whole Game.creeps scan once per NON-OWNED visible
 * room (every 3 ticks): with scouts/observers up that is dozens of full creep
 * sweeps for an answer that is identical for every room. Computed once per
 * tick now and memoised on the heap against Game.time; rooms with no attackers
 * are simply absent from the map (callers use `|| 0`, which matches the old
 * "counter stayed at 0" branch exactly).
 */
let attackerScanTick = -1;
let attackerScanResult: { [roomName: string]: number } = {};

function attackersByRoom(): { [roomName: string]: number } {
  if (attackerScanTick === Game.time) return attackerScanResult;
  attackerScanTick = Game.time;
  attackerScanResult = {};
  _.forEach(Game.creeps, function (creep) {
    if (creep.memory.role == "attacker" || creep.memory.role === "RangedAttacker") {
      const where = creep.room.name;
      attackerScanResult[where] = (attackerScanResult[where] || 0) + 1;
    }
  });
  return attackerScanResult;
}

function establishMemory(room) {
  if (Game.time % 3 == 0 || Game.time < 10) {
    if (!Memory.tasks) {
      Memory.tasks = {};
    }

    if (!Memory.tasks.wipeRooms) {
      Memory.tasks.wipeRooms = {};
    }

    if (!Memory.tasks.wipeRooms.destroyStructures) {
      Memory.tasks.wipeRooms.destroyStructures = [];
    }

    if (!Memory.tasks.wipeRooms.killCreeps) {
      Memory.tasks.wipeRooms.killCreeps = [];
    }

    // console.log(JSON.stringify(Memory.tasks))

    let HostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
    let HostileCreeps: Array<Creep> = cachedHostileCreeps(room);
    let isArmed = false;

    // check if has attacking parts.
    if (HostileCreeps.length > 0) {
      HostileCreeps.forEach(Hostile => {
        for (let part of Hostile.body)
          if (part.type == ATTACK || part.type == RANGED_ATTACK) {
            isArmed = true;
            break;
          }
      });
    }

    /*
     * A HIT LIST THAT NAMED TWO OF OUR OWN ROOMS.
     *
     * Everything that adds a room to wipeRooms, and everything that removes
     * it, lives inside the `not ours` branch below. So a room goes on the list
     * while it is foreign, we claim it, and from the next tick the whole block
     * is skipped for it � there is no path that takes the name off again.
     *
     * Live shard3 2026-09-11, read straight out of Memory.tasks:
     *   destroyStructures: [..., "E39N58", ...]   RCL7, ours, 2 spawns
     *   killCreeps:        [..., "E36N57", ...]   RCL6, ours
     * E39N58 was on a list of rooms to demolish.
     *
     * Nothing reads these today � Roles/attacker's consumer and both
     * rooms.spawning rungs are commented out � which is the only reason this
     * has been harmless. It is a loaded gun pointed at the empire's own
     * rooms, waiting for someone to uncomment a line, so the list is now
     * self-correcting: owning a room takes it off.
     */
    if (room.controller && room.controller.my) {
      const W = Memory.tasks.wipeRooms;
      if (W.destroyStructures.includes(room.name)) {
        W.destroyStructures = W.destroyStructures.filter(e => e != room.name);
      }
      if (W.killCreeps.includes(room.name)) {
        W.killCreeps = W.killCreeps.filter(e => e != room.name);
      }
    }

    if ((room.controller && !room.controller.my) || !room.controller) {
      if (!room.memory.roomData) {
        room.memory.roomData = {};
      }

      if (HostileStructures.length > 0) {
        if (!Memory.tasks.wipeRooms.destroyStructures.includes(room.name)) {
          Memory.tasks.wipeRooms.destroyStructures.push(room.name);
        }
        room.memory.roomData.has_hostile_structures = true;
      } else {
        Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(
          element => element != room.name
        );
        room.memory.roomData.has_hostile_structures = false;
      }

      if (HostileCreeps.length > 0 && isArmed) {
        if (!Memory.tasks.wipeRooms.killCreeps.includes(room.name)) {
          Memory.tasks.wipeRooms.killCreeps.push(room.name);
        }
        // calculate total attack parts, ranged attack parts, and heal parts
        let attackParts = 0;
        let rangedAttackParts = 0;
        let healParts = 0;

        HostileCreeps.forEach(Hostile => {
          for (let part of Hostile.body) {
            let boostMultiplier = 1;
            let toughMultiplier = 0;

            if (part.boost) {
              switch (part.boost) {
                case "XUH2O": // T3 boost for ATTACK
                case "XKHO2": // T3 boost for RANGED_ATTACK
                case "XLHO2": // T3 boost for HEAL
                  boostMultiplier = 4;
                  break;
                case "UH2O": // T2 boost for ATTACK
                case "KHO2": // T2 boost for RANGED_ATTACK
                case "LHO2": // T2 boost for HEAL
                  boostMultiplier = 3;
                  break;
                case "UH": // T1 boost for ATTACK
                case "KO": // T1 boost for RANGED_ATTACK
                case "LO": // T1 boost for HEAL
                  boostMultiplier = 2;
                  break;
                case "XGHO2": // T3 boost for TOUGH
                  toughMultiplier = 24;
                  break;
                case "GHO2": // T2 boost for TOUGH
                  toughMultiplier = 11;
                  break;
                case "GO": // T1 boost for TOUGH
                  toughMultiplier = 5; //4.2 ish
                  break;
              }
            }

            if (part.type == ATTACK) {
              attackParts += boostMultiplier;
            } else if (part.type == RANGED_ATTACK) {
              rangedAttackParts += boostMultiplier;
            } else if (part.type == HEAL) {
              healParts += boostMultiplier;
            } else if (part.type == TOUGH) {
              // Boosted TOUGH absorbs OUR damage - like enemy healing, it
              // raises how much RANGED_ATTACK we need. It was being added to
              // rangedAttackParts, i.e. counted as enemy OFFENSE, which
              // inflated our heal requirement instead and blew the defender
              // body past 50 parts.
              healParts += toughMultiplier;
            }
          }
        });

        room.memory.roomData.has_hostile_creeps = true;
        // Freshness stamp: this flag is only ever written WITH vision, so on a
        // blind remote it survives arbitrarily long after the hostiles left.
        // fleeHomeIfInDanger honors it only while recent — the spawning side
        // (rooms.spawning ~:5473) already refuses stale reads the same way.
        room.memory.roomData.hostile_t = Game.time;
        room.memory.roomData.hostile_body_type = {
          attack: attackParts,
          ranged_attack: rangedAttackParts,
          heal: healParts
        };

        room.memory.roomData.has_only_invader = true;
        for (let Hostile of HostileCreeps) {
          if (Hostile.getActiveBodyparts(ATTACK) > 0 || Hostile.getActiveBodyparts(RANGED_ATTACK) > 0) {
            room.memory.roomData.has_only_invader = false;
          }
        }
      } else if (HostileCreeps.length > 0) {
        room.memory.roomData.has_safe_creeps = true;
        room.memory.roomData.has_hostile_creeps = false;
        room.memory.roomData.has_only_invader = false;
      } else {
        Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name);
        room.memory.roomData.has_hostile_creeps = false;
        delete room.memory.roomData.hostile_body_type;
        room.memory.roomData.has_safe_creeps = false;
        room.memory.roomData.has_only_invader = false;
      }

      const attackersInRoom: number = attackersByRoom()[room.name] || 0;
      if (attackersInRoom == 0) {
        room.memory.roomData.has_attacker = false;
      } else {
        room.memory.roomData.has_attacker = true;
      }
    }

    if (Game.rooms[room.name] == undefined) {
      Memory.tasks.wipeRooms.killCreeps = Memory.tasks.wipeRooms.killCreeps.filter(element => element != room.name);
      room.memory.roomData.has_hostile_creeps = false;

      Memory.tasks.wipeRooms.destroyStructures = Memory.tasks.wipeRooms.destroyStructures.filter(
        element => element != room.name
      );
      room.memory.has_hostile_structures = false;
    }
  }
}

function identifySources(room) {
  if (!room.memory.resources) {
    room.memory.resources = {};
  }

  if (!room.memory.resources[room.name]) {
    let sources = room.find(FIND_SOURCES);

    _.forEach(sources, function (source) {
      let data = _.get(room.memory, ["resources", room.name, "energy", source.id]);
      if (data === undefined) {
        _.set(room.memory, ["resources", room.name, "energy", source.id], {});
      }
    });
  }
  remotes(room);
}

export default rooms;
// module.exports = rooms;
