# VPS W3N3 — CB walk

HTTP GET only. dest `vps` (`http://screeps.marlyman123.com`). No SSH, no world write, no push, no unclaim.

| | |
| --- | --- |
| Polled | 2026-08-16T00:46:35Z → **00:50:18Z** |
| `GET /api/game/time` | **2078994** → **2079463** |
| Tick rate | **~470 ms/tick** (469 / 223 s) |
| Host | hostname first; no fallback |
| User | `pacifist` · `5974db007b0e636` · GCL **32.34M** · 5 rooms |
| CPU | last ~19 · avg ~18 · **bucket 10000** |

Prior: [`_vps-after-push.md`](./_vps-after-push.md) tick **2078303** (CB hatching). [`_vps-w3n3.md`](./_vps-w3n3.md) tick **2077471** (0 creeps / 0/15k).

Claimed **2068915**. Age **~10.5k**. DG **2088915** → **9452 left** (~74 min).

---

## Answers

| Q | Live |
| --- | --- |
| CB position | **In W3N3.** `ContainerBuilder-855091-W1N1` @ **20,15** walking SE toward Spawn7 (full 400). Hatched W1N1 Spawn3 @ **2078355**. |
| Spawn site | **Spawn7 28,28 · 2400/15000** (was 0 at hatch). Foreign container 13,8 still **2358/5000** — spawn-first held. |
| ETA vs DG **2088915** | **This life will not finish.** `ageTime` **2079854** (TTL **~391**). Site ~3.7k at death. Need **3–4 more sequential CBs**. Still **inside DG** if W1N1 keeps sending (~3–6k margin). |
| W2N1 sites | **7 · all p=0.** 2 rampart + 5 road. Standing roads **0**, ramparts **0**. Storage **0**. |

---

## CB track

One creep. `target_colonise` still `{}`. W1N1 `spawn_list` empty — no second CB (gate: existing `buildcontainer` with `targetRoom: W3N3`).

Body **8W 8C 8M**. `fill: false`. `ageTime` **2079854**.

| tick | where | e | building | Spawn7 |
| ---: | --- | ---: | --- | ---: |
| 2078303 | W1N1 Spawn3 hatching (`spawnTime` 2078355) | — | — | **0** |
| 2078604 | W1N1 **23,26** | 400 | — | 0 |
| 2078994 | W3N3 **18,10** (at source 14,9) | 353 | false | **800** |
| 2079100 | W3N3 **22,17** → 29,25 | 400 | true | **1200** |
| 2079277 | W3N3 **45,14** (east detour) → 43,13 ×29 | 351 | false | **2000** |
| 2079463 | W3N3 **20,15** fatigue 16 | 400 | (move) | **2400** |

Walk in was slow (~540 t hatch→room). One east-edge detour (old drop was 49,14). Then back on the source↔spawn shuttle.

Source 14,9. Spawn 28,28. 8 MOVE = 1 tile/tick plains. In-room rate measured **~3.4 e/t** (1600 progress / 469 t after first dump). Cycle ~100 t / 400 e.

---

## ETA vs DG 2088915

| | tick | site | vs DG |
| --- | ---: | ---: | ---: |
| now | 2079463 | 2400 | 9452 left |
| this CB dies | **2079854** | **~3700** (391 t × 3.4 e/t) | 9061 |
| spawn standing (if replacements walk) | **~20832xx–20860xx** | 15000 | **~3–6k slack** |

One 8W life builds ~3–4k after the walk. Live code sends **one at a time** (`maybeSpawnColonyBuilder` returns if any CB already targets the room). Next hatch only after **2079854**.

W1N1 can pay: storage **147k**, !danger, bucket 10k, 3 spawns. W3N1 12.8k also funded; loses energy tie-break.

**Pass:** W1N1 queues `ContainerBuilder-*-W1N1` `targetRoom: W3N3` within ~100 t of 2079854; Spawn7 keeps climbing. **Fail:** site frozen ~3.7k after 2080000 with no CB on the map — then check W1N1 storage/danger/`spawn_list`.

Do **not** unclaim. Do **not** `push-vps`. `SC` still optional (binary already has `finishableSpawnSiteRoom`).

---

## W2N1 — shell sites, zero progress

RCL7 p=183k · storage **0** · `danger` **true** / `blown_fuse` **true** · Spawn2 hatching Sweeper · ext **full** (4000) · towers 690 / 0 · standing roads **0**, ramparts **0**.

Sites (all ours, all **p=0**):

- rampart **4,9** and **4,10** (1/1)
- road **1,13** **1,12** **1,11** **1,10** **1,9** (300)

After-push was **6**. Now **7** (+ road 1,9). Still nobody building them (no builder in room). Naked-shell budget leak unchanged.

Filler @19,1 (W2N2 edge). Neighbor W2N2 still `3c26d857e5014e4`.

---

## Other rooms (same polls)

| Room | storage | sites | note |
| --- | ---: | --- | --- |
| W1N1 | **147365** | 0 | freeze still on (<150k). No 2nd CB queued |
| W3N1 | 12795 | 0 | freeze held (<80k) |
| W1N2 | 1256 | 1 road 20,39 + 1 ramp 7,47, both 0 | roads standing 0 |
| W3N2 | — | 4 border roads (one 150/300) | our remote; walk corridor |

W3N3: no spawn standing · no our container · `planV2` no (`planPackMiss` 2078014) · `c_spawned` 0 · `danger` false.
