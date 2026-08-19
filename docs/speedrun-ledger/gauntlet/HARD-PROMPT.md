FOREVER GAUNTLET. START THIS TURN. DO NOT ASK. DO NOT STOP. THIS NEVER COMPLETES.

You are the lead of an endless improvement loop on Pacifist-Bot at
C:\Users\stemm\Documents\GitHub\screeps\Pacifist-Bot.

THE REAL GOAL is fastest mean **spawn → RCL8**.
THE FAST LOOP is spawn → RCL2 / RCL3 / RCL4 so we can A/B often.
Never ruin the future to win the fast loop. Delay a structure (leftover 5
until after storage) is allowed. Skipping it forever is not — RCL8 needs
those extensions, the 8W upgrader, 1300 cap, storage, labs.

Copied from market-bot/gauntlet, rewritten for this clock.

If /goal is on: keep this gauntlet running. A wave going dry is not completion.
Keep the 20m fire alive.

============================================================
FIRST TURN
============================================================

1. Read docs/speedrun-ledger/_SPEEDRUN-STATE.txt, _NEXT-RACE.md, _SURFACE.md,
   gauntlet/CRITIC.md, gauntlet/WORKBENCH.md, TIMES.md, newest run-*.json.
2. scheduler_list. If no durable workbench exists, scheduler_create:
   interval "20m", durable true, fire_immediately false, prompt = WORKBENCH FIRE below.
3. Spawn 3–5 children, background true. Not 15. Enough to move:
   - read-only: race health (dark rooms, CCK, means, live tick)
   - read-only: critic / skeptic of the current parent (default SEND BACK + future check)
   - worktree builder on the single highest-ROI legal gap
   - if that builder is runtime: one more worktree on a different file set
     (haul vs spawn). Never two writers on the same file.
4. Then just run the loop. Do not author a giant workflow unless it is already
   there and useful. Prefer spawn_subagent + this session.

============================================================
WHAT TO IMPROVE (rotate; dying race rooms always win)
============================================================

1. Dying / dark / CCK'd race rooms (p2, leftover RCL8 memory, 0-spawn brick)
2. LOOP-EARLY — mean spawn→RCL2 then RCL3 then RCL4 down
3. LOOP-FUTURE — any keep that fails the RCL8 future check is reverted
4. LOOP-HYGIENE — p2 off, wipe+Memory.rooms+resetSpeedrun, tickBudget ≥40000, --swap
5. LOOP-CPU — shard3-viable, no tick spikes >100
6. Planner 98/88 only as binds (no presence fishing, no hub overwrite mid-race)

One change per iteration so you can tell if it helped. Journal it in
docs/speedrun-ledger/gauntlet/WORKBENCH.md and TIMES.md.

============================================================
LOCKS
============================================================

- Never print or commit tokens / screeps.json secrets.
- Never `npm run push-race`. Control is frozen at e839fc8.
- Never `server:local:reset`. Room wipe only (`race.mjs --wipe --yes`).
- Never SSH the VPS. Code uploads only (`push-vps` if the owner asked).
- Do not skip leftover 5 forever. Hold-then-build after storage is the rec.
- Do not mid-race push-pacifist unless the race is already junk (CCK / brick).
- New test must fail on the pre-fix and pass after when one exists.
- Fine / "faster RCL2" without a future check = SEND BACK.

============================================================
LOOP (each item)
============================================================

measure baseline → implement in an isolated worktree → test that fails then
passes → critic who did not implement (CRITIC.md + future check) → SHIP or
SEND BACK (fix up to 3 times) → copy to parent only on SHIP → update
WORKBENCH + TIMES + SPEEDRUN-STATE → next item.

If runtime (spawn, bodies, build order): wait for a clean seed or the
current race to end. Do not confound an in-flight A/B.

Do not play builder and critic in one brain.

============================================================
WORKBENCH FIRE (scheduler /loop 20m)
============================================================

WORKBENCH FIRE. Speedrun gauntlet lead on C:\Users\stemm\Documents\GitHub\screeps\Pacifist-Bot. Do not start a second loop. Read docs/speedrun-ledger/_SPEEDRUN-STATE.txt, TIMES.md, newest run-*.json, gauntlet/WORKBENCH.md. Honor locks: no push-race, no server:local:reset, no VPS SSH, no skip-forever leftover 5, no mid-race push-pacifist on a live A/B. If race rooms are dark/CCK, that is the item. Else if no race is watching and docker is up, hygiene-seed or pick the next one-knob from _NEXT-RACE.md. Spawn one critic and one isolated builder if a legal gap exists. Update WORKBENCH. Then keep going — this fire is not the last round.

fnm PATH: C:\Users\stemm\AppData\Roaming\fnm\node-versions\v22.13.0\installation
mean: node tools/server/race-hourly.mjs

============================================================
NEVER STOP
============================================================

A wave can pause when children are back and the next item is owner-blocked
(docker down, waiting on a live race). Write a 5-line board and wait for the
20m fire. Do not stop because you wrote a status. Resume dead critics.

Talk short. Table: item, verdict, evidence, future-check. Say what you did NOT do.

Start now: read the files, scheduler_list, spawn the 3–5 children, ship the first gap.
