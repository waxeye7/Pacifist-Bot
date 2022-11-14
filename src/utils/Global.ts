declare global {
    /*
      Example types, expand on these or remove them and add your own.
      Note: Values, properties defined here do no fully *exist* by this type definiton alone.
            You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

      Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
      Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
    */
    interface Memory {
        CPU:any;
        AvoidRooms: any;
        billtong_rooms: any;
        CanClaimRemote:boolean;
        DistressSignals:any;
        tasks: any;
        uuid: number;
        log: any;
    }

    interface billtong_rooms {
        billtong_rooms:Array<string>;
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
        spawn_list: Array<Array<string> | string | object>;
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
        keepTheseRoads: Array<Id<_HasId>>;
        rampartToMan: Id<_HasId>;
        danger_timer: number;
        first_offence: number;
        bin: Id<_HasId>;
        in_position: boolean;
        labs: any;
        attack_target: any;
        request_unboost: boolean;
        // labs: Array<Id<_HasId>>;
        AvoidRooms: Array<string>;
        Energy_Spent_First: Array<string>;
        spawning_squad: object;
    }
    interface CreepMemory {
        name: string;
        role: string;
        room: object;
        working: boolean;
        building: boolean;
        upgrading: boolean;
        full: boolean;
        claim: boolean;
        locked: string | boolean;
        homeRoom: string;
        targetRoom: string;
        suicide: boolean;
        storage: Id<_HasId>;
        source: Id<_HasId>;
        myLink: Id<_HasId>;
        deposit: Id<_HasId>;
        MaxStorage: number;
        searchedRooms: Array<string>;
    }

    // Syntax for adding proprties to `global` (ex "global.log")
    namespace NodeJS {
        interface Global {
            ROLES: any;
        }
    }
}

export default global;
