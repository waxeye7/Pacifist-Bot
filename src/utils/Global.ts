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
        CPU:any;
        AvoidRooms: any;
        billtong_rooms: any;
        CanClaimRemote:number;
        DistressSignals:any;
        tasks: any;
        uuid: number;
        log: any;
        targetRampRoom:string | false;
        // my_goods:Array<Array<string & string>>;
        my_goods:any;
        target_colonise:any;
        resource_requests:any;
    }

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
        spawn_list: Array<Array<string> | string | object>;
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
        // labs: Array<Id<_HasId>>;
        AvoidRooms: Array<string>;
        Energy_Spent_First: Array<string>;
        spawning_squad: object;
        factory:any;
        NukeRepair:boolean;
        Structures:any;
        resources:any;
        controllerLink:any;
    }
    interface CreepMemory {
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
    }

    // Syntax for adding proprties to `global` (ex "global.log")
    namespace NodeJS {
        interface Global {
            Memory:any;
            ROLES: any;
            SQR: any;
            SQM: any;
            SQD: any;
            SRD:any;
            SC:any;
            SD:any;
            SDB:any;
            SG:any;
            SCK:any;
            SGD:any;
            SPK:any;
            SDM:any;
        }
    }
}

export default global;
