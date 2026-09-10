import { remoteIsHot, remoteRecalled } from "Rooms/rooms.remotes";
import { isSanctionedRampart } from "utils/PlanV2";
import { rampartIsBuried } from "utils/Interior";
import { findLiveSeat, unpackXY } from "utils/minerSeat";
import { cachedDerived, cachedDropped, cachedMyCreeps, cachedMyStructures, cachedSites, cachedStructures } from "utils/RoomCache";

/**
 * Stable 0..mod-1 offset from a creep name.
 *
 * Any `Game.time % N` throttle fires for the WHOLE roster on the same tick,
 * which turns a saving into a periodic spike. Hashing the name spreads the
 * re-scans evenly across the N ticks instead. Recomputed rather than cached:
 * a name is ~20 chars, and a heap map keyed by creep name would grow without
 * bound over a long global.
 */
function nameOffset(name: string, mod: number): number {
    let h = 0;
    for(let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return h % mod;
}

/**
 * The room's controller LINK, or null — memoised per room per tick.
 *
 * Both callers below (forwardToControllerLink, and the deposit rung in run())
 * resolved this the same way and both had the same hole: when the room has NO
 * link within 3 of the controller the derivation writes nothing back, so
 * `Game.getObjectById(S.controllerLink)` kept answering null and the room-wide
 * FIND_MY_STRUCTURES re-ran EVERY tick, PER MINER, for as long as the room
 * stayed at RCL5/6 without a controller link. Same story below RCL7 where
 * creepFunctions parks a CONTAINER under the key.
 *
 * A per-tick memo is sound because structures cannot appear or move mid-tick;
 * the object's `store` is still read live by the callers. Keyed on the CURRENT
 * value of Structures.controllerLink, exactly as creepFunctions'
 * _discoverControllerDepot is, so a mid-tick rewrite of the key still forces
 * the rescan it always forced — an unset key is "0" for every caller, which is
 * precisely the room where the sharing matters.
 */
function resolveControllerLink(room: any): any {
    const S: any = room.memory.Structures || {};
    return cachedDerived(room, "emCtrlLink:" + (S.controllerLink || "0"), () => {
        let link: any = Game.getObjectById(S.controllerLink);
        if(!link || link.structureType !== STRUCTURE_LINK) {
            link = null;
            if(room.controller) {
                const ctrlLinks = _.filter(cachedMyStructures(room), (s: any) =>
                    s.structureType == STRUCTURE_LINK &&
                    s.id !== S.StorageLink &&
                    s.pos.getRangeTo(room.controller) <= 3);
                if(ctrlLinks.length) {
                    link = room.controller.pos.findClosestByRange(ctrlLinks);
                    S.controllerLink = link.id;
                }
            }
        }
        return link;
    });
}

/**
 * A little description of this function
 * @param {Creep} creep
 **/


/**
 * Same predicate as sourceLinkHaulWorks() in rooms.spawning.ts: a link
 * within 2 of THIS source and a hub within 2 of storage. "3+ links exist"
 * is the wrong bar — a 1-source RCL6 room maxes at source+hub, carriers
 * already stop, and the miner stayed on drop-mine with nobody hauling.
 *
 * Cached per source for 50 ticks. Spawn cuts carriers the tick both
 * ends exist; a 500-tick stale `false` left drop-mining with no haulers
 * at the RCL6 hub cutover.
 */
function linkNetworkDelivers(room, sourceId?):boolean {
    if(!room.storage) return false;
    const srcKey = sourceId || "*";
    if(!room.memory.linkHaulBySource) room.memory.linkHaulBySource = {};
    const rec = room.memory.linkHaulBySource[srcKey];
    if(rec && Game.time - (rec.t || 0) < 50) {
        return rec.v;
    }
    const links = _.filter(cachedMyStructures(room), (s: any) => s.structureType == STRUCTURE_LINK);
    const hub = _.some(links, (l:any) => l.pos.inRangeTo(room.storage.pos, 2));
    let works = false;
    if(hub) {
        const source:any = sourceId ? Game.getObjectById(sourceId) : null;
        works = source
            ? _.some(links, (l:any) => l.pos.inRangeTo(source.pos, 2))
            : links.length >= 2;
    }
    room.memory.linkHaulBySource[srcKey] = {v: works, t: Game.time};
    return works;
}

/**
 * Is this room actually running its controller depot?
 *
 * An upgrader is the only role that meaningfully DRAINS the controller link
 * (repair.ts drinks from it opportunistically when it already happens to be
 * standing next to it, and has the whole bank as an alternative). A
 * ControllerLinkFiller counts too, in the other direction: that creep exists
 * for no other purpose than to feed the link, so while one is alive the room
 * has decided upgrading is on and nothing here should fight it.
 *
 * Every producer AND the drain-back path key off this same answer, so they can
 * never end up pushing energy past each other. Cached on the Room object,
 * which the engine rebuilds every tick.
 */
export function roomFeedsController(room:any):boolean {
    if(room._pacFeedsCtrl !== undefined) return room._pacFeedsCtrl;
    const has = _.some(cachedMyCreeps(room), (c:any) => c.memory &&
        (c.memory.role === "upgrader" || c.memory.role === "ControllerLinkFiller"));
    room._pacFeedsCtrl = has;
    return has;
}

/**
 * ---------------------------------------------------------------------------
 * BANK A MINIMUM RESERVE BEFORE FEEDING THE CONTROLLER.
 *
 * The link routing below tries the CONTROLLER link first and only offers what
 * is left to the hub/storage link. With surplus that is right — upgrading is
 * what a healthy room should spend on. With no surplus it is a trap, because
 * there is never anything left: a single-source room earns ~10 energy/tick, the
 * source link reaches the 400 the controller rung wants every ~40 ticks, sends
 * it, and the storage rung (which needs 400 STILL in the source link after the
 * controller has been served) never fires at all.
 *
 * VPS W2N1 and W1N2 are both one-source RCL7 rooms and both sat at storage 0
 * indefinitely while their controller links visibly cycled 0 -> 450 -> 0. A
 * room in that state has no reserve to repair its ramparts, refill a tower
 * under attack, or finish the ten extensions it is still missing — and no route
 * to acquiring one, because every unit of income is spoken for before it gets
 * to the bank.
 *
 * So: while the bank is under RESERVE, the controller rung stands down and the
 * energy goes to storage instead. This does not stop the room upgrading — the
 * upgrader draws from storage perfectly well, it just walks instead of standing
 * at the controller link — it only stops the room upgrading INSTEAD OF eating.
 * Once the reserve exists, priority returns to the controller exactly as before.
 *
 * Rooms with no storage are unaffected (there is no bank to protect), and a
 * controller genuinely close to downgrading always wins, because losing an RCL
 * costs far more than the reserve is worth.
 * ---------------------------------------------------------------------------
 */
const CONTROLLER_FEED_RESERVE = 2000;
/** Downgrade timer under which the controller outranks the reserve. */
const DOWNGRADE_URGENT = 15000;

export function bankBelowReserve(room:any):boolean {
    if(room._pacBankLow !== undefined) return room._pacBankLow;
    const store = room.storage && room.storage.my ? room.storage : null;
    // No storage means nothing to protect and no hub link worth routing to.
    let low: boolean;
    if(!store) {
        low = false;
    } else {
        const ctrl = room.controller;
        if(ctrl && ctrl.my && (ctrl.ticksToDowngrade || Infinity) < DOWNGRADE_URGENT) {
            low = false;
        } else {
            const bank = (store.store[RESOURCE_ENERGY] || 0)
                + (room.terminal && room.terminal.my ? (room.terminal.store[RESOURCE_ENERGY] || 0) : 0);
            low = bank < CONTROLLER_FEED_RESERVE;
        }
    }
    // Cached on the Room object (the engine rebuilds it every tick) and shared
    // with creepFunctions' `_bankBelowReserve` by slot name, for the same reason
    // roomFeedsController shares `_pacFeedsCtrl`: the two must agree, and a
    // shared slot makes that true by construction rather than by discipline.
    room._pacBankLow = low;
    return low;
}

/**
 * ---------------------------------------------------------------------------
 * THE HUB LINK IS A SINGLE POINT OF FAILURE, AND IT HAS NO RELIEF VALVE.
 *
 * Exactly one creep in a room ever takes energy OUT of the hub link: the
 * EnergyManager. Nothing else withdraws from it, and no structure action can
 * move energy from a link into a storage. So while that one creep is missing,
 * dead, busy or wedged, the hub link fills and stays full — and a full hub
 * link is not a local problem. Every source link in the room routes to it, a
 * link that cannot send holds 800, and a source link holding 800 leaves its
 * miner dumping on the floor at 10 energy a tick.
 *
 * Live E37N59 2026-09-10 measured the whole chain: ONE EnergyManager wedged on
 * a stale path head for 364 ticks (see creepFunctions stepCachedPath), hub
 * link pinned at 787/800, both source links pinned at 800, 1,797 energy rotting
 * on the two source tiles, storage falling to 1,253 — under the reserve, so the
 * controller rung correctly stood down — and the upgrader idling at an empty
 * controller link. Seven symptoms, one creep.
 *
 * The controller link is a sink the room can reach WITHOUT a creep, because
 * link-to-link is a structure action. So when the hub is provably stuck, push
 * it there instead and let the upgrader drink it. That does not bank the
 * energy, but it un-jams every source link in the room, which is the part that
 * costs 10 e/t per source for as long as it lasts.
 *
 * DELIBERATELY NOT GATED ON bankBelowReserve. That rule says "bank before you
 * upgrade", and it is right — but it presumes banking is POSSIBLE, and a stuck
 * hub link is precisely the state in which it is not: the EnergyManager is the
 * only route from a link to the storage, and it is the thing that has stopped.
 * Holding the energy in the link to protect a bank that has no inflow is how
 * E37N59 lost 5,000 energy while reporting itself healthy.
 *
 * "PROVABLY STUCK" IS A MEASURED BAR, NOT A GUESS. Sampled live across all
 * seven owned rooms, 175 room-ticks: the hub link NEVER read 600 or more (max
 * 526), and a landing 800 visibly falls in 200-300 steps as the EnergyManager
 * carries it to the storage one load at a time. Ten consecutive ticks at or
 * above 600 cannot happen while anything is draining it, and is still 36x
 * faster than the outage above.
 * ---------------------------------------------------------------------------
 */
/** Hub-link energy above which "nothing drained it" is worth counting. */
const HUB_BACKED_UP = 600;
/** ...for this many CONSECUTIVE ticks before we call it stuck. */
const HUB_STUCK_TICKS = 10;

/**
 * Consecutive-tick counter for a hub link nothing is emptying.
 * MUST be called exactly once per room per tick, before any early return that
 * could skip it — a counter that only advances on some ticks measures nothing.
 */
function hubLinkStuck(room:any, hub:any):boolean {
    const M:any = room.memory;
    if(!hub || (hub.store[RESOURCE_ENERGY] || 0) < HUB_BACKED_UP) {
        if(M._hubStuck) delete M._hubStuck;
        return false;
    }
    M._hubStuck = (M._hubStuck || 0) + 1;
    if(M._hubStuck === HUB_STUCK_TICKS || M._hubStuck % 100 === 0) {
        console.log("ALERT", room.name, "hub link stuck at", hub.store[RESOURCE_ENERGY],
            "for", M._hubStuck, "ticks - nothing is draining it (EnergyManager?)");
    }
    return M._hubStuck >= HUB_STUCK_TICKS;
}

/**
 * Push a loaded link into the controller link.
 *
 * This exists as a separate pass because link forwarding is a STRUCTURE action,
 * not a creep action, and the in-room miner's main body is full of early
 * `return`s — feeding an adjacent extension (energyMiner.ts:218), repairing its
 * rampart (:267, :275) — that sit BEFORE the link-routing block. Every one of
 * them is reachable in the exact state where routing matters most.
 *
 * Live W2N1 (RCL6): the source link at (16,16) was pinned at 800, the
 * controller link at (9,9) at 0, and the controller made no progress. The miner
 * could not unload into its already-full source link, so it fell into the
 * `getFreeCapacity() < potential` branch and returned into a starving extension
 * every single tick — so the very code that would have drained the source link
 * never ran. That is the deadlock this file's own header comment describes,
 * reached through the extension rung instead of a missing hub link.
 *
 * It also repairs `Structures.controllerLink` when that key is pointing at a
 * CONTAINER, which is what creepFunctions writes below RCL7 even in a room that
 * has had a real controller link since RCL5. The room cannot self-heal the key
 * otherwise: the only other writer is a ControllerLinkFiller, and that creep
 * cannot be spawned in a room whose storage is empty.
 *
 * DRIVEN FROM Rooms/rooms.ts, ONCE PER OWNED ROOM PER TICK — deliberately not
 * from a creep. The first attempt hung it off the in-room miner and still did
 * nothing, because by then W2N1 had no in-room miner left at all: its only
 * surviving EnergyMiners were remotes (targetRoom W3N1), and a room starved
 * badly enough to lose its miner is exactly the room that cannot afford to
 * leave 800 energy stranded in a link. Moving energy between links is a
 * structure action and needs no creep to be alive.
 */
export function forwardToControllerLink(room:any):void {
    if(!room.controller || !room.memory.Structures) return;
    const S:any = room.memory.Structures;

    const ctrlLink:any = resolveControllerLink(room);

    // Hoisted above every early return below: hubLinkStuck() is a
    // consecutive-tick counter and only means anything if it runs every tick.
    // `hub === ctrl` happens in rooms whose two keys collided (live VPS W1N2)
    // — sending a link to itself is ERR_INVALID_TARGET, so treat that as no
    // hub rather than logging it every tick.
    // findStorageLink() is a room-wide find plus two sorts. The keyed id
    // resolves for free in every built room; the search behind it is throttled
    // so a room that genuinely has no hub link does not re-run it every tick
    // for the rest of its life (it used to be reached only on the no-upgrader
    // path, which is exactly the RCL5 room most likely to be missing the key).
    let hub:any = Game.getObjectById(S.StorageLink);
    if(!hub && Game.time - (room.memory._hubFindT || 0) > 25) {
        room.memory._hubFindT = Game.time;
        hub = room.findStorageLink();
    }
    if(!hub || hub.structureType !== STRUCTURE_LINK || (ctrlLink && hub.id === ctrlLink.id)) hub = null;
    const stuck = hubLinkStuck(room, hub);

    if(!ctrlLink) return;

    /*
     * THE RELIEF VALVE. See hubLinkStuck() above for why this outranks the
     * reserve rule. First in the function on purpose: while the hub is stuck
     * the source links are ALL pinned, so the donor rung below has nothing to
     * offer the controller anyway, and every tick spent not draining the hub
     * is 10 e/t per source going on the floor.
     */
    if(stuck && hub && roomFeedsController(room) && hub.cooldown === 0) {
        const free = ctrlLink.store.getFreeCapacity(RESOURCE_ENERGY);
        // Not worth burning the hub's cooldown on a dribble.
        if(free >= 100) {
            const send = Math.min(hub.store[RESOURCE_ENERGY], free);
            if(hub.transferEnergy(ctrlLink, send) === OK) return;
        }
    }

    /* ---- the return path -------------------------------------------------
     *
     * This function only ever pushed energy INTO the controller link, and
     * nothing anywhere pushed it back out, so a room with no upgrader filled
     * the link to 800 and left it there. Measured across both live servers,
     * every single owned room: local E1S4 492, E2S1 469, E2S7 656, E2S8 457,
     * E3S3 800, E4S6 529, E4S7 461, E7S2 465 — all eight RCL8 and all eight
     * with zero upgraders (the RCL8 rung deliberately holds off until
     * ticksToDowngrade < 125000), each figure unchanged across ~490 ticks of
     * sampling. Worse on the VPS: W2N1 and W3N1 are RCL6 with storage at ZERO
     * and 800 sitting in a controller link nobody can reach — more than a
     * third of a spawn's capacity, in the two rooms least able to spare it.
     *
     * An upgrader is the only role that meaningfully drains this link, so when
     * there is none, hand the energy back to the hub link where the
     * EnergyManager will bank it, and stop topping the link up in the
     * meantime. The two directions are mutually exclusive by construction —
     * one runs only with an upgrader, the other only without — so they cannot
     * ping-pong.
     */
    if(!roomFeedsController(room)) {
        const held = ctrlLink.store[RESOURCE_ENERGY];
        if(held <= 0 || ctrlLink.cooldown > 0) return;
        // The hub link is the only sink: it is the one link a creep
        // (EnergyManager) empties into the storage every tick. Resolved and
        // self-collision-checked at the top of the function.
        if(!hub) return;
        const hubFree = hub.store.getFreeCapacity(RESOURCE_ENERGY);
        if(hubFree <= 0) return;
        // transferEnergy with no amount is all-or-nothing and ERR_FULL moves nothing.
        const drain = Math.min(held, hubFree);
        if(drain > 0) ctrlLink.transferEnergy(hub, drain);
        return;
    }

    // Same reserve rule the miner's own routing uses (see bankBelowReserve).
    // This MUST agree with it: both passes draw from the same source links, so
    // gating only one would have this pass refill the controller link while the
    // miner's rung stood down trying to bank — the two pushing energy past each
    // other, which is precisely what roomFeedsController's header forbids.
    // Not a drain-back, only a stand-down: the upgrader empties what is already
    // there and then draws from storage, which by then has something in it.
    if(bankBelowReserve(room)) return;

    // Same bar as the original rung: top it up while it is at or below half.
    if(ctrlLink.store[RESOURCE_ENERGY] > 400) return;

    // Source links only — the storage link keeps its own job, exactly as before.
    const donors = _.filter(cachedMyStructures(room), (s:any) =>
        s.structureType == STRUCTURE_LINK &&
        s.id !== ctrlLink.id &&
        s.id !== S.StorageLink &&
        s.cooldown == 0 &&
        s.store[RESOURCE_ENERGY] >= 400);
    if(!donors.length) return;
    donors.sort((a:any, b:any) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);
    const topUp = Math.min(donors[0].store[RESOURCE_ENERGY], ctrlLink.store.getFreeCapacity(RESOURCE_ENERGY));
    if(topUp > 0) donors[0].transferEnergy(ctrlLink, topUp);
}

/**
 * Spawn / extension / tower / container in range 1 with room for energy.
 *
 * `pos.findInRange(FIND_*, ...)` is a full room-wide find under the hood, and
 * this runs on every dump — i.e. roughly every third tick for every CARRY
 * miner. Walk the per-tick shared structure lists instead and test the cheap
 * structureType first; the iteration order is the same find order, so the
 * "first match wins" tie-break is unchanged.
 */
/**
 * Seat discipline for a link-fed home miner: ONE tile, adjacent to the source
 * AND the source link, chosen once (utils/minerSeat — container tile first,
 * road last) and held for life. Kills the W3N1 shuffle: harvestEnergy used to
 * park the creep on the road, the fullish branch then walked it to the link
 * and the next harvest walked it back, two intents per cycle forever.
 *
 * Returns "seated" (stand still, everything is in range), "moving" (this tick
 * is a step toward the seat — no other mover may fire), or "none" (no link,
 * no reachable dual-adjacent tile, or the seat belongs to a sibling miner:
 * legacy behaviour applies).
 */
function ensureMinerSeat(creep: any): "seated" | "moving" | "none" {
    if (creep.memory.homeRoom !== creep.memory.targetRoom) return "none";
    const linkId = creep.memory.sourceLink;
    if (!linkId || linkId === true) return "none";
    const link: any = Game.getObjectById(linkId);
    const source: any = Game.getObjectById(creep.memory.sourceId);
    if (!link || !source || link.structureType !== STRUCTURE_LINK) return "none";
    if (creep.memory.seatFor !== linkId) {
        const p = findLiveSeat(creep.room, source.pos, link.pos);
        creep.memory.seatFor = linkId;
        creep.memory.seatP = p === null ? false : p;
    }
    if (creep.memory.seatP === false || creep.memory.seatP === undefined) {
        // A yield is not for life: clearing only seatP leaves seatFor === linkId,
        // so the recompute above never fires and the survivor stays on legacy
        // pathing for its whole 1500 ticks after the sibling dies. Retry on a
        // slow timer — findLiveSeat is a handful of lookForAt.
        if (creep.memory.seatYieldT && Game.time - creep.memory.seatYieldT > 50) {
            creep.memory.seatFor = null;
            delete creep.memory.seatYieldT;
        }
        return "none";
    }
    const seat = unpackXY(creep.memory.seatP);
    if (creep.pos.x === seat.x && creep.pos.y === seat.y) return "seated";
    const occupants = creep.room.lookForAt(LOOK_CREEPS, seat.x, seat.y);
    if (occupants.length && occupants[0].name !== creep.name) {
        const o: any = occupants[0];
        if (o.my && o.memory && o.memory.role === "EnergyMiner") {
            // a sibling holds the seat — legacy behaviour, retried in 50 ticks
            creep.memory.seatP = false;
            creep.memory.seatYieldT = Game.time;
            return "none";
        }
        // transient blocker (hauler loading the container): step in anyway,
        // the traffic swap shifts it
    }
    creep.MoveCostMatrixRoadPrio(new RoomPosition(seat.x, seat.y, creep.room.name), 0);
    return "moving";
}

function adjacentEnergySink(creep: any): any {
    const pos = creep.pos;
    for(const s of cachedMyStructures(creep.room) as any[]) {
        if((s.structureType == STRUCTURE_SPAWN ||
            s.structureType == STRUCTURE_EXTENSION ||
            s.structureType == STRUCTURE_TOWER) &&
           pos.inRangeTo(s, 1) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return s;
    }
    for(const s of cachedStructures(creep.room) as any[]) {
        if(s.structureType == STRUCTURE_CONTAINER &&
           pos.inRangeTo(s, 1) && (s as any).store.getFreeCapacity(RESOURCE_ENERGY) > 0) return s;
    }
    return null;
}

function transferAdjacentSink(creep: any): boolean {
    const sink = adjacentEnergySink(creep);
    if(!sink) return false;
    return creep.transfer(sink, RESOURCE_ENERGY) == 0;
}

/**
 * Does this room have anything that will pick a dropped pile up? Whole-empire
 * `Game.creeps` scan, so memoised per room per tick — every dumping miner in
 * the room asks the identical question and the answer cannot move mid-tick.
 */
function roomHasHauler(room: any): boolean {
    return cachedDerived(room, "emHasHauler", () => _.some(Game.creeps, (c: any) =>
        (c.memory.role == 'carry' || c.memory.role == 'FakeFiller' || c.memory.role == 'sweeper') &&
        (c.memory.homeRoom == room.name || c.room.name == room.name) &&
        !c.spawning));
}

/**
 * Empty a full CARRY miner. Adjacent sink first (harvest-to-spawn when the
 * source sits on the hub). If no hauler exists yet and the spawn is within 8,
 * walk the load in. Otherwise drop for the hauler — do not sit ERR_FULL.
 */
/**
 * ---------------------------------------------------------------------------
 * RECLAIM WHAT SPILLED AT THE SOURCE.
 *
 * A seated miner is the only creep that ever stands at a source in a link
 * room: the spawn ladder stops buying carriers for a source the moment
 * linkHaulBySource says its link reaches the hub, and the filler's salvage
 * leash is HUB_LOOT_RANGE (3) whenever the hub can supply it — deliberately,
 * so a filler cannot lock onto a source pile and walk the base for it. The
 * sweeper would collect it, but the sweeper is on the optional roster and the
 * CPU duty cycle keeps that shut for long stretches.
 *
 * So nothing collects a source spill. It decays at amount/1000 per tick until
 * it is gone.
 *
 * Anything that stalls the link for a while produces one. Live E37N59
 * 2026-09-10: one wedged EnergyManager backed the hub link up for 364 ticks,
 * which pinned both source links at 800, which left both miners dumping on the
 * floor. When the wedge cleared, the links resumed but the damage stayed —
 * 3,237 energy rotting on two tiles and 2,000 stranded in each source
 * container, which had filled during the stall and which nothing drains
 * either. The room reads healthy and quietly burns its own income.
 *
 * The miner is already standing on both of them and its link has throughput to
 * spare: a source makes 10 e/t and a link moves up to 800 per cooldown. So the
 * miner reclaims, newest problem first — the pile decays, the container does
 * not.
 *
 * Costs one transfer-class intent, which is the same intent the transfer to
 * the link would have used, and only ever runs when the link can immediately
 * take the whole load back off us next tick. That bound is what stops the
 * reclaim from becoming a pickup/drop cycle when the link is the bottleneck.
 * `harvest` is a different intent class, so the miner still mines this tick.
 * ---------------------------------------------------------------------------
 */
/** Free carry below which reclaiming is not worth the transfer-class intent. */
const RECLAIM_MIN = 50;

function reclaimSpill(creep: any, link: any): boolean {
    const free = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    // Worth an intent only for a real load. A nearly-full miner reclaiming its
    // last few units is how the first cut of this recovered 9 energy per cycle.
    if(free < RECLAIM_MIN) return false;
    // Only pull back what the link can accept next tick, or we are just moving
    // the backlog into a creep that has to put it down again.
    if(!link || link.store.getFreeCapacity(RESOURCE_ENERGY) < free) return false;

    // The spill is normally on the seat itself; range 1 covers the tick the
    // miner dumped before it was seated.
    //
    // A `pos.findInRange` over any FIND_* constant is a room-wide find under
    // the hood, and this runs on EVERY harvest tick of EVERY miner - the exact
    // pattern adjacentEnergySink()'s header calls the most expensive thing a
    // seated miner can do. cachedDropped() is the one find the whole tick
    // shares, and on a clean floor (the overwhelmingly common case, and the
    // case this whole function is trying to reach) the scan below is an
    // array-length read. Biggest pile in one pass, no filter closure, no
    // throwaway array and no sort.
    let best: any = null;
    for(const r of cachedDropped(creep.room) as any[]) {
        if(r.resourceType !== RESOURCE_ENERGY) continue;
        if(Math.abs(r.pos.x - creep.pos.x) > 1 || Math.abs(r.pos.y - creep.pos.y) > 1) continue;
        if(!best || r.amount > best.amount) best = r;
    }
    if(best && creep.pickup(best) === OK) return true;

    // Then the container. transferAdjacentSink fills it and never empties it,
    // so in a link room it is write-only once the link takes over.
    //
    // Pinned on the creep, because the seat is held for LIFE (ensureMinerSeat)
    // and a container cannot move: the walk over cachedStructures is a
    // whole-room list - 200+ entries in a built-out room - and once the box is
    // drained the `> 0` test made it a full miss on every tick for the rest of
    // the miner's life. A negative answer is remembered too; both are re-asked
    // on a slow timer so a box built later is still picked up.
    const boxT = creep.memory.reclaimBoxT || 0;
    if(creep.memory.reclaimBox === undefined || Game.time - boxT > 100) {
        const found: any = _.find(cachedStructures(creep.room), (st: any) =>
            st.structureType == STRUCTURE_CONTAINER &&
            st.pos.isNearTo(creep.pos));
        creep.memory.reclaimBox = found ? found.id : false;
        creep.memory.reclaimBoxT = Game.time;
    }
    const box: any = creep.memory.reclaimBox && Game.getObjectById(creep.memory.reclaimBox);
    if(box && box.store[RESOURCE_ENERGY] > 0 && creep.withdraw(box, RESOURCE_ENERGY) === OK) return true;
    return false;
}

function dumpMinerEnergy(creep: any): void {
    if(transferAdjacentSink(creep)) return;

    const room = creep.room;
    const home = !creep.memory.targetRoom || creep.memory.targetRoom == room.name;
    if(home && room.controller && room.controller.level <= 2 &&
        room.energyAvailable < room.energyCapacityAvailable) {
        const hasHauler = roomHasHauler(room);
        if(!hasHauler) {
            const sink = creep.pos.findClosestByRange(_.filter(cachedMyStructures(room), (s: any) =>
                (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION) &&
                s.store.getFreeCapacity(RESOURCE_ENERGY) > 0));
            if(sink && creep.pos.getRangeTo(sink) <= 8) {
                if(creep.pos.isNearTo(sink)) {
                    creep.transfer(sink, RESOURCE_ENERGY);
                }
                else {
                    creep.MoveCostMatrixRoadPrio(sink, 1);
                }
                return;
            }
        }
    }

    creep.drop(RESOURCE_ENERGY);
}

/**
 * KEEP THE SEAT CONTAINER ALIVE. NOTHING ELSE IN AN OWNED ROOM DOES.
 *
 * Roles/repair excludes containers from RCL6 up, the towers hold a decay floor
 * on ramparts and roads and nothing at all on these, and the maintainer — the
 * documented sole cover — sits behind optionalRosterOpen() and a bank gate. So
 * in a room that is not rich, an owned-room container decays 10 hits a tick
 * until it is gone.
 *
 * Gone is expensive twice over. The seat stops existing, so the miner drop-mines
 * onto the floor and the pile decays; and the box has to be rebuilt at 5,000
 * energy with a builder the room also has to buy.
 *
 * Live shard3 2026-09-11, source containers as a fraction of their 250,000:
 * E39N58 4% and 6%, E37N59 8%, and E35N59 had already LOST the one at 38,19 —
 * its miner was standing there dropping energy on the ground, 557 and climbing.
 *
 * The miner is the obvious repairer and was already doing it for REMOTES (see
 * the box-repair rung below, gated on targetRoom != homeRoom). It sits on the
 * box, it has 5 WORK, and repair is 100 hits per WORK: one repair tick every
 * 50 covers 10-a-tick decay for 5 energy. The cost is one harvest tick in 50,
 * about 2% of one source, to stop losing the seat entirely.
 *
 * Cadenced per creep with a name-hash offset for the usual reason — every
 * miner in the empire firing on the same tick trades a saving for a spike.
 */
const SEAT_BOX_REPAIR_BELOW = 0.75;
const SEAT_BOX_EVERY = 25;

function keepSeatBoxAlive(creep: any): boolean {
    // repair() spends the creep's own energy
    if(creep.store[RESOURCE_ENERGY] < 50) return false;
    if((Game.time + nameOffset(creep.name, SEAT_BOX_EVERY)) % SEAT_BOX_EVERY !== 0) return false;
    if(!creep.memory._seatBoxT || Game.time - creep.memory._seatBoxT > 100) {
        creep.memory._seatBoxT = Game.time;
        const boxes = creep.pos.findInRange(
            cachedStructures(creep.room).filter((st: any) => st.structureType === STRUCTURE_CONTAINER), 1);
        creep.memory._seatBox = boxes.length ? boxes[0].id : false;
    }
    const box: any = creep.memory._seatBox && Game.getObjectById(creep.memory._seatBox);
    if(!box || box.hits >= box.hitsMax * SEAT_BOX_REPAIR_BELOW) return false;
    return creep.repair(box) === OK;
}

const run = function (creep) {
    creep.memory.moving = false;
	if(creep.evacuate()) {
		return;
	}
    // timeOut is only a hard abort while still IN the flagged remote.
    // After the exit the helper still returns "timeOut" for 25t with no
    // work move — a miner sat in the corridor / just inside home.
    if(creep.room.name === creep.memory.targetRoom && creep.fleeHomeIfInDanger() == "timeOut") {
        return;
    }

    // Do NOT idle miners on a low bucket. Harvest is the only income; turning
    // it off while CPU is sick is how a room stays sick. Defence/flee above
    // this line still run. Remotes are already gated by CpuPolicy.

    if(creep.holdForFlee()) {
        return;
    }

    /*
     * Before any other work action. repair() and harvest() are both work
     * actions and only one lands per tick, so this has to be the one that
     * takes the tick when it fires — and it fires at most once in 25. See
     * keepSeatBoxAlive: an owned-room source container has no other repairer
     * and three of this empire's were under 10% when this shipped.
     */
    if(keepSeatBoxAlive(creep)) {
        return;
    }
    // if(creep.fleeHomeIfInDanger() == true) {
    //     return;
    // }

    // if(creep.pos.x > 0 && creep.pos.y > 0 && creep.pos.y < 49 && creep.pos.x < 49) {
    //     return;
    // }
    // else {
    //     creep.moveTo(25,25)
    // }

    // A miner with NO CARRY part must take the simple harvest-and-drop path.
    //
    // The link path below is written entirely in terms of
    // `creep.store.getFreeCapacity()`, which is 0 for a body with no CARRY - so
    // both of its gates invert: "am I full, go deliver" (< potential) is true
    // every tick and "may I harvest" (>= potential) is false every tick. The
    // creep walks to the hub link and stands there for its whole life without
    // ever calling harvest once.
    //
    // Miners lose their CARRY parts routinely: the RCL6 550-energy rung queues
    // [WORK x5, MOVE], and every shrink rung sheds CARRY before WORK. On live
    // E11S2 (RCL6, 3 links) that produced 3 "miners" parked on the hub link at
    // (18,39)/(18,41) with an empty container, empty storage and controller
    // progress frozen at 34742 - a room that looked fully staffed and had zero
    // income. Dropping the energy at the source is worth strictly more than
    // standing next to a link that will never be handed anything.
    //
    // Tested with getActiveBodyparts, NOT store.getCapacity(): a creep with no
    // CARRY answers `null` there on this engine, and `null == 0` is false, so a
    // capacity test silently does nothing.
    // Remote gone hot: a static 4W/2M miner cannot fight or outrun anything, so
    // walk it home and recycle the body rather than donate it to the attacker.
    //
    // Remote CLOSED (remoteRecalled) takes the identical exit. manageRemotes
    // stops the haul fleet the moment it flips `active = false`, and until this
    // branch existed nothing told the miner: a CARRY-less [W,W,M,W,W,M] went on
    // dropping 8 e/t onto the floor of a room no carrier would visit again, for
    // up to a full 1500-tick life. Recycling refunds part of the body and frees
    // the seat instead. Deliberately the SAME movement path as the hot case —
    // moveToRoomAvoidEnemyRooms + recycle at home, no second routine.
    if(creep.memory.targetRoom && creep.memory.homeRoom &&
       creep.memory.targetRoom != creep.memory.homeRoom &&
       (remoteIsHot(creep.memory.homeRoom, creep.memory.targetRoom) ||
        remoteRecalled(creep))) {
        if(creep.room.name !== creep.memory.homeRoom) {
            return creep.moveToRoomAvoidEnemyRooms(creep.memory.homeRoom);
        }
        return creep.recycle();
    }

    if(creep.room.controller && creep.room.controller.level < 6 || creep.memory.targetRoom != creep.memory.homeRoom || creep.getActiveBodyparts(CARRY) == 0 || !linkNetworkDelivers(creep.room, creep.memory.sourceId)) {
        // if(creep.roadCheck()) {
        //     creep.moveAwayIfNeedTo();
        // }

        if(creep.room.name === creep.memory.targetRoom && creep.ticksToLive === 700) {
            const storages = creep.room.find(FIND_STRUCTURES, {filter: s => !s.my && s.structureType === STRUCTURE_STORAGE&& s.store[RESOURCE_ENERGY] > 0});
            if(storages.length > 0) {
                global.SG(creep.memory.homeRoom, creep.memory.targetRoom)
            }
            if(!storages.length && creep.room.controller.my) {
                let ruinsWithEnergy = creep.room.find(FIND_RUINS, {filter: r => r.store[RESOURCE_ENERGY] > 0});
                if(ruinsWithEnergy.length > 0) {
                    global.SG(creep.memory.homeRoom, creep.memory.targetRoom)
                }
            }
        }

        if(!creep.memory.checkAmIOnRampart) {
            creep.memory.checkAmIOnRampart = true;
        }

        // A CARRY miner does not drop-mine. Harvest fills the store and then
        // ERR_FULL stops the source. Dump before harvesting when full so the
        // first-100-ticks [W,C,M] (and any later carry miner on this path)
        // keeps the source working.
        //
        // BUT: if the SOURCE BOX is still a construction site within reach,
        // the store goes into the BOX first. A drop-miner room's builders can
        // take days to reach the container (they were on extensions), while
        // the miner sits on 50 energy right next to the site every 5 ticks —
        // it is the cheapest container-builder the room will ever have.
        if(creep.getActiveBodyparts(CARRY) > 0 && creep.store.getFreeCapacity() == 0) {
            if(!creep.memory._boxSiteChecked || Game.time - creep.memory._boxSiteChecked > 50) {
                creep.memory._boxSiteChecked = Game.time;
                const boxSite = creep.pos.findInRange(cachedSites(creep.room), 1)
                    .filter((s: any) => s.structureType === STRUCTURE_CONTAINER)[0];
                creep.memory._boxSite = boxSite ? boxSite.id : false;
            }
            const site: any = creep.memory._boxSite && Game.getObjectById(creep.memory._boxSite);
            if(site) {
                creep.build(site);
            }
            /*
             * REMOTE miners are the remote's whole construction crew (owner
             * design, 2026-08-22): before this, no remote miner body had a
             * CARRY part, so the box-building branch above was dead code for
             * remotes and every site waited ~2150 ticks for a RemoteRepairer.
             * The seat is in build range (3) of the box site AND of the road
             * drip placeClippedRemoteRoads lays around it — so build them,
             * then keep the box alive (unowned-room containers decay 50
             * hits/tick; repair is 100 hits/WORK/tick, zero travel), and only
             * then hand the surplus to the box/floor. The miner NEVER moves
             * for any of this.
             */
            else if(creep.memory.targetRoom && creep.memory.targetRoom != creep.memory.homeRoom) {
                const cachedSite: any = creep.memory._nearSite && Game.getObjectById(creep.memory._nearSite);
                if(!cachedSite || !creep.memory._nearSiteT || Game.time - creep.memory._nearSiteT > 10) {
                    creep.memory._nearSiteT = Game.time;
                    const sites = creep.pos.findInRange(cachedSites(creep.room), 3);
                    sites.sort((a: any, b: any) =>
                        ((a.structureType === STRUCTURE_CONTAINER ? 0 : 1) -
                         (b.structureType === STRUCTURE_CONTAINER ? 0 : 1)) ||
                        (creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b)));
                    creep.memory._nearSite = sites.length ? sites[0].id : false;
                }
                const near: any = creep.memory._nearSite && Game.getObjectById(creep.memory._nearSite);
                if(near) {
                    creep.build(near);
                }
                else {
                    if(!creep.memory._repBoxT || Game.time - creep.memory._repBoxT > 10) {
                        creep.memory._repBoxT = Game.time;
                        const boxes = creep.pos.findInRange(
                            cachedStructures(creep.room).filter((s: any) => s.structureType === STRUCTURE_CONTAINER), 1);
                        const hurt = boxes.filter((b: any) => b.hits < b.hitsMax * 0.8)[0];
                        creep.memory._repBox = hurt ? hurt.id : false;
                    }
                    const box: any = creep.memory._repBox && Game.getObjectById(creep.memory._repBox);
                    if(box && box.hits < box.hitsMax) {
                        creep.repair(box);
                    }
                    else {
                        dumpMinerEnergy(creep);
                    }
                }
            }
            else {
                dumpMinerEnergy(creep);
            }
        }
        else {
            let result = creep.harvestEnergy();
            if(result == 0) {
                creep.memory.harvested = true;
            }
            else if(creep.getActiveBodyparts(CARRY) > 0 && creep.store[RESOURCE_ENERGY] > 0) {
                transferAdjacentSink(creep);
            }
            /* ---- step onto the source container ---------------------------
             *
             * `allGood` means "I am standing on a container" and is never
             * cleared, so once it is set nothing in this block can change any
             * decision. It used to sit BELOW the container find, which made a
             * room-wide FIND_STRUCTURES with a per-structure getRangeTo the
             * single most expensive thing a seated drop-miner did — every
             * tick, for the whole 1500-tick life, in the one state where the
             * answer is already known. Gate the whole block on it.
             *
             * While the creep is genuinely NOT on a container (bootstrap, or a
             * box that has not been built yet) the search still has to run, so
             * throttle it to one scan per 5 ticks with a name-hash offset —
             * without the offset the entire miner roster would fire on the
             * same tick and trade a saving for a spike. The conditions are the
             * originals, reordered cheapest-first; the outcome is identical.
             */
            if(creep.memory.harvested && !creep.memory.allGood) {
                let lookForStructures = creep.pos.lookFor(LOOK_STRUCTURES);
                for(let building of lookForStructures) {
                    if(building.structureType == STRUCTURE_CONTAINER) {
                        creep.memory.allGood = true;
                        break;
                    }
                }

                if(!creep.memory.allGood && (Game.time + nameOffset(creep.name, 5)) % 5 == 0) {
                    let source:any = Game.getObjectById(creep.memory.source);
                    if(source && creep.pos.getRangeTo(source) <= 2) {
                        let containerNearby = _.filter(cachedStructures(creep.room), (building: any) =>
                            building.structureType == STRUCTURE_CONTAINER && creep.pos.getRangeTo(building) <= 2);
                        if(containerNearby.length > 0 && !containerNearby[0].pos.isEqualTo(creep) &&
                           containerNearby[0].pos.lookFor(LOOK_CREEPS).length == 0) {
                            creep.MoveCostMatrixRoadPrio(containerNearby[0], 0)
                        }
                    }
                }
            }
        }
    }
    else {

        if(creep.memory.boostlabs && creep.memory.boostlabs.length > 0) {
            let result = creep.Boost();
            if(!result) {
                return;
            }
            else if (result) {
                creep.memory.boosted = true;
            }
        }



        if(!creep.memory.potential) {
            // Dump iff free < potential, harvest iff >=. A boosted shrink to
            // 1 CARRY has capacity 50 < WORK*6, so empty already looks "full"
            // and harvest is unreachable for the whole life.
            let potential = creep.memory.boosted
                ? creep.getActiveBodyparts(WORK) * 6
                : creep.getActiveBodyparts(WORK) * 2;
            const cap = creep.store.getCapacity();
            if(cap > 0) potential = Math.min(potential, cap);
            creep.memory.potential = potential;
        }

        // NOTE: forwardToControllerLink() is driven from Rooms/rooms.ts, not
        // from here. Tying it to a creep is what broke it — see the comment on
        // the function: W2N1 lost its last IN-ROOM miner (only remote miners,
        // whose targetRoom != homeRoom, were left), so a miner-driven pass
        // would still never have run in the room that needed it.


        // Seat first: every mover below defers to it. "moving" = this tick
        // walks to the seat and nothing else may steer.
        const seatState = ensureMinerSeat(creep);

        if(creep.ticksToLive <= 2) {
            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();
            if(creep.pos.isNearTo(closestLink)) {
                creep.transfer(closestLink, RESOURCE_ENERGY);
            }
            else if(seatState === "none") {
                creep.MoveCostMatrixRoadPrio(closestLink, 1);
            }
        }


        if(creep.store.getFreeCapacity() < creep.memory.potential) {
            let source:any = Game.getObjectById(creep.memory.sourceId);
            if(creep.pos.isNearTo(source)) {
                if(!creep.memory.NearbyExtensions) {
                    creep.memory.NearbyExtensions = [];
                    let mystructures = cachedMyStructures(creep.room);
                    let buildings = creep.pos.findInRange(mystructures, 1)
                    for(let building of buildings) {
                        if(building.structureType == STRUCTURE_EXTENSION) {
                            creep.memory.NearbyExtensions.push(building.id);
                        }
                    }
                }
            }

            if(creep.memory.NearbyExtensions && creep.memory.NearbyExtensions.length > 0) {
                for(let i = creep.memory.NearbyExtensions.length - 1; i >= 0; i--) {
                    let extensionID = creep.memory.NearbyExtensions[i];
                    let extension:any = Game.getObjectById(extensionID);
                    if(!extension) {
                        creep.memory.NearbyExtensions.splice(i, 1);
                        continue;
                    }
                    if(extension.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        let r = creep.transfer(extension, RESOURCE_ENERGY);
                        if(r == 0) return;
                        // Cached while adjacent to the source; a later walk
                        // to the link leaves these out of range. Returning
                        // on the failed transfer skipped link deposit forever.
                        if(r == ERR_NOT_IN_RANGE) {
                            creep.memory.NearbyExtensions.splice(i, 1);
                        }
                    }
                }
            }

            /*
             * THE 13.4M TILE.
             *
             * This is the machinery that adopts the rampart on/next to the
             * source link and then pumps it toward 50M/100M hits out of
             * storage. On live VPS W1N1 the plan's cover pass had wrapped the
             * source link in a bubble that the enclosure trades then pulled
             * INSIDE the final wall: nothing can shoot it without breaching the
             * room first, and the miner had quietly fed it to 13.4M hits
             * (~134k energy, and its twin another 13.1M).
             *
             * So the adoption candidates are filtered here, at the one place
             * that writes memory.myRampart — a buried rampart is never adopted,
             * and the pump below keeps its existing `myRampart = false` drops
             * plus one more for a tile that became buried after adoption.
             */
            if(creep.room.controller.level >= 7 && !creep.memory.myRampart && !creep.memory.checkedForRampartToRepair) {
                let myRamparts = _.filter(cachedMyStructures(creep.room), (s: any) => s.structureType == STRUCTURE_RAMPART);
                // buried test AFTER the range narrow — 1-3 candidates, not every
                // rampart in the room
                let rampartsInRangeOne: any[] = _.filter(creep.pos.findInRange(myRamparts, 1), (s: any) => !rampartIsBuried(creep.room, s.pos));

                if(rampartsInRangeOne.length > 0) {
                    rampartsInRangeOne.sort((a,b) => a.hits - b.hits);
                }

                let found = false;
                for(let building of rampartsInRangeOne) {
                    if(found) {
                        break;
                    }
                    if(building.structureType == STRUCTURE_RAMPART && building.hits < 50050000) {
                        let buildingsHereLookFor = building.pos.lookFor(LOOK_STRUCTURES);
                        for(let buildingHere of buildingsHereLookFor) {
                            if(buildingHere.structureType == STRUCTURE_LINK) {
                                creep.memory.myRampart = building.id;
                                found = true;
                                break;
                            }
                        }
                        let creepsHere = building.pos.lookFor(LOOK_CREEPS);
                        for(let c of creepsHere) {
                            if(c.my && c.memory.role == "EnergyMiner") {
                                creep.memory.myRampart = building.id;
                                found = true;
                                break;
                            }
                        }

                    }
                }
                creep.memory.checkedForRampartToRepair = true;
            }


            if(creep.ticksToLive > 275 && creep.memory.myRampart && source && source.ticksToRegeneration * 10.5 > source.energy) {
                let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
                let rampart:any = Game.getObjectById(creep.memory.myRampart);
                // adopted before the shell closed around it (replan / adopt /
                // the wall finally going up) — drop it exactly like the
                // hits-cap paths below do, and pump nothing this tick
                if(rampart && rampartIsBuried(creep.room, rampart.pos)) {
                    creep.memory.myRampart = false;
                }
                else if(storage && storage.store[RESOURCE_ENERGY] >= 300000) {

                    if(rampart && rampart.hits < 100050000) {
                        creep.repair(rampart);
                        return;
                    }
                    else {
                        creep.memory.myRampart = false;
                    }
                }
                else if(storage && storage.store[RESOURCE_ENERGY] > 90000 && rampart && rampart.hits < 50050000) {
                    creep.repair(rampart);
                    return;
                }
                else {
                    creep.memory.myRampart = false;
                }
            }


            if(!creep.memory.checkedForSites) {
                let siteIDs = []
                let constructionSitesNearCreep = creep.pos.findInRange(cachedSites(creep.room), 1);
                if(constructionSitesNearCreep.length > 0) {
                    for(let site of constructionSitesNearCreep) {
                        siteIDs.push(site.id);
                    }
                }
                if(siteIDs.length > 0) {
                    creep.memory.constructionSites = siteIDs;
                }
                creep.memory.checkedForSites = true;
            }
            if(creep.memory.constructionSites && creep.memory.constructionSites.length > 0) {
                let site:any = Game.getObjectById(creep.memory.constructionSites[creep.memory.constructionSites.length - 1]);
                if(site) {
                    creep.build(site);
                }
                else {
                    creep.memory.constructionSites.pop()
                }
            }




            let closestLink:any = Game.getObjectById(creep.memory.sourceLink);
            // memory.sourceLink was never written, so this was a room-wide FIND
            // every tick and could lock a hub/controller link within 5 of the creep.
            //
            // A NEGATIVE answer is stored as `false`, and getObjectById(false)
            // is null — so the "no link near this source" case re-ran the same
            // room-wide find every tick anyway, for the whole life. Retry that
            // one on a 25-tick timer (links are not built often, and the miner
            // falls through to dumpMinerEnergy meanwhile, exactly as before);
            // a positive answer still resolves straight off the cached id.
            const linkStale = !closestLink || closestLink.structureType !== STRUCTURE_LINK ||
               !source || source.pos.getRangeTo(closestLink) >= 5;
            const negThrottled = creep.memory.sourceLink === false &&
                Game.time - (creep.memory.sourceLinkT || 0) < 25;
            if(linkStale && !negThrottled) {
                closestLink = source
                    ? source.pos.findClosestByRange(_.filter(cachedMyStructures(creep.room), (s:any) => s.structureType == STRUCTURE_LINK && source.pos.getRangeTo(s) < 5))
                    : null;
                creep.memory.sourceLink = closestLink ? closestLink.id : false;
                creep.memory.sourceLinkT = Game.time;
            }
            else if(linkStale) {
                closestLink = null;
            }
            if(closestLink && closestLink.store[RESOURCE_ENERGY] < 800) {
                if(creep.pos.isNearTo(closestLink)) {
                    creep.transfer(closestLink, RESOURCE_ENERGY);
                }
                else if(seatState === "none") {
                    // no seat exists for this source-link pair: legacy walk
                    creep.MoveCostMatrixRoadPrio(closestLink, 1);
                }
                // seat exists: the transfer happens the tick we are seated;
                // walking link-ward off the seat is the shuffle this fixes
            }
            else {
                // Room-wide haul can be true because a sibling source is
                // linked. This source then has nowhere to unload and harvest
                // stalls at ERR_FULL — dump to container / tile instead.
                dumpMinerEnergy(creep);
            }
        }

        let storedSource:any = Game.getObjectById(creep.memory.sourceId)
        if(!creep.memory.checkAmIOnRampart && creep.pos.isNearTo(storedSource) && creep.memory.homeRoom == creep.memory.targetRoom) {
            let lookForRampart = creep.pos.lookFor(LOOK_STRUCTURES);
            if(lookForRampart.length > 0) {
                for(let building of lookForRampart) {
                    if(building.structureType == STRUCTURE_RAMPART) {
                        creep.memory.checkAmIOnRampart = true;
                        break;
                    }
                }
            }
            if(!creep.memory.checkAmIOnRampart) {
                let rampartsInRange3 = _.filter(cachedMyStructures(creep.room), (s: any) => s.structureType == STRUCTURE_RAMPART && s.pos.getRangeTo(creep) <= 2);
                if(rampartsInRange3.length == 0) {
                    creep.memory.checkAmIOnRampart = true;
                }
                else {
                    let rampart = creep.pos.findClosestByRange(rampartsInRange3);
                    if(rampart) {
                        creep.memory.checkAmIOnRampart = true;
                        // the SEAT outranks a generic nearby rampart
                        if(seatState === "none") creep.MoveCostMatrixRoadPrio(rampart, 0);
                    }
                }
            }
        }

        if(creep.store.getFreeCapacity() >= creep.memory.potential && seatState !== "moving") {
            // harvestEnergy paths to ANY range-1 tile; while walking to the
            // seat its move intent would fight ensureMinerSeat's
            let result = creep.harvestEnergy();

            /*
             * Reclaim rides the HARVEST tick, not the unload tick.
             *
             * The unload block above is gated on free < potential — the miner
             * batches its transfers and only visits the link when it is nearly
             * full. Putting the reclaim there gave it the ~9 free capacity a
             * nearly-full miner has, so it recovered about 9 energy per 20-tick
             * cycle while delaying the 200-energy transfer by a tick. Measured
             * live on E37N59: the piles kept falling at 2/t, which is just
             * decay.
             *
             * Here the miner has its whole carry free, so one pickup takes up
             * to a full load and the very next tick's batched transfer puts it
             * in the link. That is ~100 e/t against a 2 e/t decay.
             *
             * harvest is its own intent class, so this costs the miner nothing
             * it was otherwise using: on a harvest tick the transfer-class
             * intent is idle by definition.
             */
            const srcLink:any = Game.getObjectById(creep.memory.sourceLink);
            if(srcLink && srcLink.structureType === STRUCTURE_LINK && creep.pos.isNearTo(srcLink)) {
                reclaimSpill(creep, srcLink);
            }
        }



        if(creep.store[RESOURCE_ENERGY] > 0 && creep.memory.homeRoom == creep.memory.targetRoom) {

            let closestLink = Game.getObjectById(creep.memory.closestLink) || creep.findClosestLink();

            if(closestLink && closestLink.pos.isNearTo(creep) && !creep.memory.checkedForRampart) {
                let lookForBuildingsHere = closestLink.pos.lookFor(LOOK_STRUCTURES);
                let found = false;
                for(let building of lookForBuildingsHere) {
                    if(building.structureType == STRUCTURE_RAMPART) {
                        found = true;
                    }
                }
                let storage:any = Game.getObjectById(creep.room.memory.Structures.storage);
                // ...and not one the wall already covers: this is the planter
                // that put the link rampart on W1N1 there in the first place,
                // so it gets the same buried veto placePlanSites has.
                if(!found && storage && closestLink.pos.getRangeTo(storage) > 7 &&
                    isSanctionedRampart(creep.room, closestLink.pos) &&
                    !rampartIsBuried(creep.room, closestLink.pos)) {
                    closestLink.pos.createConstructionSite(STRUCTURE_RAMPART);
                }
                creep.memory.checkedForRampart = true;
            }

            let targetLink:any = Game.getObjectById(creep.room.memory.Structures.StorageLink) || creep.room.findStorageLink();

            /*
             * Structures.controllerLink is NOT guaranteed to be a link.
             *
             * creepFunctions writes a CONTAINER under that key below RCL7, so in
             * an RCL5/6 room with a real controller link this resolved to the
             * container and `transferEnergy` below silently had no valid target
             * — the link half of the network simply never ran.
             *
             * Live W2N1 (RCL6): key = the container at (10,9), source link
             * (16,16) sat on a full 800 while the controller link at (9,9) sat
             * at 0 and the controller made no progress. The room could not even
             * self-heal the key, because the only writer is a
             * ControllerLinkFiller and that creep cannot be spawned in a room
             * whose storage is empty (rooms.spawning.ts `feedable`).
             *
             * So resolve a LINK here, from the room, and repair the key when the
             * cache is pointing at something that is not one.
             *
             * Shared with forwardToControllerLink() and memoised per room per
             * tick — identical derivation, and the room with NO controller link
             * (which writes nothing back, so the find repeated forever) is the
             * one that used to pay for it on every miner on every tick.
             */
            const closestLinkToController:any = resolveControllerLink(creep.room);
            let extraLink = null;
            if(creep.room.memory.Structures.extraLinks && creep.room.memory.Structures.extraLinks.length > 0) {
                for(let linkID of creep.room.memory.Structures.extraLinks) {
                    let link:any = Game.getObjectById(linkID);
                    if(link && link.store[RESOURCE_ENERGY] < 200) {
                        extraLink =  link;
                        break;
                    }
                }

            }


            if(targetLink == null || closestLink == null) {
                if(!targetLink) {
                    creep.room.memory.Structures.StorageLink = undefined;
                    // Legacy self-heal: drop a hub link at the legacy offset.
                    // NEVER for planV2 rooms — that tile is not the plan's hub
                    // link, so this would build an off-plan link (and burn a
                    // link slot) plus spam the console every tick.
                    if(creep.room.storage && !creep.room.memory.planV2 && creep.room.storage.pos.x >= 2) {
                        new RoomPosition(creep.room.storage.pos.x-2,creep.room.storage.pos.y,creep.room.name).createConstructionSite(STRUCTURE_LINK);
                    }
                }
                if(!creep.room.memory.planV2 && Game.time % 100 == 0) {
                    console.log("ALERT: stupid bug idk why. Link store is null.", creep.memory.targetRoom);
                }
                return;
            }

            // Feeding the controller link is only worth doing if something in
            // the room will ever take the energy back out of it. With no
            // upgrader this rung is what fills a controller link to 800 and
            // leaves it there — see forwardToControllerLink() above for the
            // measurements. Same test both places, so the two never disagree.
            //
            // transferEnergy with no amount is all-or-nothing (ERR_FULL moves
            // nothing). Controller/extra used to sit in front of the hub send
            // in an if/else, so a failed controller send never drained to storage.
            let forwarded = false;
            if(roomFeedsController(creep.room) && !bankBelowReserve(creep.room) && closestLink && closestLink.store[RESOURCE_ENERGY] >= 400 && closestLinkToController && closestLinkToController.store[RESOURCE_ENERGY] <= 400) {
                const send = Math.min(closestLink.store[RESOURCE_ENERGY], closestLinkToController.store.getFreeCapacity(RESOURCE_ENERGY));
                if(send > 0 && closestLink.transferEnergy(closestLinkToController, send) == 0) {
                    forwarded = true;
                }
            }

            if(!forwarded && closestLink && closestLink.store[RESOURCE_ENERGY] >= 200 && extraLink && extraLink.store[RESOURCE_ENERGY] <= 200) {
                const send = Math.min(closestLink.store[RESOURCE_ENERGY], extraLink.store.getFreeCapacity(RESOURCE_ENERGY));
                if(send > 0 && closestLink.transferEnergy(extraLink, send) == 0) {
                    forwarded = true;
                }
            }

            /*
             * The source -> hub rung used to demand the source link hold
             * EXACTLY 800 and the hub link hold EXACTLY 0. Both halves are
             * traps. A single unit left in the hub link — an EnergyManager that
             * died, or is halfway through a lab errand — blocked every source
             * link in the room from unloading, and paired with the `<= 400`
             * bar on the controller rung above it, a room sitting at ctrl 500 /
             * hub 50 had no legal link transfer at all while its source links
             * pinned at 800 and its miners had nowhere to put their energy.
             *
             * Send what actually fits instead. `transferEnergy` with no amount
             * means "all of it" and answers ERR_FULL if the target cannot take
             * all of it, which is the other half of why the old test had to be
             * so strict; naming the amount removes the need.
             */
            if(!forwarded && closestLink && targetLink && closestLink.id !== targetLink.id && closestLink.store[RESOURCE_ENERGY] >= 400) {
                const room = targetLink.store.getFreeCapacity(RESOURCE_ENERGY);
                const send = Math.min(closestLink.store[RESOURCE_ENERGY], room);
                if(send >= 100) {
                    closestLink.transferEnergy(targetLink, send);
                }
            }
        }
    }
}
const roleEnergyMiner = {
    run,

    //function2,
    //function3
};


export default roleEnergyMiner;
