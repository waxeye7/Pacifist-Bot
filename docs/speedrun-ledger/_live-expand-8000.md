# Live CLAIMED_SPAWNLESS 8000 — dest `main` shard3

2026-08-16T04:07:35Z. HTTP GET dest `main` shard3 tick **82281174→82281175**. No Memory write. No push. Do not unclaim **E36N57**.

## Verdict

| | |
| --- | --- |
| tick | **82281175** (**235** past due **82280940**) |
| `Memory.autoExpand` | **`null`** |
| `Memory.target_colonise` | **`{}`** |
| `features.autoExpand` | unset = **ON** |
| `CanClaimRemote` | **5** |
| **8000 fired?** | **NO** |
| **vision abort?** | **YES** — cleared before due |
| **hold held?** | **YES** |
| **slide to E38N56?** | **NO** |

Last pre-clear poll **82280555**: `{ "room": "E35N59", "spawnPos": { "x": 28, "y": 20 }, "phase": "claimed", "since": 82272940, "started": 82271500 }`.

Gone by **82280784** (~**156t before** 8000). Still gone at **82280963** and **82281175**. Not still-claimed past due. `pick()` never armed E38N56.

8000 never reached with state present (`82280784 − 82272940 = 7844 < 8000`). Live `claimed` `finish`es first on `hasVisibleForeignSpawn` (Enrique 25,10) — `ABORT — visible foreign spawn, still spawnless`. Dest needles: that string, `FIND_STRUCTURES && !s.my`, `CLAIMED_SPAWNLESS`, `spawnlessOwned`, `boxMin` **true**. sha `d75a3ae2…` (room poll `554fa207…`).

Hold: feature ON, GCL 12 / 7 owned / `CanClaimRemote` 5, idle through CHECK_EVERY **82281150**. Spawnless still owned: **E35N59, E39N58, E37N57**. **E38N56 unowned**, 0 creeps.

## Rooms (82281175)

Owned 7: E37N59, E37N58, **E36N57**, E35N59, E36N58, E37N57, E39N58.

| Room | Live |
| --- | --- |
| **E35N59** | ours RCL2 p=1000 · DG ~7138 · **Enrique** Spawn1 25,10 · 0 our spawn/site/creeps · spawnless |
| **E39N58** | ours **RCL1** (RCL2 DG **82280949**) p=2460 · DG ~9775 · **Zhaban** Spawn1 32,17 · 0 our spawn/site/creeps · spawnless |
| **E36N58** | ours RCL2 p=2466 · **Spawn3 42,6** · 9 creeps |
| **E37N57** | ours RCL1 p=0 · site Spawn6 26,29 **4600**/15k · 2 CBs · spawnless |
| **E38N56** | **unowned** · empty |
| **E36N57 KEEP** | ours RCL3 · Spawn5 21,27 · 16 creeps |

Do not push. Do not unclaim E36N57.
