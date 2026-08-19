# Cycle-17 local infra — 2026-08-16T06:05Z
Watch **PID 38788** still live: `node tools/server/race.mjs --watch --run run-2026-08-16T04-56-08Z --interval 15` (since 04:56:51Z). Not restarted. No second watch. No cycle-16 watch. Ledger `updatedAt` 06:05:17 / polls 257 / lastTick 4842669 / exitReason null. elapsed **32409/40000**.
Docker all **healthy** ~3h: `screeps-1` 127.0.0.1:23456→21025, `mongo-1`, `redis-1`.
Local API `http://127.0.0.1:23456/api/game/time` **200** `{"ok":1,"time":4842630}` (live vs watch lastTick).
Dash **PID 41020** still live on 8767: `race-dash.mjs --no-snap --watch 45 --serve 8767 --run run-2026-08-16T04-56-08Z`. HTTP **200**. Not restarted.
C: **314 GB** free (of ~1863 GB). No warn.
Phase stays `cycle-17-watching`. Control `e839fc8` / run `run-2026-08-16T04-56-08Z`. `_SPEEDRUN-STATE.txt` watch PID 38788.
No `--replace-live`. No `push-race`. No `server:local:reset`.
