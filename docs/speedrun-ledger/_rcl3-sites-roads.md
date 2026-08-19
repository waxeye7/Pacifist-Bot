# RCL3 hold leftover 5 ext vs arterial road sites

Read-only rec. No code change this file. Clock: spawn → RCL4.

**Rec: hold leftover 5 is not site-budget compatible with RCL3 road siting. Keep road-suicide, and also stop siting roads at RCL3 (`roadsForRcl` → `[]` at `lvl === 3`). Empty road sites do not help the 135k climb; leftover 5 ext would, if sited, delay roads (good for slots) but spend 15k the controller wants (bad for the clock).**

---

## What the code does

Room budget: `maxSitesFor` (`src/utils/PlanV2.ts:32–36`) = **4** at RCL3 (5 only at RCL2; 8 only at RCL4+ with own storage). Recycle every 15 ticks (`src/Rooms/rooms.ts` → `placeFromPlanV2`). `spawnFirstLockdown` is irrelevant once a spawn is standing.

`typeAllowedAtRcl` (`:405–413`): roads `lvl >= 3`, ramparts `>= 4`, containers `>= 2`. Storage / terminal / link / lab / extractor / nuker / observer are engine-cap 0 at RCL3.

`PLACE_ORDER` (`:1016–1030`): spawn → storage → tower → container → extension → … → rampart → **road**. RCL3 uses this list, not `RCL2_ORDER`.

`extensionTake` (`:890–897`): RCL3 holds `take=5` until `rcl3SecondExtWaveReady` (own tower **and** controller depot). Then `take=10`. `_ext-policy.md` wants take=5 for the whole climb.

`roadsForRcl` (`:639–650`): empty below 3; at 3, `rcl3EcoAndTowerRoads` of the stage-3 arterial — hub→source / hub→controller chains, D8 of those containers, first-tower spur. Not extension faces, later-tower spurs, or leftover hub filler (`:520–529`). Cap is that selection's length, not a prefix of 20.

Builder (`src/Roles/builder.ts:106–117`): if RCL3 and every live site is a road, `suicide` and return. Spawn does not queue a roads-only builder (`src/Rooms/rooms.spawning.ts:1329–1333`). Sites are **not** removed.

---

## How many road tiles get sited after tower + containers

Steady state: spawn, 5 ext, 3 eco containers, 1 tower standing. Live sites 0. Budget 4. Loop skips spawn / storage(0) / tower / container / (ext if take=5) / terminal / link / rampart, then roads.

| leftover-5 policy | sites after tower+containers exist |
| --- | --- |
| **take=5** (hold / skip-to-RCL4) | **4 arterial eco+tower roads.** Stay at 0 progress. Next 15-tick pass sees `budget = 4 − 4 = 0` and returns. |
| **take=10** (dump / instant-10) | **0 roads.** 4 of the leftover 5 ext. After the 5th ext finishes, **then** 4 roads. |

Not "the whole arterial" (median stage-3 set was ~44 in older notes; eco+tower filter is smaller). Only **4** tiles, because that is the room cap.

First RCL3 pack, *before* tower+containers finish (have 5 ext + 1 source container):

- take=5: **tower + 2 leftover containers + 1 road**
- take=10 from tick 0: **tower + 2 leftover containers + 1 ext**

Live `9b3763f` is hold-then-dump, so the first pack already plants **one unused road** next to the three eco sites (`_cycle0-adversary-build.md`).

---

## 4 wasted global slots? Cap 70?

Engine global cap is **100** (`MAX_CONSTRUCTION_SITES`). The **70** is this bot's remotes reserve (`GLOBAL_SITE_CEILING` in `src/Rooms/rooms.construction.ts:2303–2309`, `:2377–2382`) so remote lines do not eat the last 30 from commune plans. Remotes themselves are RCL4+ on the speedrun path.

So: **4 wasted room slots, not 4 of 70.** One-room spawn→RCL4: remotes are off, global 100 is idle, the 4 empty roads only fill `maxSitesFor(3)`. Multi-room: 4 idle sites per RCL3 room do count against 100 / the 70 remotes gate. Not the clock.

---

## Does siting leftover 5 delay roads (good)?

Yes. take=10 occupies all 4 slots with extensions. Roads wait until those five finish.

That is good **only for the site budget** (slots stay on structures someone will build). It is **bad for spawn→RCL4**: 5×3k = 15k on the 135k (`_ext-policy.md`, `_ext-6w.md`). Builders do not suicide while ext sites exist.

Empty roads + suicide: **0 energy**, 4 dead slots. That **helps** the climb vs building the leftover 5. It does **not** help vs also not siting the roads — energy is the same, slots are cleaner.

---

## Hold leftover 5 AND suicide roads — what are the 4 sites on?

**Arterial eco+tower `STRUCTURE_ROAD` tiles.** First 4 of `roadsForRcl` (BFS order from the sitter along that subset). Typical pack: hub-proximal haul-chain tiles, maybe a container D8 face or the tower spur if those sort early.

They sit empty until RCL4. Builders recycle. At RCL4 the suicide gate lifts; `PLACE_ORDER` wants storage first, but `budget = 4 − 4 live roads = 0` until one road is finished or removed. Storage is after the clock stops (`_cycle0-adversary-build.md` already parked this).

---

## Compatibility

| combo | energy on 135k | 4 slots after tower+containers | spawn→RCL4 |
| --- | --- | --- | --- |
| hold 5 + keep siting roads + suicide | 0 (roads unbuilt) | 4 empty arterial roads | helps vs dump-15k; slots dirty |
| hold 5 + **stop siting roads** + suicide | 0 | **0** (budget idle) | **best** |
| site leftover 5 (delays roads) | 15k ext | 4 ext, then 4 roads | hurts |
| site leftover 5 + also pave | 15k + ~1.2k/4 roads if anyone builds | 4 ext then roads | worse |

Road-suicide without a road-site gate is the live hole: `e8ece9e` still sites the subset; `3cdcc08` refuses to build it; hold-ext hands the leftover budget to those unused tiles.

**Do not** keep siting leftover 5 just to "protect" the budget from roads. Stop siting the roads.

A/B already named in `_cycle0-adversary-build.md` #2: no-pave **and** `roadsForRcl` return `[]` at RCL3, vs pave the eco+tower subset. This note is that same pair, forced by hold-ext.
