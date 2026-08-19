# RCL4 leftover 5 — when we HAVE to build them

Owner is right: they get built. This pins WHEN.
Hypo: leftover 5 deferred through all of RCL3. RCL4 opens at 5 ext / **550**. Storage 30k. Then 15 ext (5 deferred + 10 new) = 45k to **1300**.

Live already sites leftover 5 at RCL3 once depot+tower exist (`rcl3SecondExtWaveReady` in `PlanV2.ts`). `_ext-policy.md` said skip the whole climb. This file is the RCL4 call if they are still sitting.

---

## Bodies (getBody = 85% of cap; one segment may still ship if it fits raw cap)

Cap = 300 + 50×ext.

- **>550 → first new body is 750 (9 ext):** home miner `[2M,6W,M]` (`rooms.spawning.ts` ≥750, RCL<6). Same 10 e/t as `[5W,M]`. Not a reason. `_ext-6w.md`.
- **800 (10 ext):** RCL4 builder `getBody([W,3C,M])` → `[2W,6C,2M]` = 600. Upgrader still one `[4W,C,M]` = 500.
- **1000 (14 ext):** nothing new. 85% of 1000 = 850 → still 1×500 upgrader, still 2×300 builder.
- **~1200 / 1300 (18 / 20 ext):** **8W upgrader** = `getBody([4W,C,M])` × 2 = 1000. Needs `floor(cap×0.85) ≥ 1000` → cap ≥ 1177. **2×CLAIM** hard-gated at 1300 (`reserverGate`).

There is **no RCL4 8W miner**. 8W miners are RCL6+. `_ext-policy.md` “8W stack needs 1000 (14 ext)” is the upgrader 2-stack, and 14 ext is not enough under the clamp.

RCL4 filler `[4C,2M]` = 300. Remote miner ≥500 = `[4W,2M]`. Both fit 550.

---

## Gates — none of “800 before storage” / “1000 before 8W”

- `PLACE_ORDER`: spawn → **storage** → tower → container → **extension**.
- `findLocked`: storage/link before ext. RCL3 depot-before-ext is `level == 3` only.
- `extensionTake` RCL4+ = engine 20. Leftover 5 are not a separate wave.
- `maxSitesFor`: 4 until `room.storage.my`, then **8**.
- Remotes open at **RCL≥4**, not storage, not 800.
- Fillers: `fillersWanted` needs a bank (≥200e real storage). Body 300.
- Home 2:1 carriers: `room.storage.my`, not cap.
- 8W: getBody only. No `>= 1000` gate.

---

## Sequence

**Storage first, then dump all 15.** Same 30k as ten ext, but fillers / 2:1 / bank floors / 8-site dump all key off `room.storage`.

Leftover 5 first (15k → 800) then storage: no. Buys 6W (same yield) and a 2× builder before the box. Wall-clock to a standing storage is not better (15k@5 e/t + 30k@10 ≈ 30k@5). Mix/trickle: no — 4 site slots until storage.

---

## 550 for the first ~2k ticks of RCL4

Does not break remotes, fillers, or 8W.

- Remotes: miner 500, 1:1 carriers at 550. Reserver stays off until 1300.
- Fillers: absent until storage has ≥200e. RCL4 builders still queue without a real bank.
- 8W: cannot exist yet.
- RCL4 maintainer 1150 is unaffordable; clamp trims/drops. Rampart scan is inside `if (storage)`.

---

## First MUST-BUILD

Leftover 5 have **no independent must**.

- First body that cannot hatch at 550: **6W miner @ 750**. Do not build them for this.
- First system that actually needs those 5: **8W upgrader** (and 2×CLAIM if remotes + no free GCL slot) at **1300** — leftover 5 **plus** the ten new, **after** storage.

**After `room.storage.my`, site the remaining 15. Not before.**
