# Cycle-18 local infra — 2026-08-16T06:45Z
Watch **PID 12880** still live: `node tools/server/race.mjs --watch --run run-2026-08-16T06-22-16Z --interval 15` (since 06:23:32Z). Not restarted. No second watch. No cycle-17 watch (17 ended tick-budget 06:20:49Z). Ledger `updatedAt` 06:45:20 / polls 88 / lastTick 4865424 / exitReason null. elapsed **14469/40000**.
Docker all **healthy** ~3h: `screeps-1` 127.0.0.1:23456→21025, `mongo-1`, `redis-1`.
Local API `http://127.0.0.1:23456/api/game/time` **200** `{"ok":1,"time":4865455}` (live vs watch lastTick).
Dash **PID 33932** still live on 8767: `race-dash.mjs --no-snap --watch 45 --serve 8767 --run run-2026-08-16T06-22-16Z`. HTTP **200**. Not restarted.
C: **312 GB** free (of ~1863 GB). No warn.
Phase stays `cycle-18-watching`. Control `e839fc8` / run `run-2026-08-16T06-22-16Z`. `_SPEEDRUN-STATE.txt` watch PID 12880.
No `--replace-live`. No `push-race`. No `server:local:reset`.
