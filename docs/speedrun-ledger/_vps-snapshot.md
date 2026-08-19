# VPS live-health snapshot

HTTP-only poll of dest `vps` (`http://screeps.marlyman123.com`). No SSH, no world writes, no code push.

**These rooms are mature RCL6–7. They are not spawn→RCL4 samples.** Live-health only.

| | |
| --- | --- |
| Polled | 2026-08-13T10:24Z |
| Host | `http://screeps.marlyman123.com` (screeps.json dest `vps`) |
| `GET /api/game/time` | `{ ok: 1, time: 1743353 }` (recheck ~2 min later: `1743504`) |
| `GET /api/auth/me` | user `pacifist` · `_id` `5974db007b0e636` · `gcl` 25705557 · `cpu` 100 · `money` 0 |
| `GET /api/user/rooms?id=5974db007b0e636` | `W1N1`, `W3N1`, `W2N1`, `W1N2` |
| `GET /api/user/memory?path=speedrun` | **200** (gzip `gz:` payload; decoded below) |
| `GET /api/user/memory` | **200** (full Memory, gzip) |

Auth headers: `X-Token` + `X-Username` = dest token.

---

## Room table (from `/api/game/room-objects`)

Objects fetched immediately after tick **1743353**. All four rooms owned by `5974db007b0e636`. No foreign creeps. No spawn currently spawning.

| Room | RCL | ctrl.progress | downgradeTime | safeMode (raw) | SM avail | Spawns | Ext | Towers | Storage E | Terminal E | Links | Labs | Ext E | Creeps | Sites |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| W1N1 | **7** | 8 501 540 | 1 893 365 | 68 460 | 6 | 2 (Spawn3, Spawn1) | 50 | 3 | 120 216 | 40 100 | 4 | 6 | 5 000 / 5 000 | 11 | 0 |
| W2N1 | **6** | 2 889 917 | 1 860 372 | 1 228 725 | 3 | 1 (Spawn2) | 40 | 2 | 17 | 0 | 3 | 3 | 1 250 / 2 000 | 4 | 2 rampart |
| W3N1 | **6** | 1 833 798 | 1 863 231 | 1 257 346 | 4 | 1 (Spawn5) | 40 | 2 | 0 | 0 | 3 | 3 | 550 / 2 000 | 11 | 3 rampart |
| W1N2 | **6** | 1 634 716 | 1 863 366 | 718 831 | 3 | 1 (Spawn4) | 40 | 2 | 65 | 0 | 3 | 3 | 1 750 / 2 000 | 6 | 0 |
| **Σ** | | | | | | **5** | **170** | **9** | | | **13** | **15** | | **32** | **5** |

`progressTotal` was **0 / omitted** on every controller in this API. Not invented.

Each room also has: storage 1, terminal 1, extractor 1, container 3–4, roads 59–78, ramparts 36–68, walls 0, factory/nuker/observer/powerSpawn 0. Extension `storeCapacityResource.energy` is 100 in W1N1 and 50 in the RCL6 rooms.

`ticksToLive` was omitted on every creep in `room-objects`.

---

## Creep mix (name prefix → count)

| Room | n | Breakdown |
| --- | ---: | --- |
| W1N1 | 11 | Carrier 4, EnergyMiner 2, ControllerLinkFiller 1, EnergyManager 1, filler 1, Upgrader 1, Sweeper 1 |
| W2N1 | 4 | EnergyManager 1, EnergyMiner 1, Maintainer 1, Filler 1 |
| W3N1 | 11 | Carrier 3, Filler 3, EnergyMiner 2, ControllerLinkFiller 1, EnergyManager 1, Upgrader 1 |
| W1N2 | 6 | Filler 2, EnergyManager 1, EnergyMiner 1, Upgrader 1, Sweeper 1 |

Hits == hitsMax on every listed creep.

---

## `Memory.speedrun` (decoded)

Endpoint exists. Payload is official `gz:` + gzip + base64.

```json
{
  "startTick": 48461,
  "rclTimes": {
    "1": 48461,
    "2": 49089,
    "3": 59818,
    "4": 72241,
    "5": 128241,
    "6": 215898,
    "7": 613349
  },
  "lastRcl": 7,
  "roomName": "W1N1"
}
```

W1N1-only historical RCL timestamps, not a live four-room race ledger. Deltas from those ticks:

| Stage | tick | Δ from previous |
| --- | ---: | ---: |
| start / RCL1 | 48 461 | — |
| RCL2 | 49 089 | 628 |
| RCL3 | 59 818 | 10 729 |
| RCL4 | 72 241 | 12 423 |
| RCL5 | 128 241 | 56 000 |
| RCL6 | 215 898 | 87 657 |
| RCL7 | 613 349 | 397 451 |

Now ~1.13M ticks past that RCL7 mark (`1743353 − 613349`).

---

## Live-health notes (observation only)

- W1N1 is the only fat room: full 50/2 RCL7 spawn+ext, full ext energy, 120k storage + 40k terminal.
- W2N1 / W3N1 / W1N2 are RCL6 with storage ≈ 0–65 and terminals empty. W3N1 ext energy 550/2000. Not spawn-RCL4, but not energy-healthy either.
- All four controllers still owned; no reservation objects; no hostile creeps in these rooms at poll time.
