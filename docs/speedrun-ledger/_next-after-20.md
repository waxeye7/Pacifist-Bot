# After cycle-20 — 21 already seeded

20 **FINAL CENSOR 3/8** `run-2026-08-16T08-58-29Z`. RCL4 **33334** vs **29053**. 5W process-pass. No KEEP.
21 **WATCHING** `run-2026-08-16T10-19-31Z` `cycle-21-rcl3-haul`. **Do not re-seed.** **Do not push-pacifist.**

---

# Archive

20 **WATCHING** `run-2026-08-16T08-58-29Z` `cycle-20-5w-only`. elapsed **~34.5k/40k**. **Will CENSOR.** **Do not seed.**

RCL3 **+2880** (18299 8/8 vs 15419 8/8) on dest leftover-5 + 5W process-pass + **no pave**. RCL2 **1320** vs **1500** (**−180**). RCL4 **29618** 1/8 E13S7 vs **29053** 8/8. leftover-5 **HOLD**. L2/L3 **0/0** roads. 5W hatch **PASS** (not a clock KEEP).

19 **CENSOR 5/8** dirty 5W (`WORK<4`) stands. Cargo still in dest: **miner-first** + **L4 strip**.

Mark **29029** / this-ctrl **31044** (or 20's **29053**). Never 24512.

## After 20 FINAL (endReason / elapsed≥40000 / RCL4 8/8)

**Do not KEEP 5W.** RCL3 already worse than ctrl. leftover-5 **policy stays**.

Next isolated (not now): **restore RCL3 haul-pave** on dest-20. 20 is the no-pave rematch (**+2880** RCL3). Cycle-9 lost unused sites; 18/19 paved **with cargo**. 21 is dest-20 + `paveNow`.

Dest-21:

| bit | dest-21 |
| --- | --- |
| leftover-5 `lvl<=3 → 5` | **keep** |
| 5W clamp+HOL | process-pass only — **not KEEP** |
| cheap-miner **WORK&lt;2** | **keep** |
| cheap-miner / miner-first **bestWORK** (not sum; 1W+1W ≠ 2W) | **keep** |
| no-RCL2-roads | **keep** |
| RCL3 haul-pave (`paveNow`) | **restore** (20 no-pave RCL3 **+2880**) |
| far-ctrl RCL2 depot | **stay gone** |
| miner-first / L4 strip | still cargo — isolate later |

Then (not now):

```
fnm exec --using 22 node tools/server/seed-clean.mjs --label cycle-21-rcl3-haul --tick-budget 40000 --note "restore RCL3 haul-pave; leftover-5; 5W clamp+HOL; cheap-miner WORK<2; bestWORK; no RCL2 roads"
```

`--swap`. Control `e839fc8`. Mark **29029** / this-ctrl **31044** (or 20's **29053**). Never 24512.

```
NEVER  seed
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  unclaim
NEVER  SSH
NEVER  src
```
