# RCL4 leftover-5 release — leftover 5 only after storage STANDS

```
APPLIED IN SRC 2026-08-16T07:10Z. push-main + push-vps. NOT push-pacifist.
Cycle-18 dest unchanged. leftover-5 RCL3 hold stays lvl<=3 → 5.
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  skip leftover 5 forever
```

`extensionTake` L4 holds 5 until `room.storage.my`. Spawn→RCL4 Δ **0**.

True north: spawn→RCL8. Cheap loop spawn→RCL4 already stops the tick
`level === 4`. This knob is **after that stamp**.

---

## Live `extensionTake` (exact)

`src/utils/PlanV2.ts`:

```ts
export function extensionTake(lvl: number, engineCap: number, _room?: Room): number {
  if (engineCap <= 0) return 0;
  if (lvl <= 3) return Math.min(5, engineCap);
  return engineCap;
}
```

| lvl | take | `_room` |
| --- | ---: | --- |
| ≤3 | `min(5, engineCap)` | unused |
| ≥4 | **engine cap** (20 / 30 / …) | unused |

Comment says “Build them at RCL4 after storage.” Body does **not**
look at `room.storage`. Take flips the tick of 4, whether the box is
a site, standing, or missing.

Callers already pass `room`: `plannedTilesFor` (`PlanV2.ts:1106`),
`placeFromBasePlan` (`BasePlan.ts:502`), checkerboard `pathBuilder`
(`rooms.construction.ts:312`). `rcl3SecondExtWaveReady` is gone.

---

## Cycle-15 film — E13S7 dumped **15**, not 7

`run-2026-08-15T23-57-10Z` · `_cycle15-rcl4.md`. First cand L4
E13S7 **26926**. Tick **4724759** (~583 t after 4724176):

| | E13S7 |
| --- | --- |
| standing ext | **5** (15,18 / 19,14 / 14,13 / 14,15 / 14,17) |
| ext sites | **15** all 0/3000 |
| take | **20** |
| storage | site **(15,13)** 1605/30000 · standing **0** |
| other sites | rampart 1 · road 5 |
| sites Σ | **22** |

Same shape later (tick 4728085): E13S7 22, E11S6 **24**, E18S5 **24**.
Standing still 5 / cap 550. Energy storage-first (`findLocked`); ext
sites sit at 0 through the 30k. Hold through L3 is intact.

**Not** the 7-site BasePlan pack the older rec assumed.

---

## Why 15 while the box is still a *site*

Race rooms have no `planV2`. `construction()` does **not** return after
`placeFromBasePlan`. `storage` in that file is

`Game.getObjectById(Structures.storage) || room.findStorage()`

and `findStorage()` (`roomFunctions.ts:211–247`) is the **hub
container** until `room.storage.my`. A storage *site* is not
`room.storage`. So at the RCL4 DOBug pass (`_next-rcl4-cadence.md`):

1. `young = lvl < 4 || !room.storage` → **true**.
2. `placeFromBasePlan(room, 8)`: take **20**, order storage → skip
   container → **ext** → tower. First pack: **1 storage site + 7 ext**.
   2nd tower **0** slots. Stop at 8 created / 10 live.
3. Same function, later: `storage` = hub container. `lvl >= 4`
   (`construction.ts:1570–1571`) `pathBuilder(storageNeighbours,
   STRUCTURE_EXTENSION)` with **no 8/10 cap**. `extHave` 5+7=12,
   `extTake` 20, dumps the remaining **8**.
4. Same pass: roads around the hub, spawn ramparts.

Total: **15 ext sites + storage site + 5–6 road + 1–2 ramp = 22–24**.
Matches the film. `_next-site-cap.md` already counted this 22; it
did not name the hub-as-storage leak.

After `room.storage` stands, `young` flips off. `placeFromBasePlan`
stops. Checkerboard keeps running inside `construction()`, now on the
**1000-tick** refill. Live never waits for that refill for leftover 5
— they are already queued.

`findLocked` (`builder.ts:42–93`): storage/link → tower → ext. The
30k is built first. Siting is not energy-steal. It **is** a site-hog
and it starves the 2nd tower.

### planV2 (not this race set)

`PLACE_ORDER`: spawn → **storage** → tower → container → **extension**.
`maxSitesFor`: 4 until `room.storage.my`, then 8. 15-tick recycle.
Closer to policy. Race never enters `placeFromPlanV2`.

Policy (`_ext-policy.md`, `_rcl4-ext-when.md`): **After
`room.storage.my`, site the remaining 15. Not before.** Live energy
matches. Live *siting* on the race path does not.

---

## One knob (not applied — fence)

Layer: **`extensionTake`**. Both race placers already call it.
Construction-only (gate checkerboard on `room.storage.my`) leaves
BasePlan’s 7 queued with the site. Incomplete. Do not also edit
`PLACE_ORDER` / BasePlan order / cadence.

Gate **RCL4 only**. `room.storage` is standing `STRUCTURE_STORAGE`
(a site does not set it; the hub is not it). If `room` is omitted,
keep live engine cap — do **not** hold at 5 at RCL5+ / VPS rebuild
(`_next-rcl4-release.md` older hunk `if (!_room || !storage)` would
skip-forever when the caller forgot the arg).

```diff
 export function extensionTake(lvl: number, engineCap: number, room?: Room): number {
   if (engineCap <= 0) return 0;
   if (lvl <= 3) return Math.min(5, engineCap);
-  return engineCap;
+  // leftover 5 + 10 new only after storage STANDS. Site ≠ standing.
+  // No room → live (do not skip-forever). RCL5+ always engine cap.
+  if (lvl === 4 && room && !(room.storage && room.storage.my)) {
+    return Math.min(5, engineCap);
+  }
   return engineCap;
 }
```

Also bump the comment above the function: “after storage” becomes
`room.storage.my`, not the tick of 4.

Nested prefix stays `5 ⊂ 20 ⊂ 60`. Delay, not skip. After the box
stands, take=20, checkerboard (uncapped) dumps all 15 on the next
`construction()`. That next call is **0–999 t** later (`young` off,
interval 1000). Cadence option 1 (`placeFromBasePlan` while
`young || (lvl===4 && ext<20)`) is the refill fix — **later,
separate race**. Until-storage `interval=100` (`_next-rcl4-cadence.md`)
dies the tick the box stands. Does not replace this.

---

## Model

Costs: ext 3k, tower **5k**, storage 30k. Climb RCL4→5 = 405k.
Leftover 5 + 10 new = **45k**. 2×1W ≈ 10 progress/t.

| steal | live (take=20 at lvl 4) | after `storage.my` |
| --- | --- | --- |
| Storage **energy** | **No.** `findLocked` prefers the box. 15 ext sit at 0. | Same 30k first. |
| Storage **site** | **No.** BasePlan first. | Same. |
| Site **budget** | **Yes.** 22–24 in one room (15 ext + box + roads/ramps). | First pack: storage + 2nd tower + roads. Ext 0 until stand. |
| 2nd tower **site** | **Yes.** Ext before tower, 8 slots → storage+7 ext; checkerboard fills the rest. | Slots free. |
| 2nd tower **energy** | Only if a tower site exists (today often not). | If sited with the box: `findLocked` tower **before** leftover ext → **5k / 10 = 500 t** in front of the dump. |

800 still buys no 8W. First body that needs leftover 5 **plus** most
of the ten new is the **8W upgrader at ~18 ext**, after the box.

| clock | live (15 pre-queued) | stand-then-site |
| --- | --- | --- |
| spawn→RCL4 | **0** | **0** |
| time-to-storage-standing | ~30k / 10 ≈ 3k t | ~0 Δ |
| leftover-5 *sites* after box | **0 wait** — all 15 already queued | **0–999 t** (next `construction()`). planV2: ~15 t |
| leftover-5 *energy* after box | 15×3k can start the tick the box stands | same 45k, later start; **+500 t** if 2nd tower cuts in |
| spawn→RCL5 (controller only) | 45k off the 405k sooner | **0 to −**small |
| time-to-8W / 18 ext | 30k + 45k, no refill | **+0.5k…+2k** (lost pre-queue + optional 5k tower) |
| RCL8 60 ext | still happens | still happens |

Older rec said “lost 7-site 8W head start.” Film is **15**. Pre-queue
helps 8W more than the 7-site model. This knob is **worse** 8W / RCL8
start on the race path. It **is** the policy sentence and it frees
the 2nd-tower / 22-site hog.

---

## Race evidence (older)

### Cycle-9 E13S7 — sited storage+ext

`run-2026-08-15T18-32-26Z`. Cycle-9 KEEP is the *slot* fix
(`_rcl3-sites-roads.md`). 19:15Z L3 5 ext → RCL4 **25743** → 19:35Z
**20 ext**. Policy KEEP (release can fire). Not a leftover-5-at-RCL4
speed win. Honest clean leftover-5+6W: cycle-8 **29029 8/8**.

### Cycle-5 dirty 24512

`run-2026-08-15T12-13-10Z`. Cand RCL3 **11000** 8/8 (L3 sat at 5).
RCL4 **24512 7/8**. Dirt + drop E5S3. Do not beat 24512.

---

## Rec

- **Do not apply during cycle-16 seed.** 16 is 5W. This is the next
  *after-clock* one-knob, or later.
- **Not a spawn→RCL4 A/B.** Do not spend a fast-loop cycle on it.
- **Do not skip leftover 5.** Cycle-5 held them through RCL3;
  cycle-15 L4 sited 15 (standing still 5). They land. That is the lock.
- **`extensionTake` is the right layer.** Construction-only is the
  wrong half (checkerboard dump); BasePlan still queues 7 with the
  site. Do not patch both.
- Live energy is already after storage. Immediate *siting* is the
  8W pre-queue **and** the 22-site hog. Ship only if the next
  question is “2nd tower / site hog during the 30k,” filmed as
  spawn→RCL5 / time-to-8W / live site count — not spawn→RCL4.
- After apply: cand L4 with storage *site* must stay **ext sites = 0**,
  standing 5. After `room.storage.my`, take 20, 15 sites appear.
  If dump waits ~1000 t, that is cadence — do not “fix” it in the
  same commit.

Q1 still-build RCL8 set: **yes** (delay). Q2 800-cap / steal: **no
new body; can steal 5k + site-time from 8W**. Q3 room can still hit
RCL8: **yes**. Default critic: **SEND BACK** as a spawn→RCL4 keep;
**maybe SHIP** as a filmed RCL4→8 / 2nd-tower experiment.

Did **not**: src edit, `push-race`, seed, reset, revert, unclaim.
