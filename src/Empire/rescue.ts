/**
 * The empire's spawn-rescue JOB: computed once per tick, before rooms run.
 *
 * Decides which spawnless room of ours gets rebuilt next, pins it, re-aims and
 * retasks builders towards it, and names the mother room that should hatch
 * more. Rooms read the result (rescueJob() in Empire/empire.ts) and only ever
 * touch their own queue.
 *
 * This is the same algorithm that ran from inside spawning(room) — see the
 * helpers in ./rescueLib — with the per-room O(rooms) donor loop hoisted to run
 * once. See docs/EMPIRE-LAYER.md.
 */
import { logAlways } from "utils/Logger";
import { invalidateCensus } from "./census";
import { colonyNeedIsRescue } from "Rooms/spawnSafety";
import {
    pickSpawnRescue,
    pinSpawnRescue,
    revertSpawnEmergency,
    reaimStrandedBuilders,
    retaskBuildersToSpawnless,
    finishableSpawnSiteRoom,
    finishableSpawnSiteRooms,
    colonyBuilderCap,
    colonyBuildersOn,
    pickRescueMother,
} from "./rescueLib";

export interface RescueJob {
    /** the room that needs ContainerBuilders */
    need: string;
    /** true when `need` is visible and has NO spawn (real rescue); false for a colony site under cap */
    rescue: boolean;
    /** the room that should hatch builders for it this tick, or null when nobody qualifies */
    mother: string | null;
    cap: number;
    builders: number;
}

export function computeRescueJob(): RescueJob | null {
    const M: any = Memory as any;
    const pinned = M.spawnRescue;
    if (typeof pinned === "string") {
        const pr = Game.rooms[pinned];
        if (pr && pr.find(FIND_MY_SPAWNS).length) {
            delete M.spawnRescue;
            logAlways("spawn rescue " + pinned + " complete — picking next");
        }
    }
    // ONE walk over Game.rooms + Memory.rooms per tick; the helpers used to
    // each re-walk it (revert, pick, pick-again, finishable = four walks).
    let hits = finishableSpawnSiteRooms();
    const hadFlags = !!(M.spawnRescue || M._spawnEmergency);
    let changed = revertSpawnEmergency(hits);
    // A revert clears target_colonise, and roomLooksSpawnlessOwned excludes the
    // target_colonise room when it has no vision — so the candidate list can be
    // different right after a revert. The old per-room driver re-walked here;
    // do the same on the (rare) tick a revert actually happened, or a no-vision
    // pinned room would toggle the emergency on and off every other tick.
    if (hadFlags && !M.spawnRescue && !M._spawnEmergency) hits = finishableSpawnSiteRooms();
    const pinnedNeed = pickSpawnRescue(hits);
    if (pinnedNeed) {
        pinSpawnRescue(pinnedNeed);
        changed += reaimStrandedBuilders(pinnedNeed);
    }
    // finishableSpawnSiteRoom returns the pinned rescue first, else the nearest
    // colony site that is under its builder cap.
    const need = pinnedNeed || finishableSpawnSiteRoom(undefined, hits);
    if (!need) {
        if (changed) invalidateCensus();
        return null;
    }
    changed += retaskBuildersToSpawnless(need, hits);
    // Roles changed mid-tick: the census the rooms are about to read must not
    // still say those creeps are builders/upgraders. Recount only when needed.
    if (changed) invalidateCensus();
    const vis = Game.rooms[need];
    const rescue = !!(vis && vis.find(FIND_MY_SPAWNS).length === 0);
    return {
        need,
        rescue,
        mother: pickRescueMother(need, rescue),
        cap: colonyBuilderCap(need),
        builders: colonyBuildersOn(need),
    };
}
