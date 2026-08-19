// returns the lab standing on the given tile, if any
function labAt(room, x, y) {
    if(x < 0 || x > 49 || y < 0 || y > 49) {
        return undefined;
    }
    let structuresHere = new RoomPosition(x, y, room.name).lookFor(LOOK_STRUCTURES);
    for(let building of structuresHere) {
        if(building.structureType == STRUCTURE_LAB) {
            return building;
        }
    }
    return undefined;
}

// legacy strip layout: 3 columns x 4 rows beside storage, the 2 input labs sit in the middle column.
// returns the matching offset table, or undefined when the room is not built in that shape.
function legacyLabLayout(room, storage) {
    let layouts = [
        {
            inputLab1: {x: storage.pos.x - 4, y: storage.pos.y + 1},
            inputLab2: {x: storage.pos.x - 4, y: storage.pos.y + 2},
            outputLab1: {x: storage.pos.x - 3, y: storage.pos.y},
            outputLab2: {x: storage.pos.x - 3, y: storage.pos.y + 1},
            outputLab3: {x: storage.pos.x - 3, y: storage.pos.y + 2},
            outputLab4: {x: storage.pos.x - 3, y: storage.pos.y + 3},
            outputLab5: {x: storage.pos.x - 5, y: storage.pos.y + 3},
            outputLab6: {x: storage.pos.x - 5, y: storage.pos.y + 2},
            outputLab7: {x: storage.pos.x - 5, y: storage.pos.y + 1},
            outputLab8: {x: storage.pos.x - 5, y: storage.pos.y}
        },
        {
            inputLab1: {x: storage.pos.x + 4, y: storage.pos.y + 4},
            inputLab2: {x: storage.pos.x + 4, y: storage.pos.y + 5},
            outputLab1: {x: storage.pos.x + 3, y: storage.pos.y + 3},
            outputLab2: {x: storage.pos.x + 3, y: storage.pos.y + 4},
            outputLab3: {x: storage.pos.x + 3, y: storage.pos.y + 5},
            outputLab4: {x: storage.pos.x + 3, y: storage.pos.y + 6},
            outputLab5: {x: storage.pos.x + 5, y: storage.pos.y + 3},
            outputLab6: {x: storage.pos.x + 5, y: storage.pos.y + 4},
            outputLab7: {x: storage.pos.x + 5, y: storage.pos.y + 5},
            outputLab8: {x: storage.pos.x + 5, y: storage.pos.y + 6}
        }
    ];
    for(let layout of layouts) {
        if(!labAt(room, layout.inputLab1.x, layout.inputLab1.y) || !labAt(room, layout.inputLab2.x, layout.inputLab2.y)) {
            continue;
        }
        // Two labs on the input offsets is not proof the room was BUILT to the
        // strip — a dynamic layout can hit those two tiles by coincidence and
        // then get its whole reaction chain hijacked. Demand that the strip
        // holds (essentially) every lab the room has.
        let onLayout = 0;
        for(let slot of Object.keys(layout)) {
            if(labAt(room, layout[slot].x, layout[slot].y)) {
                onLayout++;
            }
        }
        let labCount = room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LAB}).length;
        if(onLayout >= Math.min(6, labCount)) {
            return layout;
        }
    }
    return undefined;
}

// v2-planned rooms: the two reaction inputs are FIXED by the plan (the lab
// diamond's centre pair), so neither the legacy storage offsets nor the
// adjacency heuristic may be consulted. Returns false while fewer than two
// input labs are actually built — early RCL7 has a partial diamond and the
// caller falls back to adjacency for the interim.
function assignPlanV2Labs(room, storage, LabsInRoom) {
    let packed = room.memory.planV2 && room.memory.planV2.t && room.memory.planV2.t.labInput;
    if(!packed || packed.length < 2) {
        return false;
    }
    let inputs = [];
    for(let p of packed) {
        let lab = labAt(room, p % 50, Math.floor(p / 50));
        if(lab) {
            inputs.push(lab);
        }
    }
    if(inputs.length < 2) {
        return false;
    }
    room.memory.labs.inputLab1 = inputs[0].id;
    room.memory.labs.inputLab2 = inputs[1].id;

    let outputs = LabsInRoom.filter(function(lab) {return lab.id != inputs[0].id && lab.id != inputs[1].id;});
    // stable order so boost slots (lab1..lab8) do not shuffle on re-detection
    outputs.sort(function(a, b) {
        let da = storage ? a.pos.getRangeTo(storage) : 0;
        let db = storage ? b.pos.getRangeTo(storage) : 0;
        if(da != db) {
            return da - db;
        }
        if(a.pos.x != b.pos.x) {
            return a.pos.x - b.pos.x;
        }
        if(a.pos.y != b.pos.y) {
            return a.pos.y - b.pos.y;
        }
        return a.id < b.id ? -1 : 1;
    });
    let slot = 1;
    for(let lab of outputs) {
        if(slot > 8) {
            break;
        }
        room.memory.labs["outputLab" + slot] = lab.id;
        slot++;
    }
    for(let empty = slot; empty <= 8; empty++) {
        delete room.memory.labs["outputLab" + empty];
    }
    return true;
}

// keeps the historic assignment on rooms that were built with the storage relative strip
function assignLegacyLabs(room, storage, LabsInRoom) {
    let layout = legacyLabLayout(room, storage);
    if(!layout) {
        return false;
    }
    // Assign every built layout slot immediately. Waiting for the full
    // RCL7/8 rung (6/10) left half the strip unused, and a destroyed lab
    // kept its dead id forever so reactions/boosts targeted a ghost.
    let slots = ["inputLab1", "inputLab2", "outputLab1", "outputLab2", "outputLab3", "outputLab4", "outputLab5", "outputLab6", "outputLab7", "outputLab8"];
    for(let slot of slots) {
        if(!layout[slot]) continue;
        let lab = labAt(room, layout[slot].x, layout[slot].y);
        if(lab) {
            room.memory.labs[slot] = lab.id;
        }
        else {
            delete room.memory.labs[slot];
        }
    }
    return room.memory.labs.inputLab1 != undefined && room.memory.labs.inputLab2 != undefined;
}

function labsInRangeCount(lab, LabsInRoom, range) {
    let count = 0;
    for(let other of LabsInRoom) {
        if(other.id == lab.id) {
            continue;
        }
        if(lab.pos.getRangeTo(other) <= range) {
            count++;
        }
    }
    return count;
}

// geometry agnostic detection: the input labs are the ones that reach every other lab (range <= 2),
// everything else becomes an output lab. works for any stamp the planner produces.
function assignDynamicLabs(room, storage, LabsInRoom) {
    let scored = [];
    for(let lab of LabsInRoom) {
        scored.push({
            lab: lab,
            reach: labsInRangeCount(lab, LabsInRoom, 2),
            adjacent: labsInRangeCount(lab, LabsInRoom, 1),
            distance: storage ? lab.pos.getRangeTo(storage) : 0
        });
    }

    let candidates = scored.filter(function(entry) {return entry.reach == LabsInRoom.length - 1;});
    if(candidates.length < 2) {
        // degenerate geometry, take whatever reaches the most labs
        candidates = scored;
    }
    // more than 2 qualify -> the pair glued to the rest of the cluster wins, then the pair nearest storage
    let byInputFitness = function(a, b) {
        if(a.reach != b.reach) {
            return b.reach - a.reach;
        }
        if(a.adjacent != b.adjacent) {
            return b.adjacent - a.adjacent;
        }
        if(a.distance != b.distance) {
            return a.distance - b.distance;
        }
        return a.lab.id < b.lab.id ? -1 : 1;
    };
    candidates.sort(byInputFitness);

    let inputLab1 = candidates[0];
    let inputLab2 = candidates[1];
    if(!inputLab1 || !inputLab2) {
        return false;
    }

    let outputs = scored.filter(function(entry) {return entry.lab.id != inputLab1.lab.id && entry.lab.id != inputLab2.lab.id;});
    // stable order so the boost slots (lab1..lab8) do not shuffle on every re-detection
    outputs.sort(function(a, b) {
        if(a.distance != b.distance) {
            return a.distance - b.distance;
        }
        if(a.lab.pos.x != b.lab.pos.x) {
            return a.lab.pos.x - b.lab.pos.x;
        }
        if(a.lab.pos.y != b.lab.pos.y) {
            return a.lab.pos.y - b.lab.pos.y;
        }
        return a.lab.id < b.lab.id ? -1 : 1;
    });

    room.memory.labs.inputLab1 = inputLab1.lab.id;
    room.memory.labs.inputLab2 = inputLab2.lab.id;

    let slot = 1;
    for(let entry of outputs) {
        if(slot > 8) {
            break;
        }
        room.memory.labs["outputLab" + slot] = entry.lab.id;
        slot++;
    }
    for(let empty = slot; empty <= 8; empty++) {
        delete room.memory.labs["outputLab" + empty];
    }
    return true;
}

/**
 * Boost ledger (R6.93).
 *
 * The old shape was just `{ amount, use }` on each labN. That cannot tell
 * WHO reserved the minerals, so:
 *   - a second queue stomp overwrote the first creep's amount
 *   - death / shred / TTL-skip left use+amount orphaned
 *   - the 21000-tick janitor wiped amount==0 slots even when use>0
 *     (EM had already delivered; the live creep was still walking to the lab)
 *
 * Now each slot also has `owners: { [creepName]: { amount, t } }`. `use` is
 * live claimants; `amount` is aggregate STILL-TO-DELIVER (EM decrements it
 * on withdraw, so a removal unwinds only what is left over the other owners).
 * The janitor refunds a slot only for owners that are neither live nor queued.
 */

function boostLedger(room) {
    if(!room.memory.labs) room.memory.labs = {};
    if(!room.memory.labs.status) room.memory.labs.status = {};
    if(!room.memory.labs.status.boost) room.memory.labs.status.boost = {};
    return room.memory.labs.status.boost;
}

function spawnListHasName(room, name) {
    const q = room.memory.spawn_list || [];
    for(let i = 1; i + 1 < q.length; i += 3) {
        if(q[i] === name) return true;
    }
    return false;
}

function ownerLooksLikeEnergyMiner(name) {
    if(name.indexOf("EnergyMiner") === 0) return true;
    const c = Game.creeps[name];
    return !!(c && c.memory && c.memory.role === "EnergyMiner");
}

function slotOwnerCount(slot) {
    if(!slot || !slot.owners) return 0;
    return Object.keys(slot.owners).length;
}

// lab8 is room-wide: UO (miner, lab8reserved) or XKH2O (repair). Mixing them
// dumps the first mineral. Same-name replace is not a conflict.
function lab8ChargeConflicts(room, slot, ownerName) {
    if(!slot || !slot.owners) return false;
    const wantUo = !!(room.memory.labs && room.memory.labs.lab8reserved);
    for(const name in slot.owners) {
        if(name === ownerName) continue;
        if(ownerLooksLikeEnergyMiner(name) !== wantUo) return true;
    }
    return false;
}

function labCarriedLiveOrQueued(room, labId) {
    if(!labId) return false;
    for(const name in Game.creeps) {
        const labs = Game.creeps[name].memory && Game.creeps[name].memory.boostlabs;
        if(labs && labs.indexOf(labId) !== -1) return true;
    }
    const q = room.memory.spawn_list || [];
    for(let i = 2; i < q.length; i += 3) {
        const mem = q[i] && q[i].memory;
        const labs = mem && mem.boostlabs;
        if(labs && labs.indexOf(labId) !== -1) return true;
    }
    return false;
}

/** Reserve `amount` of this slot's mineral for `ownerName`. Same name re-queues replace, they do not stack.
 *  Returns false on lab8 mineral conflict — caller must queue unboosted. */
export function chargeBoostSlot(room, labKey: string, amount: number, ownerName: string): boolean {
    if(!room || !labKey || !ownerName || !(amount > 0)) return false;
    const boost = boostLedger(room);
    let slot = boost[labKey];
    if(!slot) {
        slot = {amount: 0, use: 0, owners: {}};
        boost[labKey] = slot;
    }
    if(!slot.owners) slot.owners = {};
    // leftover pre-owners {amount,use} — adopt, do not stack on the orphan
    if(slotOwnerCount(slot) === 0) {
        slot.amount = 0;
        slot.use = 0;
    }
    if(labKey === "lab8" && lab8ChargeConflicts(room, slot, ownerName)) {
        // Caller may have set lab8reserved before this charge. Keep the
        // owners' mineral so EM does not dump it after a refused mix.
        let ownersWantUo = false;
        for(const name in slot.owners) {
            if(name === ownerName) continue;
            if(ownerLooksLikeEnergyMiner(name)) { ownersWantUo = true; break; }
        }
        room.memory.labs.lab8reserved = ownersWantUo;
        return false;
    }
    if(slot.owners[ownerName]) {
        // re-queue is a removal + a re-add: unwind only the share EM has not
        // hauled yet, otherwise the replace eats a sibling's still-to-deliver.
        unwindUndelivered(slot, ownerName);
        slot.use = Math.max(0, (slot.use || 0) - 1);
    }
    slot.owners[ownerName] = {amount: amount, t: Game.time};
    slot.amount = (slot.amount || 0) + amount;
    slot.use = (slot.use || 0) + 1;
    return true;
}

/** Map an output-lab structure id back to "lab1".."lab8". */
export function labKeyForId(room, labId: string): string | null {
    if(!room || !room.memory.labs || !labId) return null;
    for(let i = 1; i <= 8; i++) {
        if(room.memory.labs["outputLab" + i] === labId) return "lab" + i;
    }
    return null;
}

function clearLab8ReserveIfIdle(room, slot) {
    if(!room.memory.labs || !room.memory.labs.lab8reserved) return;
    if(slot && slot.owners) {
        for(const name in slot.owners) {
            if(ownerLooksLikeEnergyMiner(name)) return;
        }
    }
    room.memory.labs.lab8reserved = false;
}

const consumeSkipLogged = {};

// EM decrements the shared slot.amount on withdraw but never the per-owner
// rec.amount, so the ledger cannot see WHOSE share was hauled. Refund at most
// what is left after every remaining owner's full charge is still covered: an
// already-hauled share then unwinds 0 (no double-subtract), and the reserve a
// sibling's delivery leaves behind is freed when the last owner goes.
// Call BEFORE deleting the owner.
function unwindUndelivered(slot, ownerName) {
    const owners = (slot && slot.owners) || {};
    const rec = owners[ownerName];
    if(!rec) return;
    let others = 0;
    for(const name in owners) {
        if(name !== ownerName) others += owners[name].amount || 0;
    }
    const back = Math.min(rec.amount || 0, (slot.amount || 0) - others);
    if(back > 0) slot.amount = (slot.amount || 0) - back;
}

// No owner and no live claimant means nobody is entitled to the rest, so drop
// it: a stranded amount>0 blocks the janitor's delete and the reaction gate.
function clearIfUnowned(slot) {
    if(slotOwnerCount(slot) === 0 && (slot.use || 0) <= 0) slot.amount = 0;
}

/** Drop one owner's claim on one slot (boost success, give-up, or wrong mineral). */
export function consumeBoostOwner(room, labKey: string, ownerName: string): void {
    const boost = room.memory.labs && room.memory.labs.status && room.memory.labs.status.boost;
    if(!boost || !labKey) return;
    const slot = boost[labKey];
    if(!slot) return;
    // EM already decremented amount on withdraw, so a delivered-and-consumed
    // share unwinds 0; a give-up / wrong-mineral drop still frees its reserve.
    // Id-remap: labKeyForId can point at a slot this creep never owned —
    // decrementing that use is theft.
    if(!slot.owners || !ownerName || !slot.owners[ownerName]) {
        if(ownerName) {
            const tag = room.name + ":" + labKey + ":" + ownerName;
            if(!consumeSkipLogged[tag]) {
                consumeSkipLogged[tag] = 1;
                console.log("consumeBoostOwner skip", room.name, labKey, ownerName, "- not an owner");
            }
        }
        return;
    }
    unwindUndelivered(slot, ownerName);
    delete slot.owners[ownerName];
    if((slot.use || 0) > 0) slot.use -= 1;
    clearIfUnowned(slot);
    if(labKey === "lab8") clearLab8ReserveIfIdle(room, slot);
}

/** Refund every slot this creep name still owns. Death, shred, or queue drop. */
export function refundBoostOwner(room, ownerName: string): void {
    const boost = room.memory.labs && room.memory.labs.status && room.memory.labs.status.boost;
    if(!boost || !ownerName) return;
    for(const key in boost) {
        const slot = boost[key];
        if(!slot || !slot.owners || !slot.owners[ownerName]) continue;
        unwindUndelivered(slot, ownerName);
        slot.use = Math.max(0, (slot.use || 0) - 1);
        delete slot.owners[ownerName];
        clearIfUnowned(slot);
        if(key === "lab8") clearLab8ReserveIfIdle(room, slot);
    }
}

/** ERR_NAME_EXISTS retries keep the reservation attached to the new name. */
export function renameBoostOwner(room, oldName: string, newName: string): void {
    const boost = room.memory.labs && room.memory.labs.status && room.memory.labs.status.boost;
    if(!boost || !oldName || !newName || oldName === newName) return;
    for(const key in boost) {
        const slot = boost[key];
        if(!slot || !slot.owners || !slot.owners[oldName]) continue;
        slot.owners[newName] = slot.owners[oldName];
        delete slot.owners[oldName];
    }
}

/**
 * Owner-liveness janitor. Runs every labs() pass (8 slots, cheap).
 * A slot with use>0 is a LIVE fill — never wipe it just because amount hit 0.
 */
export function janitorBoostLedger(room): void {
    const boost = room.memory.labs && room.memory.labs.status && room.memory.labs.status.boost;
    if(boost) {
        for(const key in boost) {
            const slot = boost[key];
            if(!slot || typeof slot !== "object") continue;
            if(slot.owners) {
                for(const name in slot.owners) {
                    if(Game.creeps[name] || spawnListHasName(room, name)) continue;
                    unwindUndelivered(slot, name);
                    slot.use = Math.max(0, (slot.use || 0) - 1);
                    delete slot.owners[name];
                    clearIfUnowned(slot);
                    if(key === "lab8") clearLab8ReserveIfIdle(room, slot);
                }
            }
            const ownersLeft = slotOwnerCount(slot) > 0;
            // pre-owners leftover: use>0 with nobody on the slot and no
            // live/queued creep still pointing boostlabs at this lab.
            if(!ownersLeft && (slot.use || 0) > 0) {
                const n = key.indexOf("lab") === 0 ? key.substring(3) : "";
                const labId = n && room.memory.labs["outputLab" + n];
                if(!labCarriedLiveOrQueued(room, labId)) {
                    slot.use = 0;
                    slot.amount = 0;
                }
            }
            // use>0 means someone is still entitled to this mineral, even if EM
            // already delivered (amount==0). The old 21000 wipe ignored that.
            if((slot.use || 0) <= 0 && (slot.amount || 0) <= 0 && !ownersLeft) {
                delete boost[key];
            }
        }
    }
    // lab8reserved is a sibling flag, not a slot field — clear it even when
    // boost.lab8 is already gone.
    clearLab8ReserveIfIdle(room, boost && boost.lab8);
}

/** Combined storage+terminal stock of one resource.
 *  Market buys land in the TERMINAL, so a storage-only read under-counts a
 *  boost that was just bought and gates the spawn that paid for it. */
export function storeOf(room, res): number {
    if(!room) return 0;
    const storage: any = (room.memory && room.memory.Structures && Game.getObjectById(room.memory.Structures.storage)) || room.storage;
    const terminal: any = room.terminal;
    return ((storage && storage.store[res]) || 0) + ((terminal && terminal.store[res]) || 0);
}

function labs(room) {
    if(!room.memory.labs || Game.time % 120 == 0) {

        if(!room.memory.labs) {
            room.memory.labs = {};
        }

        let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();
        let LabsInRoom = room.find(FIND_MY_STRUCTURES, {filter: building => building.structureType == STRUCTURE_LAB});

        if(room.controller.level >= 6 && LabsInRoom.length >= 3) {

            let assigned = false;
            if(room.memory.planV2) {
                // plan wins outright; adjacency only covers the partial-diamond
                // interim. The legacy offsets are never consulted here.
                assigned = assignPlanV2Labs(room, storage, LabsInRoom);
            }
            else if(storage) {
                assigned = assignLegacyLabs(room, storage, LabsInRoom);
            }
            if(!assigned) {
                assignDynamicLabs(room, storage, LabsInRoom);
            }
        }

    }


    let inputLab1;
    let inputLab2;
    let outputLab1;
    let outputLab2;
    let outputLab3;
    let outputLab4;
    let outputLab5;
    let outputLab6;
    let outputLab7;
    let outputLab8;

    if(room.memory.labs.inputLab1) {
        inputLab1 = Game.getObjectById(room.memory.labs.inputLab1)
    }
    if(room.memory.labs.inputLab2) {
        inputLab2 = Game.getObjectById(room.memory.labs.inputLab2)
    }
    if(room.memory.labs.outputLab1) {
        outputLab1 = Game.getObjectById(room.memory.labs.outputLab1)
    }
    if(room.memory.labs.outputLab2) {
        outputLab2 = Game.getObjectById(room.memory.labs.outputLab2)
    }
    if(room.memory.labs.outputLab3) {
        outputLab3 = Game.getObjectById(room.memory.labs.outputLab3)
    }
    if(room.memory.labs.outputLab4) {
        outputLab4 = Game.getObjectById(room.memory.labs.outputLab4)
    }
    if(room.memory.labs.outputLab5) {
        outputLab5 = Game.getObjectById(room.memory.labs.outputLab5)
    }
    if(room.memory.labs.outputLab6) {
        outputLab6 = Game.getObjectById(room.memory.labs.outputLab6)
    }
    if(room.memory.labs.outputLab7) {
        outputLab7 = Game.getObjectById(room.memory.labs.outputLab7)
    }
    if(room.memory.labs.outputLab8) {
        outputLab8 = Game.getObjectById(room.memory.labs.outputLab8)
    }

    // Owner-liveness refunds. Replaces the 21000-tick wipe that deleted
    // amount==0 slots while use>0 (live creeps still walking to a filled lab).
    janitorBoostLedger(room);

    let storage = Game.getObjectById(room.memory.Structures.storage) || room.findStorage();

    if(!room.memory.labs.status) {
        room.memory.labs.status = {};
    }
    if(!room.memory.labs.status.currentOutput) {
        room.memory.labs.status.currentOutput = false;
    }
    if(!room.memory.labs.status.lab1Input) {
        room.memory.labs.status.lab1Input = false;
    }
    if(!room.memory.labs.status.lab2Input) {
        room.memory.labs.status.lab2Input = false;
    }

    if((!room.memory.labs.status.lab1Input || !room.memory.labs.status.lab2Input || !room.memory.labs.status.currentOutput || Game.time % 500 == 0) && room.terminal) {
        let lab1Input:MineralConstant | MineralCompoundConstant | any;
        let lab2Input:MineralConstant | MineralCompoundConstant | any;
        let currentOutput;
        if(outputLab1 && outputLab1.mineralType) {
            currentOutput = outputLab1.mineralType;
        }
        else {
            currentOutput = false;
        }

        let terminal = room.terminal;

        if((storage && storage.store[RESOURCE_HYDROXIDE] < 1000 && currentOutput != RESOURCE_HYDROXIDE ||
            storage && storage.store[RESOURCE_HYDROXIDE] < 10000 && currentOutput == RESOURCE_HYDROXIDE) &&
            terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000 && terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000) {
                lab1Input = RESOURCE_OXYGEN
                lab2Input = RESOURCE_HYDROGEN;
                currentOutput = RESOURCE_HYDROXIDE;
            }

        // First pass runs COMBAT T3 first: XUH2O, XZHO2, XLHO2, XGHO2, XKHO2.
        // The XLH2O (repair) chain used to sit here, ahead of all of them, and
        // it is the only non-combat rung that did — it now sits after XKHO2,
        // next to the other non-combat rung (XKH2O carry).

        // chain to get catalyzed utrium acid

        else if((storage && storage.store[RESOURCE_UTRIUM_HYDRIDE] < 1000 && currentOutput != RESOURCE_UTRIUM_HYDRIDE ||
            storage && storage.store[RESOURCE_UTRIUM_HYDRIDE] < 3000 && currentOutput == RESOURCE_UTRIUM_HYDRIDE) &&
            terminal.store[RESOURCE_UTRIUM] + storage.store[RESOURCE_UTRIUM] >= 1000 && terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000) {
                lab1Input = RESOURCE_UTRIUM;
                lab2Input = RESOURCE_HYDROGEN;
                currentOutput = RESOURCE_UTRIUM_HYDRIDE;
            }

        else if((storage && storage.store[RESOURCE_UTRIUM_ACID] < 1000 && currentOutput != RESOURCE_UTRIUM_ACID ||
            storage && storage.store[RESOURCE_UTRIUM_ACID] < 3000 && currentOutput == RESOURCE_UTRIUM_ACID) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_UTRIUM_HYDRIDE] + storage.store[RESOURCE_UTRIUM_HYDRIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_UTRIUM_HYDRIDE;
                currentOutput = RESOURCE_UTRIUM_ACID;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_UTRIUM_ACID] + storage.store[RESOURCE_UTRIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_UTRIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_UTRIUM_ACID;
            }

        // chain to get catalyzed zyn alk

        else if((storage && storage.store[RESOURCE_ZYNTHIUM_OXIDE] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_OXIDE ||
            storage && storage.store[RESOURCE_ZYNTHIUM_OXIDE] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_OXIDE) &&
            terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM] + storage.store[RESOURCE_ZYNTHIUM] >= 1000) {
                lab1Input = RESOURCE_OXYGEN;
                lab2Input = RESOURCE_ZYNTHIUM;
                currentOutput = RESOURCE_ZYNTHIUM_OXIDE;
            }

        else if((storage && storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_ALKALIDE ||
            storage && storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_ALKALIDE) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_OXIDE] + storage.store[RESOURCE_ZYNTHIUM_OXIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_ZYNTHIUM_OXIDE;
                currentOutput = RESOURCE_ZYNTHIUM_ALKALIDE;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ALKALIDE] + storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_ZYNTHIUM_ALKALIDE;
                currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;
            }

        // chain to get catalyzed lemergium alkalide

        else if((storage && storage.store[RESOURCE_LEMERGIUM_OXIDE] < 1000 && currentOutput != RESOURCE_LEMERGIUM_OXIDE ||
            storage && storage.store[RESOURCE_LEMERGIUM_OXIDE] < 3000 && currentOutput == RESOURCE_LEMERGIUM_OXIDE) &&
            terminal.store[RESOURCE_LEMERGIUM] + storage.store[RESOURCE_LEMERGIUM] >= 1000 && terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000) {
                lab1Input = RESOURCE_LEMERGIUM
                lab2Input = RESOURCE_OXYGEN;
                currentOutput = RESOURCE_LEMERGIUM_OXIDE;
            }

        else if((storage && storage.store[RESOURCE_LEMERGIUM_ALKALIDE] < 1000 && currentOutput != RESOURCE_LEMERGIUM_ALKALIDE ||
            storage && storage.store[RESOURCE_LEMERGIUM_ALKALIDE] < 3000 && currentOutput == RESOURCE_LEMERGIUM_ALKALIDE) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_OXIDE] + storage.store[RESOURCE_LEMERGIUM_OXIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_LEMERGIUM_OXIDE;
                currentOutput = RESOURCE_LEMERGIUM_ALKALIDE;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ALKALIDE] + storage.store[RESOURCE_LEMERGIUM_ALKALIDE] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_LEMERGIUM_ALKALIDE;
                currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
            }



            // chain to get catalyzed ghodium alkalide
        else if((storage && storage.store[RESOURCE_ZYNTHIUM_KEANITE] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_KEANITE ||
            storage && storage.store[RESOURCE_ZYNTHIUM_KEANITE] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_KEANITE) &&
            terminal.store[RESOURCE_ZYNTHIUM] + storage.store[RESOURCE_ZYNTHIUM] >= 1000 && terminal.store[RESOURCE_KEANIUM] + storage.store[RESOURCE_KEANIUM] >= 1000) {
                lab1Input = RESOURCE_ZYNTHIUM
                lab2Input = RESOURCE_KEANIUM;
                currentOutput = RESOURCE_ZYNTHIUM_KEANITE;
            }

        else if((storage && storage.store[RESOURCE_UTRIUM_LEMERGITE] < 1000 && currentOutput != RESOURCE_UTRIUM_LEMERGITE ||
            storage && storage.store[RESOURCE_UTRIUM_LEMERGITE] < 3000 && currentOutput == RESOURCE_UTRIUM_LEMERGITE) &&
            terminal.store[RESOURCE_UTRIUM] + storage.store[RESOURCE_UTRIUM] >= 1000 && terminal.store[RESOURCE_LEMERGIUM] + storage.store[RESOURCE_LEMERGIUM] >= 1000) {
                lab1Input = RESOURCE_UTRIUM
                lab2Input = RESOURCE_LEMERGIUM;
                currentOutput = RESOURCE_UTRIUM_LEMERGITE;
            }

        else if((storage && storage.store[RESOURCE_GHODIUM] < 10000 && currentOutput != RESOURCE_GHODIUM ||
            storage && storage.store[RESOURCE_GHODIUM] < 20000 && currentOutput == RESOURCE_GHODIUM) &&
            terminal.store[RESOURCE_ZYNTHIUM_KEANITE] + storage.store[RESOURCE_ZYNTHIUM_KEANITE] >= 1000 && terminal.store[RESOURCE_UTRIUM_LEMERGITE] + storage.store[RESOURCE_UTRIUM_LEMERGITE] >= 1000) {
                lab1Input = RESOURCE_ZYNTHIUM_KEANITE
                lab2Input = RESOURCE_UTRIUM_LEMERGITE;
                currentOutput = RESOURCE_GHODIUM;
            }

        else if((storage && storage.store[RESOURCE_GHODIUM_OXIDE] < 1000 && currentOutput != RESOURCE_GHODIUM_OXIDE ||
            storage && storage.store[RESOURCE_GHODIUM_OXIDE] < 3000 && currentOutput == RESOURCE_GHODIUM_OXIDE) &&
            terminal.store[RESOURCE_GHODIUM] + storage.store[RESOURCE_GHODIUM] >= 1000 && terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000) {
                lab1Input = RESOURCE_GHODIUM
                lab2Input = RESOURCE_OXYGEN;
                currentOutput = RESOURCE_GHODIUM_OXIDE;
            }

        else if((storage && storage.store[RESOURCE_GHODIUM_ALKALIDE] < 1000 && currentOutput != RESOURCE_GHODIUM_ALKALIDE ||
            storage && storage.store[RESOURCE_GHODIUM_ALKALIDE] < 3000 && currentOutput == RESOURCE_GHODIUM_ALKALIDE) &&
            terminal.store[RESOURCE_GHODIUM_OXIDE] + storage.store[RESOURCE_GHODIUM_OXIDE] >= 1000 && terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000) {
                lab1Input = RESOURCE_GHODIUM_OXIDE;
                lab2Input = RESOURCE_HYDROXIDE;
                currentOutput = RESOURCE_GHODIUM_ALKALIDE;
            }

        // 10000 like every other T3 first pass. 3000 was a third of the others
        // and TOUGH is the boost the combat pairs need most.
        else if(storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] < 10000 &&
            terminal.store[RESOURCE_GHODIUM_ALKALIDE] + storage.store[RESOURCE_GHODIUM_ALKALIDE] >= 1000 && terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000) {
                lab1Input = RESOURCE_GHODIUM_ALKALIDE;
                lab2Input = RESOURCE_CATALYST;
                currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
            }

        // chain to get catalyzed keanium alkalide

        else if((storage && storage.store[RESOURCE_KEANIUM_OXIDE] < 1000 && currentOutput != RESOURCE_KEANIUM_OXIDE ||
            storage && storage.store[RESOURCE_KEANIUM_OXIDE] < 3000 && currentOutput == RESOURCE_KEANIUM_OXIDE) &&
            terminal.store[RESOURCE_KEANIUM] + storage.store[RESOURCE_KEANIUM] >= 1000 && terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000) {
                lab1Input = RESOURCE_KEANIUM
                lab2Input = RESOURCE_OXYGEN;
                currentOutput = RESOURCE_KEANIUM_OXIDE;
            }

        else if((storage && storage.store[RESOURCE_KEANIUM_ALKALIDE] < 1000 && currentOutput != RESOURCE_KEANIUM_ALKALIDE ||
            storage && storage.store[RESOURCE_KEANIUM_ALKALIDE] < 3000 && currentOutput == RESOURCE_KEANIUM_ALKALIDE) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_KEANIUM_OXIDE] + storage.store[RESOURCE_KEANIUM_OXIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_KEANIUM_OXIDE;
                currentOutput = RESOURCE_KEANIUM_ALKALIDE;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ALKALIDE] + storage.store[RESOURCE_KEANIUM_ALKALIDE] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_KEANIUM_ALKALIDE;
                currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
            }

        // chain to get catalyzed lemergium acid (XLH2O = REPAIR, non-combat:
        // moved down here from the top of the first pass)

        else if((storage && storage.store[RESOURCE_LEMERGIUM_HYDRIDE] < 1000 && currentOutput != RESOURCE_LEMERGIUM_HYDRIDE ||
            storage && storage.store[RESOURCE_LEMERGIUM_HYDRIDE] < 3000 && currentOutput == RESOURCE_LEMERGIUM_HYDRIDE) &&
            terminal.store[RESOURCE_LEMERGIUM] + storage.store[RESOURCE_LEMERGIUM] >= 1000 && terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000) {
                lab1Input = RESOURCE_LEMERGIUM
                lab2Input = RESOURCE_HYDROGEN;
                currentOutput = RESOURCE_LEMERGIUM_HYDRIDE;
            }

        else if((storage && storage.store[RESOURCE_LEMERGIUM_ACID] < 1000 && currentOutput != RESOURCE_LEMERGIUM_ACID ||
            storage && storage.store[RESOURCE_LEMERGIUM_ACID] < 3000 && currentOutput == RESOURCE_LEMERGIUM_ACID) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_HYDRIDE] + storage.store[RESOURCE_LEMERGIUM_HYDRIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_LEMERGIUM_HYDRIDE;
                currentOutput = RESOURCE_LEMERGIUM_ACID;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ACID] + storage.store[RESOURCE_LEMERGIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_LEMERGIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
            }







        // chain to get catalyzed KEAN acid

        else if((storage && storage.store[RESOURCE_KEANIUM_HYDRIDE] < 1000 && currentOutput != RESOURCE_KEANIUM_HYDRIDE ||
            storage && storage.store[RESOURCE_KEANIUM_HYDRIDE] < 3000 && currentOutput == RESOURCE_KEANIUM_HYDRIDE) &&
            terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000 && terminal.store[RESOURCE_KEANIUM] + storage.store[RESOURCE_KEANIUM] >= 1000) {
                lab1Input = RESOURCE_HYDROGEN;
                lab2Input = RESOURCE_KEANIUM;
                // H + K react to KH - this said KEANIUM_ACID, so the guard
                // above (which watches the KH stock) never saw the product it
                // was accumulating and the whole XKH2O chain was unreachable.
                currentOutput = RESOURCE_KEANIUM_HYDRIDE;
            }

        // input gate checks the HYDRIDE feedstock (mirrors the LA twin above),
        // not the acid itself - demanding 1000 KA to start making KA was
        // unsatisfiable from any cold start.
        // Combined store: EM dumps KA to the terminal and market sells it, so
        // a storage-only <1000 guard kept producing KA forever and never
        // reached the XKH2O rung.
        else if((storage && storeOf(room, RESOURCE_KEANIUM_ACID) < 1000 && currentOutput != RESOURCE_KEANIUM_ACID ||
            storage && storeOf(room, RESOURCE_KEANIUM_ACID) < 3000 && currentOutput == RESOURCE_KEANIUM_ACID) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_KEANIUM_HYDRIDE] + storage.store[RESOURCE_KEANIUM_HYDRIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_KEANIUM_HYDRIDE;
                currentOutput = RESOURCE_KEANIUM_ACID;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ACID] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ACID] + storage.store[RESOURCE_KEANIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_KEANIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_KEANIUM_ACID;
            }

        // chain to get catalyzed zyn acid

        else if((storage && storage.store[RESOURCE_ZYNTHIUM_HYDRIDE] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_HYDRIDE ||
            storage && storage.store[RESOURCE_ZYNTHIUM_HYDRIDE] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_HYDRIDE) &&
            terminal.store[RESOURCE_HYDROGEN] + storage.store[RESOURCE_HYDROGEN] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM] + storage.store[RESOURCE_ZYNTHIUM] >= 1000) {
                lab1Input = RESOURCE_HYDROGEN;
                lab2Input = RESOURCE_ZYNTHIUM;
                currentOutput = RESOURCE_ZYNTHIUM_HYDRIDE;
            }

        else if((storage && storage.store[RESOURCE_ZYNTHIUM_ACID] < 1000 && currentOutput != RESOURCE_ZYNTHIUM_ACID ||
            storage && storage.store[RESOURCE_ZYNTHIUM_ACID] < 3000 && currentOutput == RESOURCE_ZYNTHIUM_ACID) &&
            terminal.store[RESOURCE_HYDROXIDE] + storage.store[RESOURCE_HYDROXIDE] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_HYDRIDE] + storage.store[RESOURCE_ZYNTHIUM_HYDRIDE] >= 1000) {
                lab1Input = RESOURCE_HYDROXIDE
                lab2Input = RESOURCE_ZYNTHIUM_HYDRIDE;
                currentOutput = RESOURCE_ZYNTHIUM_ACID;
            }

        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] < 10000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ACID] + storage.store[RESOURCE_ZYNTHIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_ZYNTHIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
            }







        // 40K
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ACID] + storage.store[RESOURCE_LEMERGIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_LEMERGIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
            }
        else if(storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_UTRIUM_ACID] + storage.store[RESOURCE_UTRIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_UTRIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_UTRIUM_ACID;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ALKALIDE] + storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_ZYNTHIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ALKALIDE] + storage.store[RESOURCE_LEMERGIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_LEMERGIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ALKALIDE] + storage.store[RESOURCE_KEANIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_KEANIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ACID] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ACID] + storage.store[RESOURCE_KEANIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_KEANIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_KEANIUM_ACID;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] < 40000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ACID] + storage.store[RESOURCE_ZYNTHIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_ZYNTHIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
        }

        else if(storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] < 40000 &&
            terminal.store[RESOURCE_GHODIUM_ALKALIDE] + storage.store[RESOURCE_GHODIUM_ALKALIDE] >= 1000 && terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000) {
            lab1Input = RESOURCE_GHODIUM_ALKALIDE;
            lab2Input = RESOURCE_CATALYST;
            currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
        }

        // miner efficiency
        else if((storage && storage.store[RESOURCE_UTRIUM_OXIDE] < 1000 && currentOutput != RESOURCE_UTRIUM_OXIDE ||
        storage && storage.store[RESOURCE_UTRIUM_OXIDE] < 40000 && currentOutput == RESOURCE_UTRIUM_OXIDE) &&
        terminal.store[RESOURCE_OXYGEN] + storage.store[RESOURCE_OXYGEN] >= 1000 && terminal.store[RESOURCE_UTRIUM] + storage.store[RESOURCE_UTRIUM] >= 1000) {
            lab1Input = RESOURCE_OXYGEN;
            lab2Input = RESOURCE_UTRIUM;
            currentOutput = RESOURCE_UTRIUM_OXIDE;
        }


        // 50K
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] < 75000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ACID] + storage.store[RESOURCE_LEMERGIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_LEMERGIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
            }
        else if(storage && storage.store[RESOURCE_CATALYZED_UTRIUM_ACID] < 55000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_UTRIUM_ACID] + storage.store[RESOURCE_UTRIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_UTRIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_UTRIUM_ACID;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] < 50000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ALKALIDE] + storage.store[RESOURCE_ZYNTHIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_ZYNTHIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] < 55000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_LEMERGIUM_ALKALIDE] + storage.store[RESOURCE_LEMERGIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_LEMERGIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
        }
        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ALKALIDE] < 55000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ALKALIDE] + storage.store[RESOURCE_KEANIUM_ALKALIDE] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_KEANIUM_ALKALIDE;
            currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
        }
        // 50K top-up: these two used <35000, which is already satisfied by the
        // <40000 branches above, so the rungs were dead. Same band as XZHO2.
        else if(storage && storage.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID] < 50000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_ZYNTHIUM_ACID] + storage.store[RESOURCE_ZYNTHIUM_ACID] >= 1000) {
            lab1Input = RESOURCE_CATALYST;
            lab2Input = RESOURCE_ZYNTHIUM_ACID;
            currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
        }

        else if(storage && storage.store[RESOURCE_CATALYZED_GHODIUM_ALKALIDE] < 50000 &&
            terminal.store[RESOURCE_GHODIUM_ALKALIDE] + storage.store[RESOURCE_GHODIUM_ALKALIDE] >= 1000 && terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000) {
            lab1Input = RESOURCE_GHODIUM_ALKALIDE;
            lab2Input = RESOURCE_CATALYST;
            currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
        }


        else if(storage && storage.store[RESOURCE_CATALYZED_KEANIUM_ACID] < 25000 &&
            terminal.store[RESOURCE_CATALYST] + storage.store[RESOURCE_CATALYST] >= 1000 && terminal.store[RESOURCE_KEANIUM_ACID] + storage.store[RESOURCE_KEANIUM_ACID] >= 1000) {
                lab1Input = RESOURCE_CATALYST;
                lab2Input = RESOURCE_KEANIUM_ACID;
                currentOutput = RESOURCE_CATALYZED_KEANIUM_ACID;
            }



        if(room.memory.labs.status.lab1Input != lab1Input) {
            room.memory.labs.status.lab1Input = lab1Input;
        }
        if(room.memory.labs.status.lab2Input != lab2Input) {
            room.memory.labs.status.lab2Input = lab2Input;
        }
        if(room.memory.labs.status.currentOutput != currentOutput) {
            room.memory.labs.status.currentOutput = currentOutput;
        }
    }

    let currentOutput = room.memory.labs.status.currentOutput;
    let lab1Input = room.memory.labs.status.lab1Input;
    let lab2Input = room.memory.labs.status.lab2Input;



    // if(lab1Input === RESOURCE_HYDROGEN && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_HYDROGEN && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_HYDROXIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM && lab2Input === RESOURCE_KEANIUM || lab2Input === RESOURCE_ZYNTHIUM && lab1Input === RESOURCE_KEANIUM) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_KEANITE;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM && lab2Input === RESOURCE_LEMERGIUM || lab2Input === RESOURCE_UTRIUM && lab1Input === RESOURCE_LEMERGIUM) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_LEMERGITE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_KEANITE && lab2Input === RESOURCE_UTRIUM_LEMERGITE || lab2Input === RESOURCE_ZYNTHIUM_KEANITE && lab1Input === RESOURCE_UTRIUM_LEMERGITE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_UTRIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_UTRIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_KEANIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_KEANIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_LEMERGIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_LEMERGIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_ZYNTHIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_ZYNTHIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM && lab2Input === RESOURCE_HYDROGEN || lab2Input === RESOURCE_GHODIUM && lab1Input === RESOURCE_HYDROGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_HYDRIDE;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM && lab2Input === RESOURCE_OXYGEN || lab2Input === RESOURCE_GHODIUM && lab1Input === RESOURCE_OXYGEN) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_OXIDE;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_UTRIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_UTRIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_UTRIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_KEANIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_KEANIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_KEANIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_LEMERGIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_LEMERGIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_LEMERGIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_ZYNTHIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_ZYNTHIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_ZYNTHIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM_HYDRIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_GHODIUM_HYDRIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM_OXIDE && lab2Input === RESOURCE_HYDROXIDE || lab2Input === RESOURCE_GHODIUM_OXIDE && lab1Input === RESOURCE_HYDROXIDE) {
    //     room.memory.labs.status.currentOutput = RESOURCE_GHODIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_UTRIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_UTRIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_UTRIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_UTRIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_UTRIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_KEANIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_KEANIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_KEANIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_KEANIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_KEANIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_LEMERGIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_LEMERGIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_LEMERGIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_ZYNTHIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_ZYNTHIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_ZYNTHIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM_ACID && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_GHODIUM_ACID && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_GHODIUM_ACID;
    // }
    // else if(lab1Input === RESOURCE_GHODIUM_ALKALIDE && lab2Input === RESOURCE_CATALYST || lab2Input === RESOURCE_GHODIUM_ALKALIDE && lab1Input === RESOURCE_CATALYST) {
    //     room.memory.labs.status.currentOutput = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
    // }


    if(Game.cpu.bucket > 4500) {
        // Lab stores are restricted: argless getFreeCapacity() is null, so
        // `!= 0` was always true and runReaction fired into a full output lab.
        let outputLabs = [outputLab1, outputLab2, outputLab3, outputLab4, outputLab5, outputLab6, outputLab7, outputLab8];
        let boost = room.memory.labs.status.boost;
        for(let i = 1; i <= 8; i++) {
            let outputLab = outputLabs[i - 1];
            if(!outputLab || outputLab.cooldown != 0 || !(outputLab.store.getFreeCapacity(currentOutput) > 0)) {
                continue;
            }
            if(!inputLab1 || !(inputLab1.store[lab1Input] >= 5) || !inputLab2 || !(inputLab2.store[lab2Input] >= 5)) {
                continue;
            }
            // A missing slot is free. A present slot is free only with no live
            // claimant and nothing left to deliver. lab5 used to spell this
            // `!use` (so a slot with use undefined counted as free); every
            // writer stores a number there, so it now matches the other seven.
            let slot = boost && boost["lab" + i];
            if(slot && !(slot.use == 0 && (!slot.amount || slot.amount == 0))) {
                continue;
            }
            let paused = room.memory.labs.paused?.find((lab) => lab.id === outputLab.id && lab.timer > 0);
            if(paused) {
                paused.timer--;
            }
            else {
                outputLab.runReaction(inputLab1, inputLab2);
            }
        }
    }



    // if(resultLab.store[RESOURCE_UTRIUM_HYDRIDE] <= 2995 && firstLab.store[RESOURCE_UTRIUM] >= 5 && secondLab.store[RESOURCE_HYDROGEN] >= 5) {
    //     resultLab.runReaction(firstLab, secondLab);
    // }


}

export default labs;
// module.exports = market;
