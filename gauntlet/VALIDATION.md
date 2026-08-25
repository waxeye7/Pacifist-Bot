# Validation law

The artifact is `dist/main.js` running inside someone else's game engine. There
is no local runtime for the bot. `npm run build` proves it compiles. It proves
nothing about behaviour.

Unlike most Screeps repos, this one has a **disposable local world** — a Docker
private server with four accounts, two of which run this same `src/`. That makes
real A/B possible without risking anything. Use it. It is the whole reason this
loop can be careful without being slow.

## The frozen-bot trap

A bundle that throws on tick 1 never writes `Memory` again. Every value you read
back stays frozen at the last healthy deploy's numbers. **A dead bot reports
perfect health.**

Before you believe any metric, prove the tick advanced during your sample
window:

```bash
curl -s http://127.0.0.1:23456/api/game/time      # twice, a few seconds apart
```

A number without a tick delta beside it is not a measurement. It is a screenshot
of the past.

## The ladder — local first, always

| Rung | How | Proves |
| --- | --- | --- |
| 0 · compiles | `npm run build` | types and bundle |
| 1 · static | `npm test` (= lint + typecheck + test-unit, 30 files) | pure logic |
| 2 · planner gates | `fnm exec --using 22 node tools/plan-suite/v2/validate.mjs` | every shipped plan still passes, 172/172 |
| 2b · gate bites | `fnm exec --using 22 node tools/plan-suite/v2/mutate.mjs` | the validator actually catches deliberate defects (~4 s) |
| 3 · local run | `npm run push-pacifist`, watch a room | it boots, spawns, does not livelock |
| 4 · local A/B | `pacifist` vs `pacifist2`, same world, same start | the change is *better*, not just different |
| 5 · VPS soak | `npm run push-vps` (fallback `push-vps-ip`), long horizon | it holds up over thousands of ticks |
| 6 · LIVE observe | `tools/server/` pollers against `main` | what the real empire is actually doing |
| 7 · LIVE push | `npm run push-main` | **not this loop's job.** See GAUNTLET.md locks. |

Rungs 0–2b are cheap and mandatory for every change. Nothing that touches
behaviour ships on rungs 0–2 alone.

`mutate.mjs` exits **1** on a gate failure and **2** if the mongo dump comes back
short. Exit 2 is an infrastructure fault, not a verdict — do not read it as a
pass or a fail, fix the dump and re-run.

## A/B beats before/after

A before/after on one account confounds your change with world-state drift: the
room is richer, the neighbours moved, the RCL ticked over. `pacifist` and
`pacifist2` are two instances of this same bot on one local world, which is what
makes a controlled comparison possible. Prefer it for anything economic —
throughput, spawn uptime, RCL pace, build completion.

`tools/server/race.mjs` and `race-dash.mjs` already run this pattern for the
speedrun campaign. Read how they do it before inventing your own.

## Which rung does my change need?

| Change | Minimum |
| --- | --- |
| Comment, rename, dead code | 1 |
| Pure function / math | 1, plus a test that fails pre-fix and passes after |
| Base planner, layouts, sites | 2 **and** 2b, plus a visual check against `docs/BENCHMARK-ROOMS.json` |
| Anything a creep does | 3, then 4 |
| Spawn logic, role caps, bodies | 4 — this is exactly where A/B earns its keep |
| CPU | 4, same tick count both sides. LIVE runs a **20 CPU limit**; a change that is free at 100 CPU can be fatal at 20. |
| Remotes, hauling, roads | 4, long horizon |
| Defence, war, quads | 4 plus a local adversary. Do not conclude from an unopposed room. |
| Market | 6 — the local and VPS books are not the real book |

## Soak arithmetic

```
local docker : 50 ms/tick configured   -> 1 min ~ 1,200 ticks
VPS          : 300 ms/tick             -> 1 min ~ 200 ticks, 1 hour ~ 12,000
LIVE shard3  : seconds, variable       -> observation only
```

Measure the delta, do not trust the table — the local tick rate has been changed
before and `system.getTickDuration()` is the source of truth. Report ticks, never
wall-clock.

## What counts as evidence

A SHIP needs, gathered this turn, by someone who did not write the change:

1. A named metric, before and after, over a stated tick count on a stated
   server — or an A/B with both sides named.
2. The tick delta proving the world was live for the whole window.
3. `npm test` green and `npm run build` green, actually run.
4. If it touches plans: `validate.mjs` 172/172 **and** `mutate.mjs` biting.
5. For behaviour: a test that failed on the pre-fix code and passes after.

Not evidence, and an automatic SEND BACK: "fine", "looks good", "better than
before"; a grep that finds the code in the bundle; a number with no before;
a stale poll file; a health read with no liveness check; the implementer's
summary of their own change.

## Things that are expensive to undo

Know these before you touch them. This is the list that makes the difference
between a careful loop and a reckless one.

- **The frozen control build.** `pacifist-race` on dest `race` carries the
  campaign's control at commit `e839fc8`, `dist/main.js` sha256 `74c6247b…`.
  **Never `npm run push-race`.** If it drifts, every A/B time in
  `docs/speedrun-ledger/TIMES.md` becomes incomparable and the campaign restarts.
- **A world reset.** `system.resetAllData()` drops every collection *and flushes
  redis* — auth tokens, memory segments and the game clock go with it, and the
  rebuild is a ten-step procedure. Never as part of a loop iteration.
- **The `tools/server/_*.mjs` scripts.** `_del-creeps`, `_wipe-bench`,
  `_wipe-five`, `_scrub-*`, `_kill-quad-spam`, `_park-empire`, `_stop-cck` and
  friends are one-off surgical instruments written for a specific incident. They
  mutate world state directly. Do not run one because its name sounds relevant.
- **The VPS box.** Owned by a separate agent via the `big_vps` repo. Code
  uploads only — no SSH, no CLI, no mods, no tick-rate changes, no world edits.
  If the server looks broken, report it.
- **LIVE.** A real empire: PacifistBot, seven owned rooms, GCL in the hundreds of
  millions, a 20 CPU limit. Poll it. Do not push to it.

## Secrets

`screeps.json` is gitignored and holds a real screeps.com token. Never print it,
never paste it into a report, never commit it. The *local* tokens
(`local-pacifist-user-token-001` and friends) are fixed strings, not secrets, and
are documented in the README — those are fine to use, but do not confuse them
with `main.token`.
