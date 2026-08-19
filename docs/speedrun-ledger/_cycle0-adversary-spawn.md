# Cycle 0 — adversarial spawn review

Read-only. No spawn-policy edit. No docker. No commit. Live race
`run-2026-08-14T01-06-48Z` (16 rooms, target RCL4, `--swap` false) is a
baseline, not a keep-or-revert sheet. Metric: mean ticks spawn-placement →
RCL4. Nothing here is a measured win.

HEAD is `d6d3563`. `git log d6d3563..HEAD` is empty. Cycle-0
`feat(speedrun)` / spawn fixes land `bebf0ae` → `d6d3563`.

---

## Likely HELP mean ticks-to-RCL4

These remove HOL or fix a brick. Revert last.

- **RCL1–3 builder gate `EnergyMinersInRoom >= 1`**, not `carriers > 1 &&
  miners > 1`. One-source rooms could never build; two-source rooms sat on
  five idle extension sites until miner #2 *and* carrier #2 existed.
  `rooms.spawning.ts:1282`, `:1308`, `:1333`. `bebf0ae`.

- **`earlyBuildSlots` = `min(cap, useful, 2)`** (1 once only roads remain).
  Stops six 300e bodies stacking on four sites / pavement.
  `:3336–3346`, `:1282`, `:1308`, `:1331–1333`. `8e5357c` / `3cdcc08`.

- **`getBody` sizes off `energyCapacityAvailable`**, 85% stack, one oversize
  segment only if it fits. RCL2 no longer pins upgraders at one 300e
  segment for the whole level. `:3596–3633`. `f7ead4b`.

- **Home carriers sized to live miner WORK** (`2 * WORK`, floor 4, cap 10),
  not a phantom 6W / 12 e/t. First hauler still small.
  `:3636–3657`, `:3708–3719`, `:3840–3879`. `06a7842`.

- **RCL1–3 interleave after 10 consecutive `-6`**, not 40.
  `:307–308`, `:3098–3099`. A 500e 4W no longer idles a full cheap creep.
  `6dd763c`. Residual risk: it spends the energy the head is accumulating
  (see speculation).

- **RCL2 shuttle `[2W,2C,2M]`**, not parked `[4W,C,M]`. No controller
  depot until RCL3. 5 non-MOVE / 1 MOVE is 3 ticks/tile and a 50e tank.
  `:804–808`, `:3377–3381`. `922970c`. Math is not speculation.

- **RCL3 parks 4W only after the depot exists**; builders finish that
  container before leftover extensions. `:847–852`, `:3384–3414`,
  `builder.ts:53–70`. `4a824e8`. Help *if* the depot actually lands in the
  first third of the 135k (see #1).

- **Drop the RCL3 800e maintainer.** Arterials hit 2000 hits ~3000 ticks
  into the climb; body HOL-blocks a 500e 4W. `:1359–1361`. `081d2c2`.

- **RCL3 repairer stays `[W,C,M]`**, queues *after* eco, only when a
  container/road is 1000 hits down. `:862–869`, `:1352–1357`,
  `:3357–3362`. `4e49200` / `b960a46`.

- **`ControllerLinkFiller` is RCL5+ link-only.** Old gate was
  `Structures.controllerLink && level >= 3`; that key is a *container*
  below RCL7, so RCL3/4 unshifted a 250–500e `[4C,M]` in front of the
  parked 4W. `:1850–1871`. `7117746`.

- **RCL1–3 sweepers ignore source-adjacent drop-mine piles.** `:2684–2693`.
  `811a37d`.

- **RCL1–3 builders `[W,2C,2M]`** (300e, 2 ticks/tile loaded), not
  `[W,3C,M]` / a 600e `getBody` stack at cap 800. `:3371–3374`. `c634bc7`.

- **RCL1 wants 1 upgrader, not 2.** Controller wants 200. Income is 2–4
  e/t; a second 250e body is spawn tax, not sink. `:776–779`. `dcdd6a1`
  (RCL1 half only).

- **First filler waits until the bank can load it** (`fillersWanted`:
  real storage <200e → 0; hub container only if ≥100e *and* hungry).
  `:3417–3450`. `ddd6a6f`. Almost off the RCL4 *clock* (storage is an RCL4
  structure). Still removes a 300e unshift if a hub container exists.

- **RCL3 does not queue a roads-only builder**; leftover builders
  `suicide` once only roads remain. `:1329–1333`, `builder.ts:107–117`.
  `3cdcc08`. 1:1 haulers already walk plains at 1 tick/tile. This
  benchmark set is low-swamp (0–12%).

---

## Might HURT mean ticks-to-RCL4

- **RCL1 harvest-to-spawn does not do what the ledger claims in a
  2-source room — and every benchmark room is 2-source.**

  Opening 300 is supposed to buy `[W,C,M]` (200) + `[C,M]` (100).
  `spawn_energy_miner` walks *every* home source and `unshift`es. Source
  A (no miner yet) gets `[W,C,M]` (`:4194–4196`). Source B sees
  `homeHasMiner` already true and gets `[W,W,M]` 250 (`:4198–4199`).
  Second `unshift` puts the 250e 2W at the head. Spawn spends 300 on
  source B; leftover 50 cannot buy the 200 *or* the 100. The `[C,M]`
  waits on regen + interleave.

  Then the 1W's `lastSpawn = Game.time - (CREEP_LIFE_TIME - 100)`
  (`:4207–4210`) queues a **third** miner ~100 ticks later while the 1W
  still has ~1400 TTL. RCL1 needs 200 progress. Three miners + one
  50-carry hauler is the opposite of "first energy ~100 ticks sooner."

  `dumpMinerEnergy` (`energyMiner.ts:187–214`) only walks a load in when
  RCL≤2, no hauler, spawn ≤8. Hard-band `srcStepsSum` is 21–47; the far
  source always drops. A CARRY miner cannot drop-mine — dump is a harvest
  skip. On a far source `[W,W,M]` drop-mine is the better first body.

  Dead fallback: `!lastSpawn && Game.time < CREEP_LIFE_TIME` still
  unshifts `[W,W,M]` (`:4294–4299`). This race seeds at tick ~3.12e6 so
  it is inert. A tick-0 world would skip the bootstrap rung
  (`Game.time - 0 > 1500` is false) and ship the 250e drop-miner.

- **RCL3 roster 4 upgraders** (`:844–846`, was 2). 135k is most of the
  clock. 4× parked 4W = 16 e/t; two sources = 20 e/t, so the sink *can*
  match income — **only after the depot exists and is fed**. Until then
  they are four shuttle `[2W,2C,2M]` (claimed ~1 e/t each). Four 450e
  shuttles + two 300e builders + up to three `[4C,4M]` per source is a
  spawn queue, not a controller. `pressure.burn` can add up to +4 more
  (`:1342`, `:3588`). If the depot is late, this is 4–8 empty shuttles
  HOL-blocking the depot builder.

- **Remotes open at RCL4, not RCL3** (`:1186–1202`,
  `rooms.remotes.ts:223–239`). The metric *stops at RCL4*, so a remote
  that opens at 4 cannot help the clock. The change is "no RCL3 remote."
  Unreserved 5 e/t after a 50–80 tile walk is a losing trade against a
  500e 4W. A *short* adjacent remote (this set has near-source rooms:
  E6S1 `srcStepsSum` 14, E13S7 5) is the only plausible exception, and
  even then the bodies walk off-room during the climb. Default
  `disableRemotes` is unset; `enableRemotes()` still prints "RCL3+"
  (`Speedrun.ts:168`) — stale.

- **Pre-road 1:1 CARRY:MOVE + `[4C,4M]` cap** (`:3698–3714`,
  `:3873–3876`). Right walk on plains. Split across up to 3 bodies/source
  (`MAX_HOME_CARRIERS_PER_SOURCE`). Two sources × 3 × 400e = 2400e and
  ~144 spawn ticks of haul during the 135k, all still in front of
  upgraders on the producer pass (`:1327–1328` miners/carriers before
  builders/upgraders). One 800e 2:1 body was also wrong (2 ticks/tile on
  dirt). The *cap* may have over-corrected into spawn-count tax.

- **Depot feed at a 550e spawn floor** (`carry.ts:152–158`). Leftover
  five extensions used to keep `baseIsFed` false for the whole climb, so
  the 4W shuttled. Floor 550 lets a 5W miner / 500e 4W hatch. At cap 800
  the parked body becomes `getBody([W,W,C,M])` → `[4W,2C,2M]` = **600e**
  (`:3385–3387`). Available hovering 550–599 HOL-blocks that body.
  Interleave-10 is the only relief.

- **Tower before the second-source container** (`builder.ts:83–93`).
  3k tower vs 5k buffer. Tower does not move the RCL4 clock. Second
  source overflows on the floor (carriers already haul piles; still
  decay + extra walk). Safety guardrail, not a speed hypothesis.

---

## Unmeasured speculation

Do not keep or revert on these.

- Interleave-10 vs a 500e head: helps a jammed queue; may keep the 4W
  from ever hatching if cheap creeps refill `energyAvailable` every 10
  ticks.

- RCL3 no-pave on the 10–12% swamp median pair (B4). 1:1 is still 5
  ticks/tile loaded on swamp. This set is mostly plains; do not
  generalise to a swamp-heavy shard.

- Colony supporter body (`577612f`). Irrelevant to *this* 16-room seed
  (spawns are placed). Matters for a claim→RCL4 sample later.

- Remotes-off flag (`325702d`). Infra for a later A/B. Default is remotes
  *on* at RCL4. Closing already-active remotes every tick is correct;
  it is not a speed change until someone sets the flag.

- `roadsForRcl` eco-only subset. Construction, not spawn. Interacts with
  "RCL3 does not pave" only if sites still exist.

- First-filler / CLF / RCL4 maintainer. Clock stops when the controller
  hits 4, before storage/links/shell pay.

- Live race shape at last poll (cand leaner creep counts, some faster
  RCL2, `--swap` false, pair-distance warnings, incomplete RCL3/4):
  **not a result.** Control RCL1 13–19 creeps vs cand 7–16 is consistent
  with "less HOL tax," not proof of mean RCL4.

---

## Ranked 3 to A/B or revert after this baseline

One knob each. Do not bundle a keep (builder gate, `getBody` capacity,
no 800e maintainer, CLF RCL5+) into these diffs.

### 1. RCL3 upgrader roster: 4 vs 2

**Why first.** 135k is most of mean ticks-to-RCL4. 2 → 4 is the largest
intentional spawn-tax / sink-size bet in the cycle. It only pays if the
depot exists, carriers feed it (`carry.ts:152–158`), and the body is the
parked 4W (`:847–852`) — three later commits stacked on this one. If the
baseline looks slow on the climb with full extensions and a dry depot,
revert `dcdd6a1`'s `amount: 4` (`:846`) to 2 *before* touching depot
order.

**A/B.** `spawnrules[3].upgrade_creep.amount` 4 vs 2. Leave shuttle-vs-
park and depot-first builder alone so the roster is the only delta.

**Revert unit.** `dcdd6a1` (keep the RCL1 `amount: 1` half — that is a
different clock).

### 2. RCL1 harvest-to-spawn bundle

**Why.** Stated hypothesis ("first energy ~100 ticks sooner") is false
for a 2-source room: head-of-line is a 250e second-source drop-miner,
then a 2W replacement at T+100 while the 1W lives
(`:4194–4210`, `:4035–4037` loop). Far sources (hard band) never take
the walk-in path (`energyMiner.ts:192–214`). Easy rooms with a source
inside 8 of the spawn are the only place the 200+100 split can pay.

**A/B, in order, do not flip all three at once:**

1. Stop source B getting `[W,W,M]` during bootstrap: one home miner
   until the `[C,M]` hatches (`homeHasMiner` currently *causes* the
   second 250e body).
2. Drop `lastSpawn = Game.time - (CREEP_LIFE_TIME - 100)` (`:4207–4210`).
3. Only then A/B `[W,C,M]`+`[C,M]`+`dumpMinerEnergy` vs old
   `[W,W,M]`+`[C,C,M]`.

**Revert unit.** `32b151f` (and delete the tick-0 `[W,W,M]` fallback at
`:4294–4299` if that commit stays — it undoes bootstrap on a fresh
world).

### 3. Remotes open at RCL4 vs RCL3

**Why.** Discrete, same floor in spawn + `manageRemotes` + roads +
retarget. Cannot help the RCL4 clock by construction; can only avoid
spawn-steal. Control (`e839fc8`) opened at RCL3. If this baseline's
1-source-shaped rooms (near pair, short exit) lose to control on the
climb with idle spawn, the floor is the suspect. If spawn is busy on
4W and remotes are closed, keep it.

**A/B.** `remotesAllowed` / `manageRemotes` floor `>= 4` vs `>= 3`
(`rooms.spawning.ts:1189–1192`, `rooms.remotes.ts:229`). Do not use
`disableRemotes()` for this — that closes at *every* RCL.

**Revert unit.** `e1c4728`.

---

Honorable mention, not top 3: `[4C,4M]` cap + 1:1 (`d6d3563` +
`64a27be`) if RCL3 spawn time is haul-saturated (6 home carriers in
front of the 4W). Depot@550 vs 600e `[4W,2C,2M]` (`4951b9c` +
`:3385–3387`) if rooms sit at 550–599 with a dry 4W.
