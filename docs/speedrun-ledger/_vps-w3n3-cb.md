# VPS W3N3 — second push-vps, CB landed

HTTP-only poll dest `vps` (`http://screeps.marlyman123.com`). Token worked. No SSH, no unclaim, **no further push**.

Second `push-vps` **2026-08-16T00:40:52Z** (`GET /api/user/branches` main). Deployed `main` contains `maybeSpawnColonyBuilder`, `finishableSpawnSiteRoom`, `roomLooksSpawnlessOwned`, `Must run even when colonise`.

| | |
| --- | --- |
| Polled | 2026-08-16 · ticks **2078604** → **2078761** → **2078855** |
| Host | hostname first; no fallback |
| User | `pacifist` · `5974db007b0e636` · GCL **32.33M** = **GCL5** · 5 rooms |
| CPU | last ~29 · 100-tick avg **21.2** · **bucket 10000** |
| `target_colonise` | **{}** (still empty — CB dispatched anyway) |

DG clock **2088915**. Ticks-to-DG **10311** @ 2078604 → **10060** @ 2078855 (~84 min @ ~0.5 s/tick).

---

## W3N3 spawn site

**Building.** Not a brick. Finishable extra.

| | |
| --- | --- |
| RCL | **1** p=0 · ctrl **33,32** |
| ticks-to-DG | **10060** @ 2078855 |
| SM | avail **0** · CD **2118302** (after DG) |
| Our spawn | **none** standing |
| Our site | **Spawn7 28,28 · 400/15000** (was 0/15k @ 2078761; first dump this poll) |
| Creeps | **1** — `ContainerBuilder-855091-W1N1` @ **15,10** (source 14,9), store **192e** |
| Foreign | container site 13,8 user `3c26d857e5014e4` **2358/5000** (unchanged) |
| planV2 | **no** · `planPackMiss` **2078014** |
| pack | seg 86 = W2N1 / W1N2 / W3N1 only. No W3N3. |
| `basePlan.structures.spawn[0]` | **28,28** (hub present). `basePlan.spawn` **unset** — Memory scan would miss; live site / vision path is what matched. |

CB entered south edge @ 2078761 (`22,46`, 400e), walked to the site, dumped 400 → **400/15k**, then harvested.

8W locally ≈ 40 e/t → **~365 ticks** to finish from here (plus harvest trips). Budget **~10k DG**. Comfortable.

---

## ContainerBuilder — W1N1 spawn_list / walking

**Hatched. Walking / on-site. Not queued.**

| | |
| --- | --- |
| Name | `ContainerBuilder-855091-W1N1` |
| Role | `buildcontainer` · `targetRoom: "W3N3"` · `homeRoom: "W1N1"` · `fill: false` |
| Body | **8W8C8M** (`getBody([W,C,M], …, 24)`) |
| W1N1 `spawn_list` | **[]** (already out). W2N1 / W3N1 / W1N2 / W3N3 lists also empty. |
| 2078604 | **W3N1 23,26** · 400e · walking |
| 2078761 | **W3N3 22,46** · 400e · just entered |
| 2078855 | **W3N3 15,10** · 192e · mining after first dump |

No second CB. W1N1 three spawns busy on EnergyMiner / Carrier (not CB). `Memory.creeps` has exactly this one `buildcontainer`.

Mother: W1N1 storage **147.8–148.5k** · RCL8 · `danger` false · closest funded. W3N1 storage **7.4k** (cannot pay).

---

## W2N1 sites (naked-shell)

Freeze room is **siting the shell**. Still 0 roads / 0 ramparts standing.

| | |
| --- | --- |
| RCL | **7** p=**183k** · ticks-to-DG ~150k |
| Storage | **300** (was 0; minerals leftover) |
| Ext E | **1457 / 4000** · Spawn2 E=0 |
| Standing | 1 spawn · 40 ext · 2 towers · 3 labs · 3 links · 0 roads · 0 ramparts · 0 containers |
| Sites | **7** — rampart 4,9 · rampart 4,10 · road 1,9–1,13 (all 0 progress) |
| danger / fuse / stall | **true / true / 0** · foreign `cl11302` @ **20,0** (W2N2 owner `3c26d857e5014e4`) |

Naked-shell is placing. Not building yet (no worker on those tiles this poll).

---

## W1N1 labs

**Still no lab sites.**

| | |
| --- | --- |
| RCL | **8** p=0 · ticks-to-DG ~157k · SM avail 7 |
| Storage | **147.8k** (still **< 150k** freeze) · term not re-read this pass |
| Labs standing | **7** |
| Sites | **0** (no lab, no other) |

Freeze holds. Intended.

---

## DG remaining

**10060 ticks** to unclaim (DG **2088915**). Site **400/15000** and a live 8W CB in the room. Will not drop if this CB lives.

`SC("W3N3", 28, 28)` **not needed.**
