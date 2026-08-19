# Next haul — after `run-2026-08-14T01-06-48Z`

Read-only review. No spawn/build edit. Not remotes. Not ext. Metric: mean ticks spawn→RCL4.

Live rungs (`rooms.spawning.ts`): first hauler `[C,M]` in `isRcl1Bootstrap` else `[C,C,M]` while `carriersInRoom==0`; then 1:1, cap `[4C,4M]` 400e, `MAX_HOME_CARRIERS_PER_SOURCE=3`, `+1` if `drainPressure.haul` (floor ≥3000 and not sink-limited). Producer pass queues miners then carriers **before** builders/upgraders (`:1301–1302`, `:1327–1328`).

Adversary (`_cycle0-adversary-spawn.md`): 2 sources × 3 × 400e = 2400e + 144 spawn ticks during the 135k, all in front of upgraders.

---

## 1. How many home carriers does a typical RCL2/RCL3 room actually queue?

**3/source is live on the far (and median) source after the 5W, not a room-wide 6.** Near source stays 1–2.

`homeCarriersWanted` (`:3840–3879`) + `getCarrierBody` (`:3692–3720`):

```
harvest = 2 * live WORK on that sourceId   (floor 4, cap 10)
roundTrip = 2L + 6                         (1:1 → 1 tick/tile loaded)
need = harvest * roundTrip * 1.35
want = ceil(need / (carry*50))             cap 3, minerFloor = miners
```

At `[4C,4M]`, per = 200. After 5W (`harvest=10`):

| L (spawn→source) | 2W want | 5W want |
| --- | --- | --- |
| ≤4 | 1 | 1 |
| 5–11 | 1 | 2 |
| 12–20 | 1–2 | **3** |
| ≥21 | 2–3 | **3** |

Bench `srcSteps` (proxy for `findPathTo`; plains, spawn≈anchor): one short 2–11 + one long 16–41 on almost every slot. Median source ≈12–13 → **want 3 after 5W**. Hard pair (E5S3 18+29, E9S1 3+41) is 3+3. Easy pair (E13S7 2+3, E21S4 3+5) is 1+2.

Live film `run-2026-08-14T01-06-48Z` (candidate, still RCL2, tick ~3.131e6):

| room | cap | CA | note |
| --- | --- | --- | --- |
| E13S9 | 400 (2W) | 2–3 | stacked on near `[10,23]`; far EM at `[19,6]` alone |
| E8S3 | 550 | 5 | spawn `[22,16]`, src `[22,24]`+`[44,35]` |
| E8S5 | 550 | 5–6 | src 13+25 |
| E4S7 | 550 | **6–7** | 5W + `pressure.haul`; cap is 3+1 per source |
| E3S5 | 550 | 4 | |
| E6S1 | 500 | 4 | not yet 5W |

**Typical after 550: 4–5, not 6.** 6–7 is live on a long pair once 5W + floor pile. RCL3 starts already at 550/5W, so that is the climb roster, not a late-RCL2 spike.

Adversary 2400e / 144t is **one generation of the cap**, not the 135k:

- 6 × `[4C,4M]` = 6 × 8 parts × 3 = 144 hatch ticks, 2400e inventory.
- Recycle at 5 live: `5×400/1500 = 1.33 e/t`. Spawn occupancy ≈ `5×24/1500 ≈ 8%` of the climb.
- 144t is the **initial fill** (plus each death), still HOL in front of the 4W. That part is true.

First body: RCL1 `[C,M]` (`:3682–3685`, `:3999–4001`). RCL2 first-in-room `[C,C,M]`. After that every add is the sized 1:1 (usually 4C). The room-global `carriersInRoom==0` check means source B never gets the small body.

`minerFloor = harvest.miners` (`:3874–3875`): a leftover 1W + 2W on one tile forces 2 haulers even at 4 e/t. Seen (E8S3 t=3129235: 4 EM, 5 CA).

---

## 2. Does pickup-lock make two haulers stack on one pile?

**Lock does not cause the stack. Closest-select + `pick(false)` fallback does. Lock fails to stop it.**

`acquireEnergyWithContainersAndOrDroppedEnergy` (`creepFunctions.ts:1453–1664`), default ON (`Features.ts` `pickupLock !== false`):

- 25t lock, claim `min(free, amt)`. Other haulers see unreserved only.
- Select is **closest** with `unreserved >= selectMin` (~25–50). Not amount. Not `memory.sourceId`.
- If every pile is reserved: `pick(false)` **walks to the same pile and claims 0** (`:1645–1654`). Explicit queue.
- Adjacent salvage (`:1511–1514`) ignores reservations and can steal the lock.

Two haulers on one pile when:

1. Pile leftover ≥ selectMin after the first claim (a 5W drop-mine grows 10 e/t; 200e pile + 200-cap first still leaves room once it ticks).
2. Fallback queue (everything reserved).
3. Adjacent steal on arrival.

Film: E13S9 carriers sit on `[9–11,25–31]` next to the near source while the far 2W at `[19,6]` has nobody. E4S7’s 7 CA cluster on the hub/near box; far EM at `[40,43]` is thin. Extra bodies buy spawn tax, not a second shuttle.

Miner side (`energyMiner.ts:187–214`, `:291–326`):

- No CARRY (live 2W / 5W): harvest-and-drop on the source tile.
- `[W,C,M]` bootstrap: `dumpMinerEnergy` — adjacent spawn/ext, else walk-in only if **no hauler in room** and spawn ≤8, else `drop()`. A CARRY miner cannot drop-mine; dump is a harvest skip.
- Hard-band far sources never walk in. One room-global hauler kills the walk-in for **both** sources.

Depot 550 (`carry.ts:152–158`) is a *delivery* floor (feed the 4W once spawn/ext hold 550). Not a pickup rule.

---

## 3. Is the spawn-count tax worse than fewer larger bodies on this set?

**Not vs 2:1, and not vs a bigger 1:1 at cap 550.** The tax that is real is *N heads in front of the 4W while extras stack*.

This set is low-swamp: 0–12% (pool mean 12.5%). 1:1 loaded is 1 t/tile on plains. 2:1 is still half-speed. Do not A/B the ratio.

Same total CARRY ⇒ same part-ticks (spawn time = 3 × parts). Splitting 600 carry into 3×`[4C,4M]` vs 2×`[6C,6M]` is the same 72 hatch ticks **if** you can buy the 600e body. At cap 550 you cannot: max 1:1 is `[5C,5M]` 500e — same as the parked 4W. That is why `maxCarryEarly=4` (`:3712–3714`). Raising the body is a 4W-HOL knob, not a haul-count knob.

What the small bodies actually cost on *this* set:

- Each extra `[4C,4M]` is 400e + 24t HOL, producer-pass, in front of upgraders.
- Throughput of the 3rd body is ~0 while pickup is closest-wins (Q2).
- Traffic on 1-wide enclosed sources (`minSourceFree` 1–2 on the hard band).

What they buy if pickup is sticky: L≥12 after 5W needs 3×200 to cover `10*(2L+6)*1.35`. Two bodies leave ~86e/trip on a median source (~2 e/t into a decaying pile). Then 3 is capacity, not tax.

**Verdict:** keep 1:1 and the 4C cap. The live waste is count × stack, not body size.

---

## 4. Ranked 3 haul A/Bs (one knob)

Do not bundle. Do not touch remotes or leftover-5.

### 1. `MAX_HOME_CARRIERS_PER_SOURCE` 3 → 2

**Why first.** One constant (`:3828`). Live extras already stack, so cutting the 3rd (and the `pressure.haul` 4th — leave that bit *off* this diff) is spawn tax with likely-flat throughput. E4S7 at 7 CA is the picture. Adversary 6×400e is the cap this hits.

**A/B.** `3` vs `2`. Leave 1:1, 4C cap, `pressure.haul`, `minerFloor` alone.

**Risk.** After a later sticky-pickup keep, far L≥12 at 5W is under-hauled. Re-open 3 then.

### 2. Source-sticky pickup

**Why.** `sourceId` is spawn accounting only. Film (E13S9, E4S7) is the far miner unserved. This is the handoff knob: the 2nd body has to walk to *its* pile/container (range 1–2 of that source), not `findClosestByRange` in the room.

**A/B.** Filter in `acquireEnergy…` when `memory.role=='carry' && memory.sourceId`. Leave lock TTL / reserve / fallback as they are.

**Risk.** A sticky hauler idles if its pile is empty and the other source is overflowing. That is the next measurement, not this diff.

### 3. Kill pickup fallback queue

**Why.** `pick(false)` (`:1645–1654`) is the line that *sends* a second hauler onto a reserved pile. Lock+reserve already stops crumb-thrash. The queue is the stack.

**A/B.** If `!target` after `pick(true)`, idle (`pickupIdle++`) instead of `pick(false)`. One branch.

**Risk.** A 5W pile with one 200-cap lock and 400e sitting: the 2nd hauler stands. Only pays if (1) already cut count, or (2) sticky is on and each source has its own pile.

---

Honorable, not top 3: `minerFloor = 1` (1W+2W double-staff); `pressure.haul` off; dump walk-in per-source instead of room-global hauler. Not 2:1. Not `[5C,5M]` at 550.
