# Parked: RCL tick race (optimize later)

**Status:** parked — work **dynamic base layout** first.  
**Instrument already live:** `speedrunStatus()` / `resetSpeedrun()` (game ticks, not wall-clock).  
Local race instance: `pacifist-race` @ **E2S7** (waxeye E5S1 left alone).

## Energy floors (hard lower bounds)

Controller upgrade energy only (ignores spawn/build waste):

| Step | Energy | Min ticks @ 20 e/t (2 sources fully mined, 100% to controller) |
|------|--------|------------------------------------------------------------------|
| 1→2 | 200 | ~10 |
| 2→3 | 45,000 | ~2,250 |
| 3→4 | 135,000 | ~6,750 |
| 4→5 | 405,000 | ~20,250 |
| 5→6 | 1,215,000 | ~60,750 |
| 6→7 | 3,645,000 | ~182k |
| 7→8 | 10,935,000 | ~547k |

Real bots spend a large share on bodies + construction, so **live times are multiplies of these floors**.

## Community / speedrun-ish targets (game ticks)

Sources: [speedrun.com Screeps World](https://www.speedrun.com/Screeps_World) (RCL5 category; top runs ~12–30k *in-game* scale), public vids (~19k to RCL5), forum/reddit (RCL8 often multi-week wall-clock on MMO).

| Milestone | Elite / speedrun | Solid automated bot | Lazy / unoptimized |
|-----------|------------------|---------------------|--------------------|
| RCL 2 | &lt; 300 | &lt; 800 | 1–2k |
| RCL 3 | &lt; 3k | &lt; 6k | 10k+ |
| RCL 4 | &lt; 10k | &lt; 18k | 30k+ |
| RCL 5 | **~12–20k** | **~25–40k** | 60k+ |
| RCL 8 | rare / hyper-optimized | **~150–250k** | 400k+ |

**Pacifist goal when we unpark:** beat **solid automated** column first; chase elite after layout + spawn plan are sane.

## When unparking, optimize in this order

1. Dynamic layout done (shorter paths, extensions online early).
2. RCL1–4 spawn plan: max upgrade throughput, no remotes until RCL4+.
3. Container/link timing vs pure drop mining.
4. Measure on `pacifist-race` E2S7 with `resetSpeedrun("E2S7")` → `speedrunStatus()`.

Do **not** enable power mode for races (enemy PC exposure).
