# After cycle-16 — SUPERSEDED

16 **FINAL CENSOR 7/8**. 17 CENSOR. 18 watching. Sticky+overlap **reverted in src** 07:10Z (not race dest).
Next isolated seed after 18: `_next-after-18.md` `cycle-N-5w-only`. **Do not seed now.**
Do **not** seed-clean cycle-16.

---

# After cycle-16 — archive

16 **ended** (`run-2026-08-16T03-18-19Z` `cycle-16-5w-real`). CENSOR 7/8.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim E36N57
NEVER  seed while 16 is watching
```

## After 16 is called (endReason / elapsed≥40000 / RCL4 8/8 both)

1. Revert **sticky + overlap** (`_cycle16-hygiene.md` §2).
   - sticky: `STICKY_SOURCE_RANGE` / `atMine` / `stickySrc` in `creepFunctions.ts`
   - overlap: `overlapReplaceWanted` / `cullOverlapShuttle` / `overlap4WQueued` / `overlapCull`
   - `rg` those names empty after.
2. **Keep** clamp skip + HOL exempt + leftover-5 + cheap-miner blackout heal.
3. Then seed **`cycle-17-5w-only`**. Not now.

Sister: `_cycle16-hygiene.md` §2, `_cycle16-stack.md`.
