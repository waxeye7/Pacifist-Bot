# VPS W3N3 — second CB on site

HTTP GET only. dest `vps` (`http://screeps.marlyman123.com`). No SSH, no world write, no push, no unclaim.

| | |
| --- | --- |
| Polled | 2026-08-16T00:57:45Z → **00:58:50Z** |
| `GET /api/game/time` | **2080395** → **2080496** |
| Host | hostname first; no fallback |
| User | `pacifist` · `5974db007b0e636` · GCL **32.36M** · 5 rooms |
| CPU | last 15–46 · 100-tick avg **~20** · **bucket 10000** |

Prior: [`_vps-w3n3-walk.md`](./_vps-w3n3-walk.md) tick **2079463** (first CB dying, site 2400). First `ageTime` was **2079854**.

Claimed **2068915**. Age **~11.6k**. DG **2088915** → **8419 left** (~70 min @ ~0.5 s/tick).

---

## Answers

| Q | Live |
| --- | --- |
| First CB (`855091-W1N1`) | **Dead.** Gone from `Memory.creeps` and every room. Died **~2079854**. |
| 2nd CB queued / walking from W1N1? | **Neither.** Already **in W3N3**, building. Not on `spawn_list`. |
| Spawn site | **Spawn7 28,28 · 4600/15000** (4320 @ 2080395). Foreign container 13,8 still **2358/5000**. |
| DG remaining | **8419** ticks (DG **2088915**). |
| 3rd CB | **None.** W1N1 `spawn_list` **[]**, 3 spawns idle. Cap-1. |

---

## ContainerBuilder — 2nd already working

`Memory.creeps` has **one** `buildcontainer`. `target_colonise` still `{}`.

| | |
| --- | --- |
| Name | `ContainerBuilder-520185-W1N1` |
| Role | `buildcontainer` · `targetRoom: "W3N3"` · `homeRoom: "W1N1"` · `fill: false` |
| Body | **8W8C8M** |
| Hatch | `ageTime` **2081429** → spawn **~2079929** (~75 t after first died; 24-part `needTime` 72) |
| 2080395 | W3N3 **26,31** · 240e · walking to site |
| 2080496 | W3N3 **29,25** · 360e · `actionLog.build` **28,28** |
| TTL left | **933** (dies **2081429**) |

Walk-in leftover: `_exitStuck` 1 @21,1 / route exit W3N2. Building now — not stuck.

W1N1 / W3N1 / W3N2 / W2N1: **no other CB**. No CB on any `spawn_list`.

---

## Spawn site + ETA vs DG 2088915

| tick | site | vs DG |
| ---: | ---: | ---: |
| 2079463 (prior) | 2400 | 9452 left |
| 2080395 | 4320 | 8520 |
| **2080496** | **4600** | **8419** |
| this CB dies | **2081429** | **~7400** (933 t × ~3 e/t) | 7486 |
| spawn standing (if replacements walk) | **~20845xx–20860xx** | 15000 | **~3–4k slack** |

Need **10400** more. This life adds ~2.8k. Then **2 more sequential CBs** (cap-1). Same math as the walk note.

In-room rate this poll **~2.8 e/t** (280 / 101 t). Prior shuttle **~3.4 e/t**.

---

## maybeSpawnColonyBuilder cap-1

**Not waiting on the 2nd.** First death already released the gate; W1N1 hatched `520185` immediately.

Cap-1 is why there is **no 3rd** until **2081429**:

```
if (_.some(Game.creeps, c => c.memory.role == 'buildcontainer' && c.memory.targetRoom == need)) return;
```

Next hatch only after this one dies. Walk gap ~250–500 t with site frozen ~7.4k.

W1N1 can pay: storage **119k** (was 147k), !danger, bucket 10k, 3 idle spawns. W3N1 storage **13.6k** also funded; loses energy tie-break (same lin 2).

**Pass:** W1N1 queues `ContainerBuilder-*-W1N1` `targetRoom: W3N3` within ~100 t of 2081429; Spawn7 keeps climbing. **Fail:** site frozen ~7.4k after 2081600 with no CB on the map.

Do **not** unclaim. Do **not** `push-vps`. `SC` still optional.

---

## Other (same polls)

| Room | storage | note |
| ---: | --- | --- |
| W1N1 | **119035** | freeze still on (<150k). 0 sites. No 3rd CB |
| W3N1 | 13570 | freeze held. Hatching EnergyMiners. 0 sites |
| W2N1 | 0 | 7 shell sites still p=0. Storage dead |
| W3N2 | — | remote corridor; 2 ours; no CB |

W3N3: no spawn standing · no our container · `planV2` no (`planPackMiss` 2078014) · `danger` false.
