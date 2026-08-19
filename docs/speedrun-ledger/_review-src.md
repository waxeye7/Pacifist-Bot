# Src review — uncommitted WC vs campaign

Read-only. Focus: `rooms.spawning.ts`, `rooms.construction.ts`, `BasePlan.ts`, `PlanV2.ts`.
Did **not**: edit src, push-race, seed, reset.

Campaign bar (REPORT + `_SURFACE`): haul **3**, recycle-200e **off**, leftover-5 through RCL3, no RCL3 BasePlan roads, no RCL2 source/depot boxes, 6W after 550, `fiveWQueued` one extra at 550.

---

## Campaign match

| knob | want | src now |
|---|---|---|
| recycle 200e shuttles | OFF (c7 SEND BACK) | **gone** — `recycleTinyShuttles` / `rewriteQueuedTinyShuttles` deleted. Census still skips suicidal upgraders (only TTL≤50 now). `recycleTinyCarriers` still on (tiny haulers @550, not the sent-back knob). |
| haul / source | **3** (c12 haul-2 SEND BACK) | **3** — `MAX_HOME_CARRIERS_PER_SOURCE = 3`. No leftover `= 2`. |
| leftover-5 | hold 5 all of RCL3 | **yes** — `extensionTake` is `lvl<=3 → 5`. `rcl3SecondExtWaveReady` (depot+tower release) removed. BasePlan + checkerboard both call it. |
| 6W after 550 | KEEP c4 | **yes** — `amount: cap>=550 ? 6 : 4`. |
| RCL1 HOL | SEND BACK c6 | **gone** — `isRcl1Bootstrap` / `hatchedHomeHauler` deleted. First hauler is `[C,C,M]`. |

---

## Bugs / leftovers

### 1. no-rcl2-boxes — partial. Hub + bin still slam.

Legacy **source** seats gated `level >= 3` (`construction.ts` `:1422`, `:1432`). Depot path `>= 3` (`:1269`) + `siteLegacyControllerDepot` is RCL3-only. Good.

Still RCL2:

- **Hub container** — BasePlan sites `STRUCTURE_CONTAINER` at `rcl>=2`. Construction dual-sites hub at `level==2 \|\| 3` (`:1132`).
- **Hub bin** — `energyCapacityAvailable > 500` sites a container at `storage.y+1` (`:1100`). `storage` here is `findStorage()` → hub container. Slam-5 makes cap 550 **while still RCL2**, so this is a second 5k box during slam.
- **PlanV2** still hands RCL2 the first source seat (`plannedTilesFor`: `lvl<3 ? 1 : early`, comment `:1097`). `typeAllowedAtRcl` container `>=2`. Race rooms miss the pack, so this is VPS/claim, not the 8-pair.

Cycle-15 snap already showed L2 cand with 2 live boxes (E12S3) / 1+2 sites (E18S9). Matches hub + bin, not the gated source seats.

### 2. Road hold `rcl<4` — BasePlan only.

- `BasePlan.ts:489` `STRUCTURE_ROAD && rcl<4 continue` — **correct** (c9 KEEP policy).
- Dead: `:521–526` shell-road filter also `rcl<4` — unreachable after the continue.
- Stale comment `construction.ts:744–746` still says BasePlan “queues roads from RCL3”.
- **PlanV2 still sites RCL3 roads** (`typeAllowedAtRcl` road `>=3`, `roadsForRcl` non-empty at 3). `_rcl3-sites-roads.md` wanted `roadsForRcl → []` at `lvl===3`. Race has no planV2, so the 8-pair is fine; adopted rooms still plant 4 empty arterials and starve the first RCL4 storage pack (`budget = 4 − 4 roads`).
- Young legacy: `basePlanRoadsActive=true` so pathBuilder lines stand down. OK.

### 3. `fiveWQueued` latch — stops the flood; not a 5W.

```4256:4268:src/Rooms/rooms.spawning.ts
if (… && !values.fiveWQueued && lastSpawn recent && !queued) {
  if (tiny && seats > 0) values.lastSpawn = 0;
}
// 550 branch: lastSpawn = Game.time; fiveWQueued = true;
```

- Latch is on `values` (Memory per source). Never cleared.
- Cycle-14 flood (WORK<5 after clamp-to-4W re-zeroed `lastSpawn` every tick) is closed. Cycle-15 film: 8/8 cand = **2 miners**.
- Extra body is **4W** (snap: every room clamp-4W, E18S9 4W+3W). Cap 550 can buy `5W+M`, but `clampSpawnListToCapacity` shrinks before hatch. Latch then treats that 4W as “the one extra.”
- **Burn:** if the extra is wiped (`idle-queue`, clamp drop, `-3/-14/-10`) while the 2W still lives, `minerOnTheWay` is true so stale-clear does not fire. Latch stays set, `lastSpawn` stays recent → no retry for ~1500t.
- **1-seat:** `getOpenPositions()` subtracts the sitting miner → `seats==0` → no overlap. Replacement waits on `lastSpawn` expiry.

### 4. Site strip labs/nuker — yes, and more.

`PlanV2.ts:2103–2113`: broke RCL6+ (`<30k/80k/150k`) `remove()` **every site except spawn**. Labs, nuker, roads, ext, towers. Matches the W1N1 “road/rampart-only was not enough” comment.

Holes:

- `maxSitesFor` already returns 0 when broke, so `budget<=0` is almost tautological. After `remove()`, budget is **not** recomputed; they `return` at `:2149`. Next tick idle until the bank recovers. Intended.
- **Spawnless + broke:** `liveSites` counts only spawn sites, `maxSitesFor` returns 1, `budget` can be `>0` → strip **does not run**. Leftover lab/nuker sites stay while spawn-first tries one slot.
- `queueBuilder` also ignores roads at RCL6+ (`:3462`). Complementary, not a strip.

Occupy/count split (`:2118–2135`) is the E39N58 fix: foreign spawn occupies the tile but does not fill the engine cap. `clearPlanSpawnTile` never runs on that tile (`placedSet[packed] continue` first). Destroy is attempted at the top of `placeFromPlanV2`; if it fails (enemy spawn) the plan seat is skipped and they may site `t.spawn[1]` (RCL7 seat) at RCL1–6.

---

## Not bugs (aligned)

- `recycleTinyShuttles` leftover: **none** in `src/`.
- Haul=2 leftover: **none**.
- Leftover-5 on the race path (no planV2): BasePlan + checkerboard both honor `extensionTake`. Cycle-15 cand all 5 ext; ctrl leaked 6/10.
- Young off-plan only-spawn retired (`migrateSpawns`, RCL≤3, no storage). Separate from the speedrun knobs.

---

## Verdict

Campaign haul=3 and recycle-off **hold**. Leftover-5 and 6W **hold**.

Still dirty vs the keep list:

1. RCL2 **hub + bin** (and PlanV2 first source seat) — cycle-10 not closed on every path.
2. PlanV2 **RCL3 roads** — cycle-9 only landed on BasePlan.
3. `fiveWQueued` is a **flood latch**, not a 5W overlap. Extra is clamp-4W; wipe burns the one shot.

No push-race. No src edit.
