# Dest-22 src — dest-cheap only at 0 miners

Src only. **Not** push-pacifist / **not** push-race. Cycle-21 (`run-2026-08-16T10-19-31Z`) dest already compiled WORK<2 dest-cheap.

## Knob

`rooms.spawning.ts` HOL dest-cheap: `homeMinerBestWork(room) === 0` (was `< 2`).

Leftover 1W/2W still fill 2–4 e/t → 550. Rewriting HOL `[5W,M]` was cycle-20 E18S9 (then `lastSpawn+1500`). True 0-miner HOL-550 (cycle-16 E18S5) still rewrites to `[2W,M]`/`[W,M]`.

`lastSpawn=0` poke **absent** (stale-heal only). `fiveWQueued` write-only. Do not restore poke this dest.

## After 21 FINAL

If pave does not buy RCL4 8/8 vs **29029** / this-ctrl **29053**: seed dest-22 with this compile. One knob. leftover-5 stays.

```
NEVER  push-pacifist while 21 watches
NEVER  npm run push-race
NEVER  seed
```
