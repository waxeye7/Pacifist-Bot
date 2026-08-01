declare global {
    /*
      Example types, expand on these or remove them and add your own.
      Note: Values, properties defined here do no fully *exist* by this type definiton alone.
            You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

      Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
      Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
    */
    interface Object {
        status:any;
        targetRoom:any;
        boosted:boolean;
    }
    interface Memory {
      CPU: any;
      /** false = silent console (default). true = full spam. Console: setVerbose(true) */
      verbose?: boolean;
      /** A/B bench: setProfile / reportCpu / benchAuto — see utils/Bench.ts */
      bench?: any;
      /** Feature flags — see utils/Features.ts */
      features?: {
        disablePower?: boolean;
        speedrun?: boolean;
        dynamicLayout?: boolean;
        placeFromPlan?: boolean;
        minCutWalls?: boolean;
        squareWalls?: boolean;
        /** Hauler pickup target lock + reservation ledger (default ON) */
        pickupLock?: boolean;
        [key: string]: any;
      };
      /** Cheap counters. pickupSwitches/pickupTicks — see Functions/creepFunctions.ts */
      stats?: {
        pickupSwitches?: number;
        pickupTicks?: number;
        [key: string]: any;
      };
      /** Draw base plan overlay each tick */
      showPlan?: boolean;
      /** Planner replay cursor — see utils/PlanAnimator.ts (frames live in segments 89..99) */
      planAnim?: {
        room: string;
        step: number;
        speed: number;
        active: boolean;
        phase: "index" | "data" | "play";
        segments?: number[];
        held?: number;
        acc?: number;
        loop?: boolean;
        loops?: number;
      };
      /** Pending plan adoption — see utils/PlanV2.ts (plan lives in segment 88) */
      planV2Adopt?: { room: string; since: number };
      /** Tick-based RCL speedrun scoreboard — see utils/Speedrun.ts */
      speedrun?: {
        startTick: number;
        rclTimes: { [level: number]: number };
        lastRcl: number;
        roomName?: string;
      };
      AvoidRooms: any;
      AvoidRoomsTemp: { [key: string]: number };
      /** console: Memory.debugReserver = true — traces remote reserver gating */
      debugReserver?: boolean;
      billtong_rooms: any;
      CanClaimRemote: number;
      DistressSignals: any;
      tasks: any;
      uuid: number;
      log: any;
      targetRampRoom: any;
      // my_goods:Array<Array<string & string>>;
      my_goods: any;
      target_colonise: any;
      resource_requests: any;
      keepAfloat: any;
      commandsToExecute: any;
      delayConvoy: object;
      Operations: { clear_claimed_rooms: {} };
      e: { mosquito: Array<{ n: string; ts: number; cp?: RoomPosition | null }> };
      terrainDataInitialized: boolean;
      lastProcessedCoord: { x: number; y: number; };
      roomStatuses: any;
    }

    // console helpers (see utils/Commands.ts, Logger, CpuPolicy)
    // setVerbose / cpuStatus / cpuPolicy attached on global
    // eslint-disable-next-line no-var
    var setVerbose: (on?: boolean) => string;
    // eslint-disable-next-line no-var
    var cpuStatus: () => string;
    // eslint-disable-next-line no-var
    var cpuPolicy: () => any;
    // eslint-disable-next-line no-var
    var _cpuPolicy: any;

    interface billtong_rooms {
        billtong_rooms:Array<string>;
    }

    interface RawMemory {
        _parsed:any;
    }

    interface AvoidRooms {
        RoomsToAvoid:Array<string>;
    }
    interface CPU {
        lastCPU:number;
    }
    interface DistressSignals {
        reinforce_me?:string;
    }

    interface RoomMemory {
        safeGuard:number;
        spawn_list: Array<Array<string> | string | object>;
        /** Local speedrun markers (active, rcl) — see utils/Speedrun.ts */
        speedrun?: { active?: boolean; rcl?: number; [key: string]: any };
        /** Dynamic layout cache — see utils/BasePlan.ts */
        basePlan?: any;
        /** Adopted v2 plan (packed coords) — see utils/PlanV2.ts */
        planV2?: { v: number; h?: string; s?: number; t: { [structureType: string]: number[] } };
        construction?: { rampartLocations?: any; [key: string]: any };
        /**
         * Structures with NO walkable D8 approach — see utils/Reachability.
         * t = tick computed, n = structure count when computed (change
         * detector), ids = dead structure ids, p = their packed tiles.
         */
        unreach?: { t: number; n: number; ids: string[]; p: number[] };
        /** id -> expiry tick. Targets creeps demonstrably failed to deliver to. */
        badFill?: { [id: string]: number };
        /** tick of the last at-cap off-plan reclaim pass — see utils/PlanV2. */
        planCapReclaim?: number;
        defence?: { towerShotsInRow?: number; perimeter?: any; [key: string]: any };
        roomData:any;
        has_hostile_structures: boolean;
        has_hostile_creeps: boolean;
        has_safe_creeps: boolean;
        has_attacker: boolean;
        danger: boolean;
        name: string;
        towers: Array<string>;
        spawn: string;
        container: string;
        storage: string;
        keepTheseRoads: any;
        rampartToMan: any;
        danger_timer: number;
        first_offence: number;
        bin: any;
        in_position: boolean;
        labs: any;
        attack_target: any;
        request_unboost: boolean;
        AvoidRooms: Array<string>;
        Energy_Spent_First: Array<string>;
        spawning_squad: object;
        factory:any;
        NukeRepair:boolean;
        Structures:any;
        resources:any;
        controllerLink:any;
        observe:any;
    }
    interface CreepMemory {
        exposedStructures:any;
        backupTR:any;
        myRampartToMan:any;
        repairing: boolean;
        name: string;
        role: string;
        room: object;
        target: any;
        working: boolean;
        building: boolean;
        upgrading: boolean;
        full: boolean;
        claim: boolean;
        locked: any;
        homeRoom: string;
        targetRoom: string;
        suicide: boolean;
        storage: any;
        source: any;
        sourceId:any;
        myLink: any;
        deposit: any;
        MaxStorage: number;
        searchedRooms: Array<string>;
        controllerLink:any;
        go:boolean;
        direction:number | false;
        moving:boolean;
        path:any;
        boostlabs:Array<any>;
        line:number;
        /**
         * Locked energy-pickup target (drop / ruin / tombstone / container).
         * id = object id, t = tick locked, amt = energy claimed in the ledger,
         * q = 1 when queued behind other haulers (claims nothing).
         */
        pickup?: { id: string; t: number; amt: number; q?: number };
        /** recent packed positions, newest last — oscillation damper */
        _ph?: number[];
        /** room name the _ph history belongs to */
        _phr?: string;
        /** tick the damper last fired, so it does not fire every tick */
        _oscT?: number;
    }

    // Syntax for adding proprties to `global` (ex "global.log")
    namespace NodeJS {
        interface Global {
          showBoosts: any;
          spawnConvoy: any;
          spawnSafeModer: any;
          profiler: any;
          Memory: any;
          ROLES: any;
          SS: any;
          SQR: any;
          SRDP: any;
          SQM: any;
          SQD: any;
          SRD: any;
          SC: any;
          SD: any;
          SDB: any;
          SG: any;
          SGB: any;
          SCK: any;
          SGD: any;
          SPK: any;
          SDM: any;
          SCCK: any;
          SCCK2: any;
          SMDP: any;
          spawn_hunting_party: any;
          lock_room: any;
          spawn_mosquito: any;
          buildRemoteRoads: any;
        }
    }
}

export default global;
