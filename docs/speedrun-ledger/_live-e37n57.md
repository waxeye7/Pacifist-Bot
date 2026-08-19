# Live E37N57 — ext still 0 after hub-unlock

2026-08-16T11:04Z. dest `main` shard3 tick **82288013** → **82288016**. HTTP GET. No Memory write. No push. **Ours. Do not unclaim.**

Prior 10:45Z tick **82287702**: 5 ext **0/3k** · hub **3950/5k** · B locked hub.

**Push landed.** sha `55e755cb…` (was `32bd2297…`). Unlock is lock-clear (`builder.ts:180–186`), not the y-2 drop.

## Ext progress — **no**

| Site | 10:45 | 11:04 |
| --- | ---: | ---: |
| ext 24,31 | 0/3000 | **0/3000** |
| ext 28,27 | 0/3000 | **0/3000** |
| ext 23,26 | 0/3000 | **0/3000** |
| ext 23,28 | 0/3000 | **0/3000** |
| ext 23,30 | 0/3000 | **0/3000** |
| hub 26,27 | 3950/5000 | **4200/5000** (+250) |

Standing ext **0**. ~311t. All slam energy still on hub.

## Why unlock missed

Clear `memory.locked` when lock is a **container** at RCL≤2 and ext sites exist. Next line `findLocked` still returns hub: RCL2 filter `spawn.x, spawn.y-2` (`builder.ts:37–39`) before ext (`:99`). Relock. Residual: drop the y-2 clause so ext beats leftover containers. Live locks then hop on the next build tick (no Memory write).

leftover-5 HOLD L2 take=5 is correct. 4 UG expected.

## Room

RCL2 p **3373** (+92). DG **9962**. Spawn6 26,29 e300 idle. spawn_list **empty**.

Creeps **11** = UG4 · B2 · CA2 · EM1 `[2W,M]` · SW1 · CB visitor (E37N58→E39N58). B794 **27,30** e0 parked. B302 **38,42** e50 🎯 inbound (same tile as last hub-bound film). EM 43,45 harvest 44,44.

Raw: [`_live-e37n57.poll.json`](./_live-e37n57.poll.json).
