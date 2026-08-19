# VPS W3N3 + W2N1 · tick **2102018**

HTTP GET dest `vps` (`http://screeps.marlyman123.com`). No SSH. **No push.**

| | |
| --- | --- |
| Polled | 2026-08-16T03:29:24Z → **03:35:21Z** · ticks **2101237** → **2101692** → **2102018** |
| Tick | **~460 ms** |
| User | `pacifist` · GCL **32.76M** · bucket **10k** |
| Binary | `main` **03:32:47Z** sha256 `554fa207…` (was `ee420608` @ 03:05). Needles: `isShellNaked` / `ramparts only` / `PlanV2 opens those slots` / CB nearest. `Empty bank + sites` **gone**. |

---

## W3N3 — RCL2 colony, 5th ext crawling

| | **2101237** | **2101692** | **2102018** |
| --- | ---: | ---: | ---: |
| RCL / p | 2 / **20044** | 2 / **20161** | 2 / **20377** |
| DG | 9970 | 9836 | **9910** |
| Spawn7 28,28 | 230 idle | 158 idle | **300** idle |
| ext standing / E | 4 / 100 | 4 / 50 | **4 / 85** |
| ext **24,30** | **429**/3000 | **829**/3000 | **829**/3000 |
| depot 27,27 | 0 | 0 | **0** |
| container 27,31 | 0 | 0 | **0** |
| builders | 2 × 0e | **1** × 0e | **2** × 0e |

- Spawn standing. **0 CB.** `target_colonise` `{}`.
- **planV2 still miss** (`planPackMiss` **2099189**, retry **~2102189**). No W3N3 pack.
- Locked site when present: ext **24,30** (`879e8312e359cf1`). Depot waits (RCL2 `findLocked` = ext first; hub `28,26` already stands).
- Energy path: **drop / source**, not spawn tap. `Structures.storage` = hub container **28,26 0e**. `withdrawStorage` → `acquireEnergy`. Tap needs `energyAvailable >= 550`; room cap **500** (4 ext).
- This window: 429→829 then stall while builders recycled. Latest pair `889569` @16,12 and `2002467` @28,27, both **0e / not building**.
- Standing: 4 ext · 1 container 28,26 · **0 roads**. Foreign container site 13,8 still **2358/5000**.
- Roster: miner 2 · carrier 3 · builder **2** `[W,2C,2M]` · upgrader 4 · repair · filler · sweeper.

---

## W2N1 — naked shell **closed**

| | last known | **2101237** | **2102018** |
| --- | ---: | ---: | ---: |
| RCL / p | 7 / 200k | 7 / 222k | 7 / **228411** |
| storage E | **8072** | **4** | **0** |
| road sites | 5 × p=0 | **0** | **0** |
| standing roads | 0 | **1** @ **1,13** | **1** @ **1,13** 4800h |
| ramparts | 38 | 38 | **38** |
| builder | token idle 0e | **gone** | token **50e**, `suicide` |

- First west-edge road finished → `isShellNaked` false (1 road + 38 ramp) → freeze holds, leftover sites stripped.
- `Builder-899382-W2N1` `[W,C,M]` leftover: store **50e**, `building` true, **`suicide` true**, walking to recycle. No lock (0 sites). Storage 0 < 80k floor → no bank withdraw. Spawn tap off (`sites.length == 0`).
- Spawn2 idle E=250. Ext **1924**. planV2 `tmmjwt`.

Not a race sample. Do not SSH. Do not `push-vps` this pass (lead already moved the binary; no one-line unpatched src bug).
