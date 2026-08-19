# Critic — leftover-5 leak close + rec C

Implementer was the lead (independent critic died: disk full). Default SEND BACK.

## Verdict: **conditional SHIP of the leak close; rec C rides with it**

Not a two-knob bundle. Cycle-2 C was unmeasurable because legacy rooms ignored `extensionTake`. Closing the leak is how C becomes a test, not a second A/B.

## Future check

1. **Build leftover 5?** Yes. `lvl<=3 → 5`, RCL4+ → engine cap. Storage still first in PLACE_ORDER. Delay, not skip.
2. **Steal from a later climb for a dead cap?** No. Holds the 15k on 135k. 800 buys nothing. 1300 still happens at RCL4.
3. **RCL8 without rewrite?** Yes. Same 60 ext, just later.

## Diff (re-opened)

- `PlanV2.extensionTake` exported. `lvl<=3` min(5). `rcl3SecondExtWaveReady` gone.
- `BasePlan.placeFromBasePlan` caps ext via take.
- `rooms.construction` checkerboard counts built+sites, decrements on OK.

## Remaining leak

`findOpenSpotsForExtensions` (`rooms.construction.ts` ~1910) still fires `createConstructionSite(STRUCTURE_EXTENSION)` uncapped. Gated on `myLinks.length >= 4` (RCL5+). Not a leftover-5 hole on this race. Do not block on it.

No `PlanV2 → BasePlan` import. Cycle is `construction → PlanV2`, `construction → BasePlan → PlanV2`.

## Race

Do not push over cycle-4. After RCL4: revert 6W unless 8/8 win; push this; seed.

C: drive is **0 bytes free**. That is now the hygiene item.
