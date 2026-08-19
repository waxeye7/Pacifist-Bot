# Steelman — instant leftover 5 ext at RCL3

Adversarial brief. Opposite of `_ext-policy.md` / the team rec (delay:
depot+tower first, or skip until RCL4). Owner question: *what's the benefit
of not building straight away? at some point we want/have to build it
right?*

Clock is spawn-placement → RCL4. 5×3k = **15k** on a **135k** climb
(~11%). Instant = `extensionTake` RCL3 always 10, no
`rcl3SecondExtWaveReady` gate. Live HEAD is hold-then-dump
(`PlanV2.ts:867–897`): take 5 until a tower **and** a controller depot
**stand**, then take 10.

No code change in this file. No measured A/B. Each channel is KEEP or
KILL as a reason instant is **faster to RCL4**.

---

## Live code the channels walk through

```32:36:src/utils/PlanV2.ts
function maxSitesFor(lvl: number, room?: Room): number {
  if (lvl === 2) return 5;
  if (lvl >= 4 && room && room.storage && room.storage.my) return 8;
  return MAX_SITES;
}
```

```890:897:src/utils/PlanV2.ts
function extensionTake(lvl: number, engineCap: number, room?: Room): number {
  if (engineCap <= 0) return 0;
  if (lvl <= 2) return Math.min(5, engineCap);
  if (lvl === 3) {
    if (room && rcl3SecondExtWaveReady(room)) return Math.min(10, engineCap);
    return Math.min(5, engineCap);
  }
  return engineCap;
}
```

`PLACE_ORDER` at RCL3 (`:1016–1029`): storage (cap 0) → tower → leftover
containers → extension → … → road. `RCL2_ORDER` does not apply.

`roadsForRcl` (`:639–651`) at RCL3 returns the eco+tower subset, **not**
`[]`. `placeFromPlanV2` (`:1737`, `:1786–1854`) never evicts a live site
to make room for a higher `PLACE_ORDER` type. `ConstructionSite.remove`
in this path is spawn-lockdown only (`:130–137`).

Builder `findLocked` (`builder.ts:53–117`): RCL3 depot site → tower site
→ **all ext** → leftover containers → if only roads, `suicide`. Spawning
does not queue a roads-only builder (`rooms.spawning.ts:1329–1333`).

---

## Channel 1 — cap 800 parks a 4W2C2M that out-upgrades 4W1C1M

**Claim:** `parkedUpgraderBody` at 800 is `getBody([W,W,C,M])` → two
300e segments = **4W2C2M / 600e**. That is faster than **4W1C1M / 500e**.

```3384:3390:src/Rooms/rooms.spawning.ts
function parkedUpgraderBody(room) {
    return room.energyCapacityAvailable >= 800
        ? getBody([WORK, WORK, CARRY, MOVE], room)
        : room.energyCapacityAvailable >= 550
            ? [WORK, WORK, WORK, WORK, CARRY, MOVE]
            : getBody([WORK, WORK, CARRY, MOVE], room);
}
```

`getBody` (`:3608–3612`): budget `floor(800*0.85)=680`, `floor(680/300)=2`.
600 ≤ 680, so the body **ships**. Same 4 WORK. Upgrade is 4 e/t either way.

Parked path is same-tick refill (`upgrader.ts:256–258`): upgrade first,
then `withdraw` when `store <= WORK`. A 50 tank and a 100 tank both stay
in the upgrade branch; they never hit store==0. **Zero rate delta** on a
park tile.

Park tiles exist. Planner depot is chebyshev ≤ 3 of the controller,
**exactly 3 preferred** (`layer-hub.mjs:1088–1094`, `:1101–1116`).
`depotPark` (`upgrader.ts:94–145`) wants D8 of the depot **and**
ctrl range ≤ 3. A range-3 seat still has ~3–5 legal parks. Roster is 4
(`spawnrules[3].upgrade_creep.amount`). Typical room parks everyone.

Unparked shuttle *would* care: 4W1C1M is 3 t/tile loaded / 50 tank
(~0.6 e/t on a 15-tile run); 4W2C2M is 2 t/tile / 100 tank (~2 e/t).
That only fires if `hasControllerDepot` is true (so we emit the parked
body) **and** `depotPark` returns null. Not the planned geometry.

HOL: `carry.ts:152–158` lets surplus leave the spawn network once
`energyAvailable >= 550`. Extra ext stay empty. 600 > 550, so every
4W2C2M replacement sits `-6` in the 550–599 band until interleave-10
(`rooms.spawning.ts:3098–3099`). The 550 4W (500e) does not.

**KILL** as a faster climb. Same 4 e/t when parked; HOL is a reason
**against** instant unless `parkedUpgraderBody` is pinned at `[4W,C,M]`
regardless of cap.

---

## Channel 2 — carriers / builders / fillers get bigger at 800

**Claim:** 800 buys bigger eco bodies whose extra throughput beats 15k.

| Role | RCL3 body | Grows at 800? |
| --- | --- | --- |
| Builder | `earlyBuilderBody` → `[W,2C,2M]` 300 (`:3371–3374`) | **No.** Hardcoded so `getBody([W,3C,M])` cannot stack to `[2W,6C,2M]`. |
| Shuttle upgrader | `[2W,2C,2M]` 400 at cap ≥ 550 (`:3377–3381`) | **No.** |
| Repair | `[W,C,M]` 200 (`:863–869`) | **No.** Comment is the 800 stack was HOL. |
| Filler | `[C,M]` 100 (`:857–860`) | **No.** v2 RCL3 has no hub container; `fillersWanted` returns 0 without a bank (`:3426–3437`, `findStorageContainer` is spawn-offset only). |
| Home carrier | 1:1, **cap 4C/4M = 400** (`:3708–3714`) | **No.** Explicit: else `[5C,5M]` at 550 / `[8C,8M]` at 800, HOL in front of the 4W. |
| Maintainer | `[4W,2M,4C]` 800 | **Not queued** (`:1359–1361`). |
| ControllerLinkFiller | — | RCL5+ (`:1850–1871`). |

**KILL.** The only bodies that change at 800 are channel 1 (same 4W, HOL)
and the miner (channel 6 / `_ext-6w.md`).

---

## Channel 3 — standing 5 at the RCL4 tick: 800→1300 is 10 ext, not 15

**Claim:** instant finishes the leftover 5 during the climb, so RCL4
storage-first starts at cap 800. Ten new ext, not fifteen.

True as arithmetic. **Irrelevant to this clock.** `CYCLE-0.md`: metric
stops when `controller.level` becomes 4. Post-RCL4 ext count does not
move mean ticks-to-RCL4.

RCL4 upgrader is `getBody([4W,C,M], 50)` (`:889–892`). At the RCL4
tick, **both** 550 and 800 emit one 500e 4W:

- cap 550, budget 467, `maxSegments=0`, then the “one oversize segment
  if it fits capacity” branch ships `[4W,C,M]`.
- cap 800, budget 680, `floor(680/500)=1` → same 4W.

The 8W stack is two 500e segments. That needs `floor(cap*0.85) ≥ 1000`
→ cap ≥ 1177 → **18 ext (1200)**. The leftover 5 are necessary later
and **not sufficient**. After storage you still build ~8–13 more before
8W hatches. `_ext-policy.md` “14 ext / 1000” is the body **cost**, not
what `getBody` will emit under the 85% clamp.

**KILL** for spawn→RCL4. KEEP only if the metric is later extended past
RCL4 (time-to-8W / RCL5). Even then storage-first +
`maxSitesFor(4)===8` after `room.storage` (`PlanV2.ts:34`) dumps the
wave on the 15-tick cadence; paying 15k **during** 135k to save 15k
**after** the clock is the wrong clock.

Owner “we have to build it”: yes — **after storage, on the RCL4
800→1300**. Not on the 135k.

---

## Channel 4 — holding at 5 gives the 4-site budget to roads nobody builds

**Claim:** delay sites roads; builders `suicide`; those sites pin the
budget so the dump (or RCL4 storage) cannot land. Instant sites the 5
**before** `PLACE_ORDER` reaches road, so the wave actually exists.

First RCL3 pass, 4 slots, 5 ext + 1 source container already standing:

| Policy | Sites |
| --- | --- |
| Instant | tower + 2 leftover containers (2nd source + depot) + **1 ext** |
| Hold / skip | tower + 2 leftover containers + **1 road** |

Builder still does depot, then tower, then ext. Instant does **not**
steal the depot’s site slot. The 4th slot is the fork.

`placeFromPlanV2` does not remove roads when `extensionTake` later
returns 10. After depot+tower **stand** (the dump predicate), leftover
slots are roads. `budget = 4 - liveSites = 0`. **Hold-then-dump cannot
site the 5.** Live dump == skip, plus four immortal road sites.

Builders on roads-only set `suicide` (`builder.ts:109–117`). Spawning
refuses a roads-only builder (`:1329–1333`). Nothing finishes those
sites. The 25k-tick sweep (`rooms.ts:395–401`) only drops sites in
rooms with no creeps.

RCL4 storage brick is **shared**: `maxSitesFor(4)` is 4 until
`room.storage` exists (`PlanV2.ts:32–35`). Four leftover road sites →
storage never sites → budget never becomes 8. Instant that **finishes**
the 5 mid-climb (~1500 ticks at 10 e/t) then fills the same 4 road
slots for the rest of the ~8k climb. Instant does not uniquely unbrick
RCL4.

**KEEP** as “instant is the only live path that actually **sites** the 5
during RCL3.” **KILL** as “therefore faster to RCL4.” Making a 15k tax
collectable is not a speed win. The real fix is `roadsForRcl === []` at
RCL3 (or evict lower-priority sites when a higher `PLACE_ORDER` type
wants a slot). That unbricks dump **and** RCL4 storage for every ext
policy.

---

## Channel 5 — empty extra ext starve the controller

**Claim:** capacity is free if we do not fill it. Or: fillers/carriers
will fill it and starve the 4W.

`energyCapacityAvailable` jumps +250 the tick the 5 stand. Empty ext do
not spend energy by existing.

Carriers (`carry.ts:112–164`): `baseIsFed` is false while any walkable
spawn/ext is hungry. RCL3 exception: if `energyAvailable >= 550` and
towers are at the depot floor, **surplus goes to the depot anyway**.
New ext can stay empty. First-fill of +250 is not required.

v2 RCL3 has no filler (no hub container / no storage). Channel is
carriers only.

Starve path that **is** real: FakeFiller / `findLocked` (`carry.ts:23–28`)
once the depot is full (`free < 200`). Surplus then tops leftover ext
(250e battery) instead of sitting in source containers. 250/16 e/t ≈ 16
ticks, one-time, and only after the depot — the parked 4W — is already
fed.

**KILL** as a controller-starve argument against instant (the 550 floor
is doing its job). **KILL** as an instant-win: a 250e battery does not
repay 15k.

Related spawn-buffer (not in the brief, same physics): after a 500e 4W,
cap 800 leaves ~300 in the network (need ~200 back to 500); cap 550
leaves ~50 (need ~450). ~12 ticks/hatch × ~26 hatches on an 8k climb ≈
80 ticks of earlier 4W time ≈ 1.3k extra progress. 15k construction is
9k–15k stolen from the controller (below). Net still negative.

---

## Channel 6 — a body with 550 < cost ≤ 800 that we actually spawn at RCL3

**Claim:** 800 unlocks a real rung.

Home miner (`:4112–4178`), `targetRoom == home`:

- cap 550–749 → `[5W,M]` = 550 (`:4166–4177`). 10 e/t. Source is
  already saturated (3000/300 = 10 e/t).
- cap ≥ 750 → queue `[2M,6W,M]` = **750** (`:4158–4160`).

RCL3 max is spawn+10 ext = 800, so the **queue** switches. Then
`clampSpawnListToCapacity`: EnergyMiner is routine (`:280–283`),
budget `floor(800*0.85)=680`, 750 > 680, shrink (`:358–376`): no
CARRY; `moves=3` is not `> ceil(6/2)`; drop WORK → **`[5W,3M]` = 650**.

The 6W miner **does not hatch at RCL3.** Need `floor(cap*0.85) ≥ 750` →
cap ≥ 883 → 12 ext (RCL4). `_ext-6w.md` killed 6W on yield (still 10
e/t) and walk payback (~50k ticks). Clamp makes that moot: live 800
buys a same-yield, **+100e** 5W3M.

Walk of 5W3M is 1 t/tile vs 3 t/tile for 5W1M. Same order as `_ext-6w.md`
(~0.3 e/t room-wide) minus extra spawn tax. Does not repay 15k on an 8k
climb.

Every other RCL3 body is ≤ 400, or the 600e 4W2C2M (channel 1), or the
unqueued 800e maintainer.

**KILL.** Stronger than `_ext-6w.md`: 800 does not even emit 6W.

---

## Extra channel the brief implied — 15k is “free surplus”

2 sources × 10 = 20 e/t. 4 parked 4W = 16 e/t. Surplus **4 e/t** after
the depot exists.

Instant’s 15k is spent **in that window**: builder prefers depot, then
tower, **then ext** (`builder.ts:53–94`). Two builders at 5 e/t = 10 e/t
construction. 4 of that is surplus, **6 is stolen from the controller**.
15k × 0.6 = 9k / 16 e/t ≈ **560 ticks** added to the climb (937 ticks
if you count the whole 15k). Channel 1+6+buffer do not make 560 ticks
back.

`drainPressure` / `pressure.burn` (`:1338–1345`, `:3488–3513`) already
turns floor surplus into **more upgraders** — the sink that moves this
clock. Instant ext compete with that sink.

Pre-depot, builders work the depot first anyway. Instant vs hold does
not change the 5k+3k eco. The 15k delta starts after the 4W parks.

If the roster A/B reverts to **2** upgraders (`_cycle0-adversary-spawn.md`
#1): surplus ≈ 12 e/t, two builders ≈ 10, instant is almost free — and
still buys no faster body. That is “cheap,” not “faster.”

**KILL** as an instant-win on the live roster of 4.

---

## KEEP / KILL card

| # | Instant-win claim | Verdict |
| --- | --- | --- |
| 1 | 4W2C2M > 4W1C1M | **KILL** (same 4 e/t parked; 600e HOL vs the 550 floor) |
| 2 | Bigger carry/builder/filler | **KILL** (all hard-capped) |
| 3 | RCL4 starts at 800 not 550 | **KILL** (clock already stopped; 8W wants ~18 ext anyway) |
| 4 | Road sites steal the 4-slot budget | **KEEP** as “only live way the 5 site at all”; **KILL** as faster-to-RCL4 |
| 5 | Empty ext are free / do not starve | **KILL** both ways (550 floor works; 250e battery ≠ 15k) |
| 6 | 550 < cost ≤ 800 body we spawn | **KILL** (6W clamped to 5W3M 650; 4W2C2M is #1) |

---

## Answer

**Instant is never the right rec for spawn→RCL4.**

800 is a dead cap on this bot: no extra WORK on the parked upgrader, no
bigger hauler/builder, no 6W miner (clamp), 15k spent in the exact
window the 4W is parked. Benefit of **not** building straight away: you
keep ~11% of the climb on the controller instead of five structures the
clock does not score.

**“We have to build them”** — after storage, with the RCL4 ten, on the
way to 18 ext / 8W. `PLACE_ORDER` already has that order. That is not an
argument for paying during 135k.

**“Build later but still before RCL4 finishes”** (live hold-then-dump)
is not a third speed policy. On live code it cannot dump (channel 4) and
is skip plus a storage brick. If you evict roads / stop siting them, dump
is skip **plus** a late 15k tax and **less** time at 800 than instant —
dominated by skip on this clock and by instant on a post-RCL4 clock.

Ranking for mean ticks-to-RCL4:

1. **Skip the 5 until RCL4** + `roadsForRcl([])` (or evict). Saves 15k.
   Unbricks storage.
2. Instant — only if someone later proves a 800-cap body that adds more
   than ~1 e/t for the rest of the climb, **or** the metric moves past
   RCL4. Neither is true today.
3. Hold-then-dump — do not ship as a speed rec.

A/B if anyone still wants to see it: `extensionTake` always 5 vs always
10, **with** RCL3 roads not sited, same builder order. Do not A/B
instant against live dump; dump is not a treatment.
