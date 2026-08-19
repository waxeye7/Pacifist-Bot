# RCL3 spend model

Offline constant-rate tick model. No live server, no docker.
`node tools/server/_rcl3-spend-model.mjs`

## Income

- 2 sources saturated at 10 e/t each = **20 e/t** harvested.
- **16 e/t** to the room after miner/hauler tax (assumed, not derived).
- Spawn tax (parameter): 2 miners × 550e/1500t + 2 haulers × ~400e/1500t = **1.267 e/t**.
- Default net to upgrade+build: 16 − 1.267 ≈ **14.7 e/t**.
- Sweep: 12 e/t / 14.7 e/t / 16 e/t.

## Costs

- RCL3 controller: **135000**.
- Leftover 5 ext: 15000. Depot (container): 5000. Tower: 3000.
- RCL4 remaining build after (storage first, then leftover-if-C, then 10 new ext):
  - **A** instant: storage 30000 + 10 ext 30000 = **60000**
  - **B** depot+tower then ext: storage 30000 + 10 ext 30000 = **60000**
  - **C** hold-to-RCL4: storage 30000 + leftover 15000 + 10 ext 30000 = **75000**
  - **D** depot then ext then tower: storage 30000 + 10 ext 30000 = **60000**
  - **F** half-progress: storage 30000 + 10 ext 30000 = **60000**

## Policies

- **A instant:** 15k ext first, then depot 5k, tower 3k, rest controller
- **B depot+tower then ext:** depot 5k, tower 3k, leftover 15k, rest controller
- **C hold-to-RCL4:** depot 5k, tower 3k, ALL rest controller (leftover 15k after RCL4 — does not delay RCL4)
- **D depot then ext then tower:** depot 5k, leftover 15k, tower 3k, rest controller
- **F half-progress:** depot 5k, tower 3k, upgrade to 67500, then 15k ext, then rest

## Energy (rate-independent)

| policy | e → RCL3 | e → storage | RCL4 remaining |
| --- | ---: | ---: | ---: |
| A instant | 158000 | 188000 | 60000 |
| B depot+tower then ext | 158000 | 188000 | 60000 |
| C hold-to-RCL4 | 143000 | 173000 | 75000 |
| D depot then ext then tower | 158000 | 188000 | 60000 |
| F half-progress | 158000 | 188000 | 60000 |

Storage is first after RCL4, so leftover-if-C does **not** delay storage-up.
A = B = D = F on both clocks: leftover 15k is still paid on the 135k climb.
Only **C** drops 15k off the RCL3 clock (and the storage clock).

## Ticks (ceil(energy / net))

| policy | 12 RCL3 | 12 storage | 14.7 RCL3 | 14.7 storage | 16 RCL3 | 16 storage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A instant | 13167 | 15667 | 10749 | 12790 | 9875 | 11750 |
| B depot+tower then ext | 13167 | 15667 | 10749 | 12790 | 9875 | 11750 |
| C hold-to-RCL4 | 11917 | 14417 | 9728 | 11769 | 8938 | 10813 |
| D depot then ext then tower | 13167 | 15667 | 10749 | 12790 | 9875 | 11750 |
| F half-progress | 13167 | 15667 | 10749 | 12790 | 9875 | 11750 |

## Ignores

- **Walk** — travel time to sites / controller / sources.
- **Site cadence** — 15-tick recycle, `maxSitesFor`, unused road slots.
- **HOL** — spawn queue blocking the parked 4W / next miner.
- **Body unlocks** — 800-cap 6W miner, `[4W,2C,2M]`, bigger haulers. Net is constant.
- Repair, decay, tower shots, remotes, swamp, first-RCL3 bootstrap (this clock starts already at RCL3 with 5 ext).

