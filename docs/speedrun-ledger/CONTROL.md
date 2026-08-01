# SPEEDRUN CAMPAIGN — CONTROL SNAPSHOT & READINESS

Companion to `docs/EARLY-GAME-SPEEDRUN-CAMPAIGN.md`. This file pins the **control**
side of every A/B in the campaign and records the state the campaign starts from.
The control never changes until the campaign deliberately re-baselines (§6).

Status: **READY.** Prepared 2026-08-01/02, waiting on the base-planner perfection
goal to terminate.

---

## 1. Control build (FROZEN)

| | |
| --- | --- |
| Commit | **`e839fc8143a9b1c5807b9ad672410a1ce3e10090`** |
| Subject | `feat(planner): layer-7b reflow, claim-seat guarantee, priced refusals` |
| Branch at freeze | `main` |
| Built from | a **clean detached worktree at that commit**, not the working tree (the working tree carried unrelated uncommitted edits at freeze time) |
| `dist/main.js` sha256 | `74c6247bf143306672cba7cba6e161ab864853a4dd75ef21ac92ebb3e8a289f8` |
| Pushed to | user `pacifist-race`, dest `race`, branch `main`, `activeWorld`/`activeSim` true |
| Pushed at | 2026-08-01 16:11 UTC (server tick ~205 500) |

Rebuild/verify the control byte-for-byte without disturbing the working tree:

```bash
WT=/tmp/control-head
git worktree add --detach "$WT" e839fc8143a9b1c5807b9ad672410a1ce3e10090
cp screeps.json "$WT/screeps.json"          # gitignored, so it is not in the worktree
# Windows: cmd /c mklink /J "$WT\node_modules" "<repo>\node_modules"
ln -s "$PWD/node_modules" "$WT/node_modules"
(cd "$WT" && fnm exec --using 22 node ./node_modules/rollup/dist/bin/rollup -c --environment DEST:race)
sha256sum "$WT/dist/main.js"                # must be 74c6247b…
git worktree remove --force "$WT"
```

Sanity check that the server holds it:

```bash
docker exec local-screeps-server-mongo-1 mongosh screeps --quiet --eval '
db["users.code"].find({user:"pacifist-race"},{branch:1,activeWorld:1,timestamp:1,_id:0}).forEach(printjson)'
```

---

## 2. Users

| role | user | `_id` | token | dest | npm script |
| --- | --- | --- | --- | --- | --- |
| control (frozen build) | `pacifist-race` | `pacifist-race` | `local-pacifist-race-token-001` | `race` | `npm run push-race` |
| candidate (build under test) | `pacifist` | `pacifist1` | `local-pacifist-user-token-001` | `pacifist` | `npm run push-pacifist` |

`pacifist-race` was created with GCL 17 000 000 — the same GCL band as `pacifist`
(19.6M), `pacifist2` (17.0M) and `waxeye` (15.2M), i.e. GCL level 4 for all of
them, so neither side of a race gets a claim-limit or CPU advantage. Creation
recipe: `tools/server/README.md` §0.

**`npm run push-race` is not part of normal work.** Running it silently
invalidates every ledger recorded against this snapshot.

`users.pacifist-race.active` decays to 0 while the account owns no rooms — harmless,
`spawn-in.mjs` bumps it back with `$max: {active: 10000}` on every seed.

---

## 3. Benchmark set (FROZEN)

`docs/BENCHMARK-ROOMS.json` — `setHash` **`1f90aub`**, frozen **2026-08-01T16:15:28Z**
at server tick **207 403**. `provisional: false`.

World at freeze: 243 normal rooms · 12 claimed rooms · 89-room candidate pool
(43 rejected for being adjacent to a claimed room).

| slot | band | control room | candidate room | hardness (ctl/cand) | pair Δ | attributes |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | hard | E5S3 | E9S1 | +0.614 / +0.631 | 11.42 ⚠ | enclosed anchor / near ctrl / enclosed sources |
| B2 | hard | E12S3 | E13S9 | +0.642 / +0.203 | 12.41 ⚠ | enclosed / far / enclosed |
| B3 | hard | E18S9 | E8S5 | +0.358 / +0.349 | 13.30 ⚠ | semi / near / enclosed |
| B4 | median | E11S6 | E8S3 | −0.111 / −0.117 | 5.75 | semi / mid / enclosed |
| B5 | median | E16S9 | E4S7 | +0.038 / +0.019 | 9.29 ⚠ | semi / near / tight |
| B6 | median | E18S5 | E6S1 | −0.173 / −0.027 | 9.38 ⚠ | semi / far / tight |
| B7 | easy | E12S1 | E3S5 | −0.221 / −0.220 | 5.84 | semi / far / enclosed |
| B8 | easy | E13S7 | E21S4 | −0.975 / −1.099 | 10.16 ⚠ | semi / mid / enclosed |

- **Hardness spread**: −1.099σ … +0.642σ (range 1.74σ). Band cutoffs easy ≤ −0.174,
  hard ≥ +0.176; controller-distance cutoffs near ≤ 8, far ≥ 17.7 steps.
- **Composition** 2 easy / 3 median / 3 hard, as the campaign doc asks (the win has
  to show on hard rooms, not just easy ones).
- **Verified at freeze**, all 16 rooms: `status: normal`, not a highway, not an SK
  room, exactly 2 sources, controller unowned and unreserved, spawn plan present in
  `plans-hub.json`; **min separation between benchmark rooms = 2**, **min distance to
  a claimed room = 2** (both at the configured floor, none violated).
- ⚠ **6 of 8 pairs exceed the 8.0 pair-distance warn bar.** This is a pool limit, not
  a bug: the hard band has few near-twins once rooms adjacent to the 12 claimed rooms
  are excluded (tightening `--max-pair-distance` does not improve it — the tight pairs
  do not exist). **Consequence: `--swap` counterbalancing is mandatory for this set,
  not optional** — run half the runs of every cycle with `--swap` and read the
  `swap-balanced` delta in `--report`, never the raw one.

---

## 4. Full campaign cycle — exact commands

Node 22 is required for every tool (`fnm exec --using 22 node …`).

```bash
# --- 0. once per cycle: put the candidate build on the candidate account
npm run push-pacifist                       # control (pacifist-race) is NEVER pushed

# --- 1. plans must exist for the benchmark rooms (rewrites plans-hub.json wholesale)
fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --all-claimable

# --- 2. preflight (writes nothing) — every slot must print OK, zero preflight problems
fnm exec --using 22 node tools/server/race.mjs --seed --dry-run

# --- 3. seed. Repeat >= 3 times per side; alternate --swap so the orientations balance.
fnm exec --using 22 node tools/server/race.mjs --seed \
  --label "<what changed>" --note "<hypothesis>" --target-rcl 4
#   ... later runs, re-using the SAME benchmark rooms, need a wipe first:
fnm exec --using 22 node tools/server/race.mjs --seed --wipe --yes --swap \
  --label "<what changed>" --target-rcl 4
#   after a --wipe, clear the bots' room memory in the game console, e.g.
#   delete Memory.rooms["E5S3"]; ... ; resetSpeedrun()

# --- 4. watch (resumable; first observation of a level wins and is never overwritten)
fnm exec --using 22 node tools/server/race.mjs --watch --run <runId> --interval 15
#   cron-friendly single sample instead of a long-lived process:
fnm exec --using 22 node tools/server/race.mjs --watch --run <runId> --once

# --- 5. report across every ledger of the cycle
fnm exec --using 22 node tools/server/race.mjs --report --target-rcl 4
fnm exec --using 22 node tools/server/race.mjs --report --label "<what changed>" \
  --out docs/speedrun-ledger/summary-<cycle>.json
```

Reading the report honestly:

- `--report` refuses to call a win before **N ≥ 3 runs per side**, inside the **1 %**
  bar, or inside **|Δ| ≤ 2·SE**. Take those verdicts literally.
- If control and candidate have **different censoring counts**, the means are not
  comparable — the verdict says so; fix the run, do not average it away.
- Milestone ticks are the *first poll that observed* the level, so each is an upper
  bound within the poll window (`max poll lag` is printed). Keep `--interval` small
  relative to the effect you are trying to measure.
- Guardrail runs from the campaign doc (remotes disabled, CPU, tower-by-RCL3, planner
  validator) are separate checks — `race.mjs` does not enforce them.

Ledgers land in `docs/speedrun-ledger/run-*.json`, one per run, and are the campaign's
trend line — commit them, including for reverted cycles.

---

## 5. Pipeline verification performed at freeze time

- `--pick --force` → 8 slots, constraints re-verified independently against mongo (§3).
- `--seed --dry-run` → **16/16 seeds OK, zero preflight problems** (both users resolve,
  every room free, every terrain hash still matching the freeze, every room planned).
- `--watch --once` against the live API (`http://127.0.0.1:23025`) → polled real rooms,
  recorded RCL2–6 milestones, wrote and re-read the ledger, exited `all-reached-target`.
- `--report` over that ledger → correct stats plus the expected
  `INSUFFICIENT RUNS … single orientation only` guardrail verdicts.

The watch/report check ran against a throwaway ledger pointing at already-live rooms,
in a scratch `--ledger-dir`, so **the frozen benchmark rooms were not seeded** and the
campaign clock has not started.

---

## 6. Re-baselining (the only time any of this changes)

Per the campaign doc, RCL6 work starts from the RCL4-optimized bot. When that
happens, in one deliberate step:

1. Pick the new control commit; rebuild it in a clean worktree (§1) and
   `npm run push-race`.
2. Re-freeze the rooms if the world has drifted:
   `race.mjs --pick --force` (add `--min-owner-distance`/`--composition` only with a
   written reason).
3. Update §1 and §3 of this file — commit hash, sha256, `setHash`, freeze date.
4. Start a fresh ledger series; **never** mix ledgers from two different control
   snapshots in one `--report`.

---

## 7. Known risks to watch during the campaign

- **World drift.** The live fleet auto-expands. If `pacifist`/`pacifist2` claims a
  benchmark room or a room adjacent to one, that slot is contaminated. `--seed`
  preflight catches an outright claim; adjacency it will not. Re-check
  `race.mjs --pick --dry-run`'s claimed-room list before each cycle and re-baseline
  (§6) if a benchmark room's neighbourhood has been taken.
- **Loose pairs.** See §3 ⚠ — `--swap` is mandatory for this set.
- **Transient occupancy.** A creep standing in a benchmark room makes `spawn-in.mjs`
  refuse it; that is a retry, not a failure. (Room *pick* distance deliberately
  ignores transient objects — only owned controllers count — otherwise the freeze is
  not reproducible.)
