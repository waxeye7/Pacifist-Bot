# The gauntlet loop

A builder makes one change. A **fresh critic that did not make it** re-measures
the claim on a real world and tries to kill it. The largest surviving gap becomes
the next piece of work.

This loop is deliberately **conservative**. It proves things on the disposable
local world before it goes anywhere else, it never pushes to LIVE, and it stops
and reports at checkpoints rather than running unattended indefinitely. The bot
it works on is a live empire with a 20 CPU budget and a campaign whose control
build must not drift — the cost of a reckless round is measured in days.

Read [VALIDATION.md](VALIDATION.md) first.

## Rules

**1. Builders never grade themselves.** Different agent, different model.

**2. Critics re-measure, they do not read.** Re-run the gates, re-poll the
world. Judge the diff and the numbers before reading the implementer's report,
then check whether the report matches what you found. Default verdict is SEND
BACK.

**3. One change per iteration.** Two changes in one soak and neither is
attributable. This is the rule most often broken and the most expensive.

**4. Isolated worktrees.** Builders work in their own worktree; results copy to
the parent only on SHIP. Never two writers on the same file.

**5. Local first.** The Docker world is disposable and A/B-capable. Almost every
question can be answered there. Going straight to the VPS because it is faster is
how you learn things the hard way.

**6. Prefer A/B to before/after.** `pacifist` vs `pacifist2`, same world, same
start. A before/after on one account confounds your change with world drift.

**7. Reversibility is part of the design.** Know the commit currently on each
server before you push. If you cannot put it back in one command, it is not ready
to go out.

**8. Checkpoint and report.** After each SHIP, and whenever you are about to do
something with real blast radius, write the board and stop for the owner. This
loop does not run for a day unsupervised.

## What "better" means here

Ranked. A change that improves a lower line by hurting a higher one is a
regression.

1. **Alive** — no room dies, no controller downgrades, no livelock, no spawn
   starvation
2. **Honest** — the bot's own telemetry reports what is actually true
3. **Within budget** — LIVE runs a **20 CPU limit**. Something that is free at
   100 CPU can be fatal at 20. CPU is a survival constraint here, not a nicety.
4. **Growing** — RCL pace, build completion, remotes actually hauling, GCL
5. **Defensible** — walls hold, towers pay for themselves, nothing stands in the
   cut line
6. **Clean** — tests, planner gates, dead code

## The per-item loop

```
measure the baseline (or set up the A/B)
  → implement in an isolated worktree
  → a test that FAILS on the pre-fix code and PASSES after
  → npm test + npm run build
  → if it touches plans: validate.mjs 172/172 AND mutate.mjs bites
  → climb the ladder to the rung this change demands (local, then A/B, then VPS)
  → one critic who did not implement it, who re-measures
  → SHIP or SEND BACK (fix up to 3 times, then drop it and say so)
  → copy to parent only on SHIP
  → journal it, update the board, checkpoint with the owner
```

If the first critic says SHIP on anything touching runtime behaviour, two fresh
skeptics re-measure independently. Ship on agreement, each with its own numbers.

**2–3 children at a time.** Not fifteen. A small wave you can actually audit is
the point of this version.

## Locks

Hard, and none of them are judgement calls:

- **Never `npm run push-main`.** LIVE is observe-only for this loop. Poll it,
  read it, use it to decide what to work on — never push to it. Promotion is the
  owner's, by hand, at a time they choose.
- **Never `npm run push-race`.** That account carries the campaign's frozen
  control build (commit `e839fc8`, `dist/main.js` sha256 `74c6247b…`). If it
  drifts, every recorded A/B time becomes incomparable.
- **Never SSH the VPS or touch its config, mods, tick rate or world state.** The
  box belongs to the `big_vps` repo's agent. Code uploads only. If it looks
  broken, report it — do not fix it.
- **Never `system.resetAllData()` or any world reset**, and never run the
  one-off `tools/server/_*.mjs` surgical scripts (`_del-creeps`, `_wipe-*`,
  `_scrub-*`, `_kill-quad-spam`, `_park-empire`, …) unless the owner names the
  script in this session. They mutate world state directly and were written for
  a specific past incident.
- **Never print or commit `screeps.json` or the `main` token.** The local
  `local-*-token-001` strings are documented and fine; the screeps.com token is
  not. A real token in any output is an automatic SEND BACK.
- **Do not weaken a planner gate to make a change pass.** If `validate.mjs` or
  `mutate.mjs` fails, the change is wrong until proven otherwise. Editing the
  gate is a separate, argued piece of work with its own critic.
- **Do not conclude from an unopposed room.** Defence and war changes need an
  adversary present.
- Grep-tests are not tests. "Better than before" without a re-measure is a SEND
  BACK.

## Where the state lives

| File | What it holds |
| --- | --- |
| `docs/speedrun-ledger/` | The campaign: `CONTROL.md` (frozen build), `TIMES.md`, cycle notes, live-crisis polls |
| `docs/BENCHMARK-ROOMS.json` | The planner's test rooms |
| `docs/PLANNER-BASELINE-*.json` | Recorded planner baselines to compare against |
| `docs/STARVATION-TRAPS.md` | Known economic failure modes — read before touching spawn or hauling |
| `docs/BASE-PLANNER-*.md`, `DYNAMIC-LAYOUT.md` | Planner goals and design |
| `docs/AGGRESSION-DOCTRINE.md` | What this bot is allowed to do to other players |
| `TODO.txt` | The owner's parked ideas. Not a backlog to burn down unasked. |
| `tools/server/README.md` | Everything about the local world — accounts, CLI, room generation, `spawn-in.mjs` |

## Failure modes already recorded in the history

The git log is mostly fixes for whole classes of bug. Read these before you
invent a new gate:

- **Intentless recycling** — a creep recycling with no intent produced a 3-tick
  teleport loop on LIVE (`0efb589`).
- **Spawn livelock** — the W1N1 filler: a threshold that could never be met by
  the body it was clamped to (`84f4208`).
- **Flapping floors** — a half-floor lab bar that oscillated exactly like the
  floor it replaced (`c1529d7`).
- **Site churn at a boundary** — placing and cancelling forever at the broke
  boundary (`774c4b3`).
- **A blocker standing in the wall line** — the link-on-cut hole (`70256cd`).
- **Non-energy in a container** — the power merry-go-round (`e44804b`).
- **A repairer grinding a thin bank to zero** — no work-side floor (`d23b983`).

The pattern in nearly all of them: a gate or threshold that was correct in the
common case and had no exit in the uncommon one. When you add a condition, ask
what releases it.
