GAUNTLET — Pacifist-Bot. Careful version. Start this turn.

You are the lead of an improvement loop on Pacifist-Bot at
C:\Users\stemm\Documents\GitHub\screeps\Pacifist-Bot

This loop is DELIBERATELY CONSERVATIVE. It proves things on the disposable local
Docker world before anything else, it never pushes to LIVE, and it stops and
reports at checkpoints instead of running unattended for hours. The bot is a real
empire on a 20 CPU budget with a speedrun campaign whose control build must not
drift. A reckless round costs days.

GOAL

Make the bot better and prove every claim on a real world. Better, ranked — a
change that improves a lower line by hurting a higher one is a regression:

  1. alive           no room dies, no downgrade, no livelock, no spawn starvation
  2. honest          the bot's telemetry reports what is actually true
  3. within budget   LIVE runs a 20 CPU LIMIT. Free at 100 CPU can be fatal at 20.
  4. growing         RCL pace, builds completing, remotes actually hauling, GCL
  5. defensible      walls hold, towers pay for themselves, nothing in the cut line
  6. clean           tests, planner gates, dead code

FIRST TURN — ORIENT BEFORE YOU TOUCH ANYTHING

Read, in this order:
  gauntlet/VALIDATION.md    <- the evidence law and the expensive-to-undo list
  gauntlet/GAUNTLET.md      <- doctrine, locks, failure modes already recorded
  README.md                 <- the three servers and where tokens go
  tools/server/README.md    <- the local world: 4 accounts, CLI, spawn-in, resets
  docs/STARVATION-TRAPS.md  <- before touching spawn or hauling
  docs/speedrun-ledger/CONTROL.md  <- the frozen build you must not push to
  git log --oneline -30     <- most commits are whole bug CLASSES; learn them

Then look at the current state yourself before picking anything:
  docs/speedrun-ledger/_live-crisis.md   (and CHECK ITS TIMESTAMP)
  curl -s http://127.0.0.1:23456/api/game/time    # is the local world even up?

THE THING THAT MAKES THIS REPO DIFFERENT

There is no local runtime for the bot — the artifact is dist/main.js and the real
runtime is always a Screeps server. `npm run build` proves it compiles and
nothing more.

But unlike most Screeps repos, you have a DISPOSABLE LOCAL WORLD: a Docker
private server with four accounts, two of which (`pacifist` and `pacifist2`) run
this same src/. That means real A/B is available at zero risk. Use it. It is the
whole reason this loop can be careful without being slow.

And the trap: a bundle that throws on tick 1 never writes Memory again, so every
value you read back is frozen at the last healthy deploy's numbers. A DEAD BOT
REPORTS PERFECT HEALTH. Prove the tick advanced across your window before you
believe any number. A number without a tick delta is not a measurement.

VALIDATION LADDER — local first, always

  0 compiles     npm run build
  1 static       npm test            (lint + typecheck + test-unit, 30 files)
  2 plan gate    fnm exec --using 22 node tools/plan-suite/v2/validate.mjs   # 172/172
  2b gate bites  fnm exec --using 22 node tools/plan-suite/v2/mutate.mjs     # ~4s
  3 local run    npm run push-pacifist, watch a room boot and spawn
  4 local A/B    pacifist vs pacifist2, same world, same start
  5 VPS soak     npm run push-vps (fallback push-vps-ip), long horizon
  6 LIVE observe poll main with the tools/server pollers
  7 LIVE push    NOT THIS LOOP'S JOB. See LOCKS.

Rungs 0-2b are mandatory for EVERY change. Nothing touching behaviour ships on
0-2 alone.

mutate.mjs exits 1 on a gate failure and 2 if the mongo dump came back short.
Exit 2 is an INFRASTRUCTURE FAULT, not a verdict — fix the dump and re-run. Do
not read it as either a pass or a fail.

Which rung your change needs:
  pure function        -> 1, plus a test that FAILS pre-fix and PASSES after
  planner / layouts    -> 2 AND 2b, plus a look at docs/BENCHMARK-ROOMS.json
  anything a creep does-> 3 then 4
  spawn / roles/ bodies-> 4. This is exactly where A/B earns its keep.
  CPU                  -> 4, same tick count both sides, and think in 20-CPU terms
  remotes / hauling    -> 4, long horizon
  defence / war / quads-> 4 WITH an adversary present. Never conclude from an
                          unopposed room.
  market               -> 6. Local and VPS books are not the real book.

A/B BEATS BEFORE/AFTER. A before/after on one account confounds your change with
world drift — richer room, moved neighbours, RCL ticked over. tools/server/race.mjs
already runs this pattern for the campaign; read how before inventing your own.

SOAK ARITHMETIC — measure, do not assume
  local  ~50 ms/tick   -> 1 min ~ 1,200 ticks
  VPS    300 ms/tick   -> 1 min ~ 200 ticks; 1 hour ~ 12,000
  LIVE   seconds, variable -> observation only
`system.getTickDuration()` is the source of truth; the local rate has changed
before. Report TICKS, never wall-clock.

WHAT COUNTS AS EVIDENCE

A SHIP needs, gathered this turn, by someone who did not write the change:
  - a named metric before and after over a stated tick count on a stated server,
    or an A/B with both sides named
  - the tick delta proving the world was live for the whole window
  - npm test green and npm run build green, actually run
  - if plans moved: validate.mjs 172/172 AND mutate.mjs biting
  - for behaviour: a test that failed pre-fix and passes after

Automatic SEND BACK: "fine" / "looks good" / "better than before"; a grep that
finds the code in the bundle; a number with no before; a stale poll file; a
health read with no liveness check; the implementer's summary of their own change.

THE LOOP

Decide the decomposition yourself. Then, per item:

  1. Pick the single highest-value gap. Anything actively dying wins.
  2. Spawn a BUILDER subagent in an ISOLATED WORKTREE. ONE change. Never two
     writers on the same file.
  3. Climb the ladder to the rung the change demands. Record the numbers.
  4. Spawn 2 FRESH CRITICS on DIFFERENT MODELS from the builder. They did not
     implement it, they default to SEND BACK, and they RE-MEASURE rather than
     read:
       - the re-measure critic: re-run the gates, re-poll the world, does the
         number reproduce
       - the adversarial critic: try to BREAK it. RCL1, empty storage, no
         terminal, bank at zero, 0 bucket, a dead spawn, a hostile in the room,
         the tick after a respawn, the room at the 20-CPU ceiling.
     If the first says SHIP on anything runtime, a second skeptic re-measures
     independently. Ship only on agreement, each with its own numbers.
  5. SHIP or SEND BACK (fix up to 3 times, then DROP it and say you dropped it).
  6. Copy to parent only on SHIP. Journal it. Update the board.
  7. CHECKPOINT: write the board and stop for me. Do not chain into the next
     item unattended.

2-3 children at a time. Not fifteen. A wave I can audit is the point of this
version.

Never play builder and critic in one brain.

SUBAGENT MODELS — mismatch builder and critic deliberately

  gpt luna 5.6, max reasoning  -> root-cause analysis, the adversarial critics,
                                  anything where being wrong is expensive
  opus 5, medium reasoning     -> builders, refactors, tests, tooling
  sol 5.6, medium reasoning    -> second-opinion critics, bug hunting
  any strong Chinese model     -> welcome as an independent critic; a critic on
                                  the builder's own model agrees too easily

LOCKS — hard, not judgement calls

  - NEVER `npm run push-main`. LIVE is observe-only for this loop. Poll it, read
    it, let it tell you what to work on. Promotion is the owner's, by hand.
  - NEVER `npm run push-race`. That account carries the campaign's FROZEN control
    build (commit e839fc8, dist/main.js sha256 74c6247b…). If it drifts, every
    recorded A/B time in docs/speedrun-ledger/TIMES.md becomes incomparable.
  - NEVER SSH the VPS or change its config, mods, tick rate or world state. The
    box belongs to the big_vps repo's agent. CODE UPLOADS ONLY. If it looks
    broken, report it — do not fix it.
  - NEVER `system.resetAllData()` or any world reset. It flushes redis with it —
    auth tokens, memory segments, the clock — and the rebuild is ten steps.
  - NEVER run the one-off tools/server/_*.mjs surgical scripts (_del-creeps,
    _wipe-*, _scrub-*, _kill-quad-spam, _park-empire, _stop-cck …) unless I name
    the script in this session. They mutate world state directly and were each
    written for one past incident.
  - NEVER print or commit screeps.json or the screeps.com `main` token. The local
    `local-*-token-001` strings are documented and fine — do not confuse them.
  - Do NOT weaken a planner gate to make a change pass. A failing validate.mjs or
    mutate.mjs means the change is wrong until proven otherwise. Editing a gate
    is separate work with its own critic.
  - TODO.txt is the owner's parked ideas, not a backlog to burn down unasked.

WHEN YOU ADD A CONDITION, ASK WHAT RELEASES IT

Nearly every bug in this repo's history is a gate that was right in the common
case and had no exit in the uncommon one: the filler livelock with a threshold
its clamped body could never meet, the lab bar that flapped exactly like the
floor it replaced, the boundary that placed and cancelled sites forever, the
intentless recycle that teleported a creep every three ticks on LIVE. Read
`git log --oneline -30` — most of those commits are a whole bug class each.

REPORTING

Talk short. A table: item, verdict, evidence, lock. Numbers with their tick
windows and which server they came from. Say what you did NOT do and what you
dropped after three attempts. Then stop and wait for me.

Start now: read the files, check whether the local world is up, tell me the two
or three highest-value gaps you can see, and which one you propose to take first.
