# Cycle-16 local infra — 2026-08-16T04:45Z
Watch **PID 42060** still live: `node tools/server/race.mjs --watch --run run-2026-08-16T03-18-19Z --interval 15` (since 15:20:08). Not restarted. No second watch. Ledger `updatedAt` 04:45:13 / polls 340 / lastTick 4806620 / exitReason null. elapsed **36968/40000**.
Docker all **healthy** ~1h: `screeps-1` 127.0.0.1:23456→21025, `mongo-1`, `redis-1`.
Local API `http://127.0.0.1:23456/api/game/time` **200** `{"ok":1,"time":4806623}` (live vs watch lastTick).
Dash **PID 16444** still live on 8767: `race-dash.mjs --no-snap --watch 45 --serve 8767 --run run-2026-08-16T03-18-19Z`. HTTP **200**. Not restarted.
C: **313 GB** free (of ~1863 GB). No warn.
Phase stays `cycle-16-watching`. Control `e839fc8` / run `run-2026-08-16T03-18-19Z` unchanged. `_SPEEDRUN-STATE.txt` watch PID left 42060.
No `--replace-live`. No `push-race`. No `server:local:reset`.
