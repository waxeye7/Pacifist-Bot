# AGGRESSION DOCTRINE — "Wolf in Sheep's Clothing"

**Status:** design direction (binding). Much of the machinery below already
exists in the codebase; the **orchestration layer that ties it together does
not**. This document is the spec for that layer.

**Target platform: shard 3 ONLY.** ~20 CPU/tick, bucket 0–10000. Every design
decision here is subordinate to that budget. A tactic that is correct on shard 0
and unaffordable on shard 3 is wrong.

**See also `docs/AGGRESSION-HANDOFF.md`** — the decision record: the owner's
direction in their own words, what is settled vs still open, the calls made on
their behalf that want sign-off, and the list of traps in this codebase. Read
that first if you are picking this up cold.

---

## 0. Doctrine in one paragraph

The bot presents as a boring economic bot — clean base, no flags, no chest-
beating — and is in fact permanently at war with everything inside its reach.
It is **fully autonomous**: no human declares war, picks targets, or launches
nukes. **Everyone within reach is an enemy.** Reach is defined below and is not
negotiable per-player: there is no whitelist, no diplomacy, no truce state.
The bot's job is to be **maximally annoying and maximally productive** —
annoying meaning the enemy's economy never has a quiet tick, productive meaning
every creep sent out is expected to destroy more value than it cost.

The sheep's clothing is not passivity. It is **the home rooms staying boring**:
walls up, towers full, RCL climbing, no visible war effort. All the violence
happens in someone else's rooms.

---

## 1. Settled parameters (do not re-litigate)

| Parameter | Value |
|---|---|
| Shard | shard 3 only |
| Autonomy | fully autonomous — no operator input, ever |
| Diplomacy | none. Everyone is an enemy. No allies, no whitelist |
| Engagement radius | **5 rooms** (Chebyshev room distance) from any owned room |
| Engagement order | **closest rooms first**, always |
| Nuke radius | **10 rooms** from any owned room with a Nuker |
| Nuke policy | **repeatedly** — same target may be re-nuked every cooldown |
| War footing | non-military rooms throttle to **controller-upgrade intents only** |
| Sister bot | a separate bot slings resources. Out of scope. Only relevant as a starvation backstop if military CPU eats the economy |

**Engagement radius semantics.** A room is *in reach* if
`Game.map.getRoomLinearDistance(room, ownedRoom) <= 5` for at least one owned
room. Reach is recomputed when the owned-room set changes (claim, lose, GCL
tick), not every tick. Priority within reach is `min distance to any owned room`
ascending — closest is always worked first, and a newly-claimed room instantly
promotes everything around it.

**Nuke radius semantics.** `getRoomLinearDistance(target, nukerRoom) <= 10`
against an actual Nuker's room, not the empire centroid. Range 10 is the game's
hard nuke range; this rule simply says *if it is in range, it is a candidate*.

---

## 2. The aggression ladder (6 tiers)

Tiers are **not** a progression the bot climbs once. They are a menu; the
orchestrator picks the highest tier that is affordable **and** justified for
each target, independently, every planning pass. A tier-1 zone-of-control kill
and a tier-5 nuke can be in flight in the same tick against different rooms.

### Tier 1 — Zone of control
*Auto-kill anything that tries to earn money near home.*

- **Trigger:** any hostile reserver, claimer, miner, hauler, scout, or
  construction site in a room within reach, with no standing defence.
- **Response:** cheapest sufficient killer, spawned from the nearest room.
- **Intent:** the enemy learns that rooms near us do not pay. This is the
  highest-ROI tier by a wide margin and should account for most of the bot's
  offensive spawns.
- **Existing code:** `Guard` role (auto-spawned ×12 from `rooms.observe.ts`),
  `CCK` (ContinuousControllerKiller), `mosquito_attack.ts` harass engine.
- **Gap:** spawns are reactive and un-scored — see §4.

### Tier 2 — Harass
*Deny remote income without committing to a siege.*

- **Trigger:** an enemy is running remotes or has soft infrastructure
  (containers, roads, links, unwalled extensions) in reach.
- **Response:** small, cheap, persistent raiders that kill haulers/miners,
  break containers, and leave before towers matter. Rotate targets so the
  enemy never gets a clean rebuild window.
- **Intent:** annoying-as-hell tax. The enemy spends more repairing and
  rebuilding than we spend raiding.
- **Existing code:** `mosquito_manager.ts` + `mosquito_attack.ts` (583-line
  harass engine, already good).
- **Gap:** `mosquito_manager.ts:11` **hardcodes the room list** and gates on
  RCL8 + storage ≥ 10k. Must become target-driven off the intel DB (§4) and
  must work from any room that can afford the body.

### Tier 3 — Controller warfare
*Mass-CLAIM `attackController` to block safe mode and pin the downgrade timer.*

- **Trigger:** an owned enemy room in reach whose controller is reachable and
  whose towers cannot kill a self-healing CLAIM creep faster than we can
  replace it.
- **Response:** continuous `attackController` presence. Each CLAIM part removes
  300 downgrade ticks; the key effect is `upgradeBlocked`, which **prevents the
  enemy activating safe mode** and stops their upgrader progress dead.
- **Intent:** this is the strategic enabler for tiers 4–6. A room that cannot
  safe-mode is a room that can be breached and nuked on our schedule.
- **Existing code:** `CCK` role — the most-used auto-offence role, boosted
  XGHO2/XLHO2, self-heals, already implements the mass-CLAIM pattern.
- **Gap:** no orchestrator decides *which* rooms get sustained CCK pressure and
  keeps the pressure unbroken. CCK uptime is currently incidental.

### Tier 4 — Drain and breach
*Tower drain, then boosted quads through a min-cut hole.*

- **Trigger:** tier-3 pressure is established (`upgradeBlocked` sustained), and
  the target's value × vulnerability justifies the boost spend.
- **Response, in order:**
  1. **Drain** — tanky healed pairs sit in tower range, soak, retreat, repeat
     until the enemy's tower energy is gone and their fillers cannot keep up.
  2. **Breach** — min-cut the wall/rampart shell, dismantle the cheapest cut.
  3. **Kill** — boosted quad enters, kills spawns first, then towers, then
     storage/terminal.
- **Existing code:** `SquadCreepA` (quad leader, 1343 lines), `QuadSquadRun`
  two-pass runner, 2×2 formation cost matrix + rotation + partial retreat,
  `ram`/`signifer` boosted dismantle duo, full T3 boost pipeline with lab slot
  map and boost ledger, `calc_incoming_damage.ts` (tower falloff + boost table).
- **Gap:** these are components, not an operation. Nothing sequences
  drain → breach → kill, nothing owns the operation's lifecycle, nothing
  aborts and recovers boosts when the operation goes bad.

### Tier 5 — Nuke coordination
*Land nukes on schedule, repeatedly, timed to arrive with the ground force.*

- **Trigger:** any room within 10 of a Nuker room that is worth 300k energy +
  5k G, evaluated per launch. Repeat launches on the same target are explicitly
  allowed and expected.
- **Response:** launch at the enemy's **rebuild core** (spawns, labs, terminal,
  storage, nuker), not at empty rampart. Time landing to coincide with quad
  arrival where a ground force is committed; otherwise launch as pure attrition.
- **Existing code:** nuker **fill** (`energyManager.ts:706-726` — tops to 5k G /
  300k energy), `findNuker` cache (`roomFunctions.ts:96-101`), and **friendly
  nuke evacuation** (`creepFunctions.ts:511-547`, evacuates when
  `timeToLand < 300`), plus incoming-nuke handling in `rooms.defence.ts:427`.
- **Gap:** **there is no `launchNuke` call anywhere in the codebase.** The bot
  fills nukers and dodges nukes but has never fired one. Tier 5 is the single
  largest greenfield build in this doctrine.

### Tier 6 — Occupy or salt
*Decide what the corpse is worth.*

- **Occupy** if the room is worth holding: claimable, good sources, inside our
  defensive envelope, and we have the GCL. Claim it and it becomes a new home
  room — which immediately extends reach by 5 in every direction and promotes a
  fresh ring of targets.
- **Salt** if it is not: keep the controller permanently attacked so nobody
  else can settle it, strip the remaining resources, and leave it as a dead
  buffer zone.
- **Existing code:** claim/colonisation path exists for auto-expand;
  `clear_claimed_rooms.ts` is an **empty stub** (loop body blank).
- **Gap:** no occupy-vs-salt decision, no salt maintenance loop.

---

## 3. War footing — the throttle

**The rule, stated by the owner and binding:** when deploying a big aggression,
non-military rooms throttle down to the bare minimum. *"The only thing a room
NEEDS is intents on controller upgrade so they don't downgrade."*

### Room modes

Every owned room is in exactly one mode each tick:

| Mode | What runs | What stops |
|---|---|---|
| `NORMAL` | everything | — |
| `SUPPORT` | spawning for the war, boosting, terminal sends, minimal eco | construction, remotes, market, observers, non-essential repair |
| `SKELETON` | **controller upgrade intents only**, tower defence, rampart-critical repair | everything else: builders, remotes, market, labs (non-boost), observers, mosquito, mineral mining, link/lab churn |
| `FRONT` | full military: spawning, boosting, staging, squad running | eco beyond keeping spawns fed |

`SKELETON` is the war-footing state. A skeleton room's obligations are exactly:
1. Enough upgrader intent to hold the downgrade timer above a safety floor.
2. Towers defend if something walks in.
3. Ramparts above decay-critical HP.
Nothing else. A skeleton room burns near-zero CPU and near-zero energy, and all
freed CPU goes to military operations.

### Where this plugs into existing code

- **`src/utils/CpuPolicy.ts`** returns
  `{limit, bucket, bucketRatio, allowRemotes, maxRemotes, allowExpensive, economyOnly}`.
  **`economyOnly` is computed and never read anywhere in the codebase** — it is
  a free field. Repurpose it (or add `warFooting` / `roomMode`) as the throttle
  signal. This is the single cleanest hook available.
- **`src/main.ts:227`** sets `global._cpuPolicy` once per tick; `main.ts:248`
  already gates the mosquito phase on `allowExpensive`. The same pattern
  generalises: each phase asks the policy whether it runs this tick.
- **`src/Rooms/rooms.ts`** already gates subsystems on bucket — observers
  (`:341`, RCL8 + bucket ≥ 8000), labs (`:359`, every 10 ticks, RCL ≥ 6),
  construction (`:404`, bucket > 3500), the empire-wide remote panic valve
  (`:493-505`). Every one of these gates becomes `mode`-aware: in `SKELETON`
  they are simply off, regardless of bucket.
- **`room.memory.danger` / `danger_timer`** (`rooms.ts:87-103`) is the closest
  existing thing to a per-room war flag and is the natural place to hang mode.

### Throttle policy

- Mode is assigned by the orchestrator, not by each room independently.
- Rooms adjacent to the front become `SUPPORT`; distant rooms become
  `SKELETON`; the staging room becomes `FRONT`.
- **Downgrade safety floor is absolute.** A skeleton room that drifts toward its
  downgrade timer escalates itself back to `SUPPORT` regardless of the war. We
  never lose a room to save CPU.
- **Starvation backstop.** If skeleton rooms run their energy to zero, the
  sister resource bot can sling resources in. That is the safety net, not the
  plan — the doctrine still has to make war affordable on its own.
- Mode changes are **hysteretic** (minimum dwell time, e.g. 500 ticks) so rooms
  do not oscillate and thrash spawn queues.

---

## 4. The missing layer — what actually needs building

Everything below is the "thing that ties everything together." In rough
dependency order.

### 4.1 Persistent intel database
**Today:** `rooms.observe.ts` builds `observe.RoomsToSee` (~100 rooms), observes
one per interval, acts next tick, and **records almost nothing persistently**.
No scoring, no history, no segments.

**Needed:** a room record, persisted (RawMemory segments — not `Memory`, for
CPU), holding: owner, RCL, last-seen tick, tower count and estimated energy,
spawn count, storage/terminal contents estimate, wall/rampart min HP, nuke
history, safe-mode availability and cooldown, whether `upgradeBlocked` is
currently held by us, and our own operation history against it. Records decay in
confidence with age; stale records are re-scouted before commitment, never acted
on blind.

### 4.2 Target scoring
Score every in-reach room as roughly **value × vulnerability ÷ risk**, then sort
by `(score, -distance)` so ties break toward the closest room.

- **Value:** stored energy + minerals, RCL, income denied per tick, whether the
  room is claimable by us afterwards.
- **Vulnerability:** min-cut cost, tower count and energy, `upgradeBlocked`
  status (a safe-mode-blocked room is dramatically more vulnerable), whether the
  owner is active, whether they have responded to prior harassment.
- **Risk:** our CPU cost, our boost cost, retaliation exposure of the staging
  room, and — critically — **whether we can sustain it**. An operation we cannot
  sustain is worse than no operation.

### 4.3 Operations as state machines
An `Operation` is a persistent object: `{id, type, target, stagingRoom, state,
budget, creeps[], deadline}`. Types map to tiers: `ZONE`, `HARASS`,
`CONTROLLER`, `DRAIN`, `BREACH`, `NUKE`, `OCCUPY`, `SALT`.

Every operation must be able to: spawn its own creeps at a real priority, know
whether it is winning, **abort cleanly**, return unused boosts to the ledger,
and record the outcome to intel so the next scoring pass is smarter. Operations
have hard deadlines; an operation that has not achieved its state transition by
its deadline aborts rather than bleeding creeps forever.

**Concurrency is CPU-bounded, not ambition-bounded.** On shard 3, expect roughly:
many concurrent tier-1/2 operations (they are nearly free), **one** tier-4
breach at a time, and tier-5 launches scheduled around it.

### 4.4 Scored spawn priority
**Today:** `room.memory.spawn_list` is a flat array of `[body, name, opts]` and
priority is expressed *only* as `unshift` (jump the queue) vs `push` (append).
There is no numeric priority. With many concurrent operations competing for
spawn time, that breaks down immediately — head-of-line blocking will silently
starve the operation that matters most.

**Needed:** a numeric priority on every queue entry, with defence and
downgrade-prevention permanently outranking offence, and offence priority
inherited from its operation's score.

### 4.5 Staging discipline — the wolf's real constraint
**Boosted creeps cannot renew.** Body decay plus a long walk means an operation
that stages badly arrives with a fraction of its lifetime spent. Budget
**≤ ~800 ticks from spawn to contact**; prefer spawning from the closest room
that can afford the body even if it is not the best-boosted room, and stage
just outside the target's vision, not in it.

### 4.6 Retaliation doctrine
Being maximally annoying invites reprisal. The rule: **retaliation is automatic
and disproportionate.** Any player who attacks an owned room has every room they
own inside our 5-range promoted to the top of the target list, and every Nuker
in range starts launching at them. There is no de-escalation state — we do not
negotiate, and we do not stop because they stopped.

### 4.7 Turtle at home is a prerequisite, not a competing priority
The whole doctrine depends on home rooms being genuinely hard to kill while the
army is away. `rooms.defence.ts` already handles rampart HP targets, safe-mode
arming (`:590-601`), and incoming-nuke flags (`:427-433`). One live gap:
`DistressSignals.reinforce_me` is **set and cleared but has no consumer**
(`:522-557`) — a room asking for help is currently shouting into the void. That
needs a consumer before the empire is ever emptied out for an offensive.

---

## 5. CPU realism on shard 3

The whole doctrine lives or dies on this table. Rough budget at ~20 CPU/tick:

| Tier | Cost profile | Verdict |
|---|---|---|
| 1 Zone of control | ~free — a few creeps, simple pathing | Always on |
| 2 Harass | cheap — small creeps, existing engine | Always on |
| 3 Controller warfare | cheap per room; cost is *sustained spawn*, not CPU | Always on where justified |
| 4 Drain + breach | **expensive** — squad pathing, cost matrices, min-cut | One at a time, bucket-gated |
| 5 Nuke | cheap CPU, brutal resource cost | Gate on resources, not CPU |
| 6 Occupy / salt | occupy = full room cost; salt = cheap | Occupy only with GCL headroom |

Rules that follow:
- Tier 4 requires a bucket floor and yields to defence instantly.
- Intel scoring runs on an interval and is spread across ticks — never a
  full re-score in one tick.
- Min-cut is computed once per target and **cached to the intel record**, never
  recomputed per tick.
- Skeleton rooms are what pays for tier 4/5. That is the entire point of §3.

---

## 6. Build order

1. **Intel DB + scoring** (§4.1, §4.2) — everything else reads from it, and it
   is cheap and safe to build first.
2. **Room modes + war-footing throttle** (§3) — reuse the dead `economyOnly`
   field; this is what makes the rest affordable.
3. **Operation framework + scored spawn priority** (§4.3, §4.4) — the actual
   tie-together layer.
4. **Wire existing tiers into operations:** tier 1/2 first (`Guard`, `CCK`,
   mosquito — de-hardcode `mosquito_manager.ts:11`), then tier 3.
5. **Tier 4 as a sequenced operation** (drain → breach → kill) on top of the
   existing squad/boost machinery.
6. **Tier 5 nuke launch** — greenfield; nothing calls `launchNuke` today.
7. **Tier 6 occupy/salt** — fill in `clear_claimed_rooms.ts`.
8. **Consume `DistressSignals.reinforce_me`** (§4.7) before the first empire-
   wide offensive.

---

## 7. Build status

### Step 1 — intel DB + scoring — **LANDED, observe-only**

Lives in `src/War/`. Runs live as `phase("war", ...)` in `main.ts`. It records,
ranks and explains; it **issues no orders and changes no existing behaviour**.
That restraint is deliberate — the target list has to be provably sane on the
live shard before anything acts on it.

| File | What it does |
|---|---|
| `src/War/geo.ts` | Room-name ↔ world-coord math, Chebyshev distance, highway/SK/centre classification, `reachMap`. None of this existed anywhere in the bot before. Verified against an independent Chebyshev reference over 28,561 room pairs and all four quadrants. |
| `src/War/reach.ts` | `ownedRooms()` (the bot's first shared one — it was re-derived inline in ~21 places), the 5-range reach map, `groundTargets()` closest-first, `nukeCandidates()` at range 10 from real Nuker rooms. |
| `src/War/intel.ts` | The persistent room DB in **RawMemory segment 30**, heap-cached. Free ingest from `Game.rooms` (≤2 rooms/tick) plus capture of the observer's paint. |
| `src/War/score.ts` | value × vulnerability × distance-decay, tier suggestion per target, `scoutQueue()`, live-tunable constants. |
| `src/War/war.ts` | The phase entry plus the console surface. |

**Console:** `war()` `warTargets(n)` `warWhy(room)` `warIntel(room)` `warScouts(n)`
`warNukes()` `warGround()` `warHome()` `warDump()` `warAllies([...])`
`warTune(k,v)` `warSave()` `warOff()` / `warOn()`.

**Two deliberate design calls, recorded so they can be argued with:**

1. **"Closest first" is a decay multiplier, not a sort key.** Taken literally as
   a lexicographic key, a worthless adjacent room would outrank an RCL8 storage
   two rooms away forever. Distance is a strong multiplier instead
   (`1/(1+0.6d)`): at default tuning a room at range 5 must be worth ~2.5× a
   room at range 1 to outrank it. Tune with `warTune('decay', x)`.
2. **The three hardcoded allies survived, as data.**
   `rooms.observe.ts:222-226` has refused to engage `An1via`, `nanachi` and
   `nekey975` for as long as that code has existed. Doctrine §1 says everyone is
   an enemy, but deleting a standing non-aggression arrangement is a diplomatic
   act with consequences outside this repo, so it is surfaced as an editable
   list rather than silently removed. **`warAllies([])` makes the doctrine
   literal.** Until that is run, those three are still spared.

**CPU:** recording is capped at **4 rooms per tick across all callers** (a single
shared budget, not per-caller — `rooms.observe` gates its act tick on an
absolute `Game.time % interval`, so every RCL8 room reaches it on the *same*
tick and a per-caller limit would land N full `find(FIND_STRUCTURES)` sweeps
together). Scoring is cached 50 ticks and is not on the per-tick path at all —
only console commands call `targets()`. Segment writes are ≤1 per 100 ticks and
bucket-gated (≥5000). Not gated on `allowExpensive` — a war machine that goes
blind exactly when the bucket dips is worse than useless.

Measured: full 381-room scoring pass 0.154 ms, `scoutQueue` 0.048 ms,
table `JSON.parse` 0.115 ms, `stringify` 0.079 ms, `reachMap` (8 origins, r=5)
0.066 ms.

**Adversarial review outcome.** The segment state machine was tested against a
mock implementing real Screeps semantics (writes persist only for currently
active ids; `setActiveSegments` takes effect next tick). The worst case —
*an empty store overwriting good persisted data* — is provably prevented by
`saveIntel`'s `!loaded` guard, verified including the case where a competitor
holds all 10 slots for several ticks. Fixed during review:

- Recording from the observer was unbudgeted (2-8 CPU spike) → shared per-tick cap.
- `getActiveBodyparts` called up to 6× per hostile creep → one pass over `body`.
- `prune()` would have deleted every `patchIntel` record on the first save —
  those sit at `t = 0` by design, so `Game.time - 0 > FORGET_TICKS` was always
  true. Records carrying our own history (`atk`/`nk`/`nkn`/`ub`) are now exempt.
  This had no live effect yet but was a trap laid for tier 5.
- `warTune` accepted `NaN`/`Infinity` and negative `decay`, producing non-finite
  scores and an arbitrary `Array.sort` permutation → validated and clamped, plus
  a final `isFinite` guard on every score.
- `nukeCandidates()` listed our **own** colonies as nuke targets, and a room we
  *lost* kept `o = <us>` and scored as a target → added `myUsername()` and an
  owned-room exclusion.
- `scoutQueue`'s comparator returned `1` for both `cmp(a,b)` and `cmp(b,a)` when
  both ages were `Infinity` — i.e. the entire fresh-deploy case — silently
  breaking the closest-first contract.
- `targets()` did not filter unenterable rooms while `groundTargets()` did.
- Safe-mode rooms scored non-zero and cluttered the list.

**Incidental fix required by this step:** `AutoExpand` and `MapViz` each carried
a private copy of the segment-activation union that only unioned against
*last* tick's active set, so whichever ran last in a tick silently cancelled the
other's same-tick request (MapViz's own comment conceded it always lost). Both
now use the shared per-tick accumulator in `utils/Segments`, so activation order
no longer matters. This was not optional: with the private copies in place, the
war phase running last starved AutoExpand of segment 86 on 8/8 measured ticks,
which would have re-created the documented "sat in `picking` for 400+ ticks"
bug and broken plan adoption on every fresh claim.

`PlanAnimator`'s `setActiveSegments` is deliberately left as a hard replace —
arming the animator needs a clean slate for 89 + up to 10 data segments against
a cap of 10. It evicts the intel segment for one tick; `saveIntel` correctly
refuses to write while evicted and the slot is recovered on the next tick.

### Not yet wired (next)

- **Aiming the observer with `scoutQueue()`.** It is built and inspectable via
  `warScouts()`, but the observer still sweeps its static ±5 box round-robin
  (~800 ticks per full pass, and only ±4 for short room names). Pointing it at
  stale/unseen rooms closest-first is the obvious next win — but it changes
  which rooms get observed, and therefore which auto-Guard and formation
  responses fire, so it is a behaviour change and not part of an observe-only
  step.
- Steps 2-8 of §6 are untouched.

## 8. Out of scope

- **The sister resource bot.** It slings resources and is not this bot's
  concern. It exists in this document only as the starvation backstop noted in
  §3 — if military CPU starves the economy, resources arrive from outside.
- **Shards other than 3.** Not a target. Do not add cross-shard complexity.
- **Diplomacy, allies, whitelists, LOAN/alliance protocols.** There are none.
