# Dest-24 — L4 strip isolation

Src only. **Not** push-pacifist / **not** push-race. Cycle-21
(`run-2026-08-16T10-19-31Z`) dest still compiled the strip. Dest-22
dest-cheap `=== 0` staged. Dest-23 miner-first `=== 0` staged.
Dest-21 watching — do not seed.

## Pick

**REVERT the strip. SEND BACK as dest-24.** `extensionTake` L4 hold
**stays.** Dump-at-4 *was* the 15-ext hog (cycle-15 E13S7 15 sites @ 0
while the box was still a site). That hog is the take gate, not
`site.remove()`.

| pick | knob | hog / future | call |
| --- | --- | --- | --- |
| A | KEEP `rooms.construction.ts` ~817–823 strip | belt on a hog take already owns; spawn→RCL4 Δ **0** | **SEND BACK** |
| **B** | **delete the strip** | take still `lvl===4 && !storage.my → 5`; leftover 15 after stand | **SHIP src after 21/22/23, not dest-21** |
| C | also revert `extensionTake` L4 hold | re-opens E13S7 15 + 22-site / 2nd-tower starve | **SEND BACK** — that is the hog |

Default critic: **SEND BACK revert** if the strip’s only brief is
dump-at-4 = 15-ext hog. It was.

## Why B, not A

`_next-rcl4-release.md`: construction-only is the **wrong half**.
Both race placers already pass `room`:

- `PlanV2.plannedTilesFor` → `extensionTake(..., room)`
- `BasePlan.placeFromBasePlan` (`BasePlan.ts:681`)
- checkerboard `pathBuilder` (`rooms.construction.ts:312`)

Take body (`PlanV2.ts:1147–1153`): `lvl<=3 → 5`; `lvl===4 && room &&
!(room.storage && room.storage.my) → 5`; else engine cap. No room →
live (do not skip-forever). Nested `5 ⊂ 20 ⊂ 60`. Delay, not skip.

Strip order in `construction()`:

1. `young = lvl < 4 || !room.storage` → `placeFromBasePlan` (take=5).
2. **Strip** all ext *sites* until `room.storage.my`.
3. Later `storage = findStorage()` (hub container). `lvl>=4`
   `pathBuilder(..., EXTENSION)` — also take=5, `extHave>=take` → 0.

With take live, step 3 does not re-dump 15. Strip only deletes
pre-queued leftovers. Cycle-21 film: no RCL3>5 path
(`_cycle21-leftover5.md`). Clean leftover-5 race has nothing to
strip.

Energy hog was already false: `findLocked` prefers the 30k; 15 sat
at 0 (`_next-rcl4-release.md`). Site-budget / 2nd-tower starve is
take (slots free when take stays 5). Spawn→RCL4 already stopped
the tick `level===4`. Cargo note (`_cycle19-stack.md` /
`_cycle20-stack.md`): **after the clock. Δ 0.**

E13S7 15 / live E36N57 10 were take-off dumps. 07:10Z applied take
(`WORKBENCH`); 07:25Z added strip on src (not dest). Isolating the
late belt as a clock KEEP is the pile.

## Future check (leftover-5 + RCL8)

Strip only. Does **not** touch `extensionTake`, leftover-5
`lvl<=3 → 5`, PLACE_ORDER, `maxSitesFor`, dest-22, dest-23.

1. **Build every RCL8 structure?** Yes. leftover-5 hold through L3.
   L4 still 5 until `room.storage.my` (site ≠ standing; hub ≠
   storage), then engine cap. 60 ext / storage / terminal / labs /
   towers / depot still happen. Revert strip does not skip-forever.
2. **Unlock a body / steal a later climb?** No. Revert does not site
   leftover 5 on 135k. Does not buy dead 800. 8W still needs ~18 ext
   **after** the box. Take already spent the 15-site pre-queue; strip
   is not a second 8W tax.
3. **Same room can still hit RCL8?** Yes. No rewrite required.

If leftover-5 leaks at L3, or L4 dumps ext *sites* before
`storage.my` after dest-22/23 — that is take / a placer forgetting
`room`, not a reason to KEEP the strip. Film spawn→RCL5 / time-to-8W
/ live site count, not spawn→RCL4.

Clock KEEP still needs RCL4 **8/8** vs **29029** / this-ctrl
**29053**. Never 24512.

## After 21 FINAL + dest-22 + dest-23

Do not seed dest-24 while 21 watches. Dest-22 first (dest-cheap
`=== 0`). Dest-23 (miner-first `=== 0`) if dest-22 ships. Then dest-24
is **delete the strip** if dest-23 ships. One knob. Do not KEEP L4
strip off a pile. Do not revert take in the same commit.

```
NEVER  push-pacifist while 21 watches
NEVER  npm run push-race
NEVER  seed
NEVER  git push
NEVER  SSH
NEVER  src this dest
```
