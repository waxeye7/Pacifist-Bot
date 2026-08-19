# Ready — adopt 16 bench plans (candidate only)

Do **not** run `--write` now. Cycle-15 (`run-2026-08-15T23-57-10Z`) is still
watching. Script refuses `--write` until `_SPEEDRUN-STATE.txt` is no longer
`*-watching`.

One knob vs leftover-5+6W+no-rcl2-boxes **BasePlan**. Spec: `_next-adopt-plans.md`.

---

## Command

```powershell
# anytime (safe): dest/user/16-hub/scores; writes nothing
fnm exec --using 22 node tools/server/adopt-bench-plans.mjs --dry-run

# BETWEEN races only — after cycle-15 keep/revert, before cycle-16 seed
fnm exec --using 22 node tools/server/adopt-bench-plans.mjs --write
```

`--write` POSTs **pacifist** segments **80–86** (`bench: true`, all 16) and
`Memory.features.autoExpand = false`. Then seed:

```powershell
fnm exec --using 22 node tools/server/race.mjs --seed --wipe --yes --swap `
  --label "cycle-16-adopt-plans" `
  --note "candidate v2 pack vs leftover-5+6W+no-rcl2-boxes BasePlan" `
  --target-rcl 4 --tick-budget 40000
```

Alternate `--swap` across the cycle. Same pack either way.

---

## Rooms (`1f90aub`)

All 16 live in `tools/plan-suite/out-v2/plans-hub.json` (do not rewrite).
Dry-run 2026-08-16: **16/16**, dest `pserver`, user `pacifist` (`pacifist1`),
CTRL 86 empty.

| room | pack | score | hard | own |
| --- | ---: | ---: | ---: | --- |
| E5S3 | 80 | −61.32 | +0.614 | cand-swap |
| E9S1 | 80 | −49.20 | +0.631 | cand-default |
| E12S3 | 80 | −47.48 | +0.641 | cand-swap |
| E13S9 | 81 | −52.80 | +0.203 | cand-default |
| E18S9 | 81 | −67.40 | +0.357 | cand-swap |
| E8S5 | 81 | −128.40 | +0.349 | cand-default |
| E11S6 | 82 | −68.48 | −0.111 | cand-swap |
| E8S3 | 82 | −96.68 | −0.117 | cand-default |
| E16S9 | 82 | −83.28 | +0.038 | cand-swap |
| E4S7 | 83 | −35.60 | +0.019 | cand-default |
| E18S5 | 83 | −64.72 | −0.173 | cand-swap |
| E6S1 | 83 | −53.80 | −0.027 | cand-default |
| E12S1 | 84 | −58.28 | −0.221 | cand-swap |
| E3S5 | 84 | −65.32 | −0.220 | cand-default |
| E13S7 | 84 | −64.52 | −0.975 | cand-swap |
| E21S4 | 85 | −37.60 | −1.099 | cand-default |

- **cand-default** (no `--swap`): E9S1 E13S9 E8S5 E8S3 E4S7 E6S1 E3S5 E21S4
- **cand-swap** (`--swap`, cycle-15 now): E5S3 E12S3 E18S9 E11S6 E16S9 E18S5 E12S1 E13S7

Control owns the other eight. Do not touch them. Pack still holds all 16 so
swap still adopts.

`score` = expansion-pack formula, `nearest=0` (cut / eco / shell). Printed
`room → pack → score` by the script.

---

## When

1. Cycle-15 called (keep **or** revert). RCL4 8/8 or explicit censor.
2. Hygiene (`_next-adopt-plans.md` §0 / `_clean-world.md`). `--dry-run` seed
   16/16 OK.
3. `--write` (this script). Confirm CTRL 86 still empty, CAND 86 `bench=true`
   n=16 owner=pacifist.
4. Seed cycle-16. Candidate console: no leftover `planV2` / `planPackMiss` /
   `rclTimes.8`. `autoExpand` already false.
5. Wait `runPackAdoption` (~1–2k t, 8 owned). Fail the run if any cand room
   is still `planPackMiss` after 200 t.
6. Then `--watch`.

Not mid cycle-15. Not after seed-without-scrub.

---

## Risk

| | |
| --- | --- |
| **Leftover RCL8 plan** | `runPackAdoption` skips rooms that already have `planV2`. E4S7 bug. Scrub both racers' `Memory.rooms` + objects first. |
| **`planPackMiss` 3000 t** | Empty-pack scan before write. Delete miss / `packAdopt` after seed. |
| **autoExpand claims control's eight** | Index lists all 16; no vision → `takenByAnyone` is false. `--write` sets `autoExpand=false`. Do not `push-expansion-pack`. |
| **Control contamination** | dest `race` / `--user pacifist-race` / `--adopt` (seg 88) refused. CTRL 86 peeked, never POSTed. |
| **Planner hub r44** | Never writes 88 / 89–99 / 98. No `plan.mjs`. |
| **Path-switch (accepted)** | no-rcl2-boxes and no-RCL3-roads **do not** hold on planV2. leftover-5 + 6W still hold. First-box still object-order `[0]`. |

---

## Never

```
npm run push-race
--dest race / --user pacifist-race
--adopt / push-plan.mjs (seg 88)
push-expansion-pack.mjs
plan.mjs --all-claimable
server:local:reset
mid-race --write / push-pacifist
```

Fallback if pack wedges (after seed, 8 **owned** cand rooms, one at a time,
seg 88): see `_next-adopt-plans.md` §4. Not this script.
