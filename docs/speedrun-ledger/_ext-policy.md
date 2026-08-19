# Early-game extension policy (spawn → RCL4)

Hard rec for the local race. No code change this file. `siteBudgetFor` is not a name — live budget is `maxSitesFor` in `src/utils/PlanV2.ts` (5 at RCL2 so all five ext site in one 15-tick pass, else 4). Siting order: `RCL2_ORDER` (ext before container) / `PLACE_ORDER` (storage → tower → container → ext). Builder `findLocked`: depot (RCL3) → all ext → tower → leftover containers.

Race context: candidate RCL2 mean **918 (7/8)** vs control **1057 (8/8)**. No RCL3 yet. Clock is spawn → RCL4.

Costs: ext 3k, tower 3k, container 5k, storage 30k. Climbs: RCL2 45k, RCL3 135k.

---

**RCL2 — yes, all five instantly.** 300 → 550 is the only early body breakpoint that pays. Home miner stays `[2W,M]` (4 e/t) from cap 300 through 549 (`getBody([W,W,M])` cannot buy the second 250 segment under the 85% clamp; the dedicated `[5W,M]` rung is `energyCapacityAvailable >= 550`). That is source saturation, 10 e/t, the whole RCL2 income step. Shuttle upgrader also becomes `[2W,2C,2M]` (400) at 550; builder stays 300; carriers stay ≤400. Five ext = 15k next to the hub, already sited in one pass and preferred by the builder. Do not trickle 1–2 ext and sit on a 2W miner for the 45k climb. Keep `RCL2_ORDER` + `maxSitesFor(2)===5`. Then the first source container.

**RCL3 — not until RCL4.** After the controller depot and the first tower, do **not** spend the next five (550→800) on the 135k climb. Math: 5×3k = 15k (11% of 135k) for a cap the parked 4W does not need (`[4W,C,M]` is already 500; 550 is enough). At 800, `getBody([4W,C,M])` is still one 500 segment (85% of 800 = 680). Miner is already 5W; next miner rung is 750 and still 5W at home. RCL1–3 carriers/repair/builder are hard-capped so they do not HOL the 4W. The RCL4 8W stack needs **1000** (14 ext), not 800. Current builder still finishes leftover ext before the tower — that is the wrong spend; depot then tower (guardrail), then second-source container if anything, recycle on roads. `baseIsFed` already treats 550 as the spawn floor because leftover ext starve the depot. Defer the five.

**RCL4 — storage first, then the remaining extensions.** Same 30k as ten ext, but every logistics gate keys off `room.storage` (fillers, bank floors, remotes-at-4, 1:1→2:1 carriers). Ten ext first would lock the 4-site budget on the 20-cap mass for thousands of ticks with no bank — the reason `PLACE_ORDER` already puts storage (and tower) ahead of ext. 800 still does not buy the 8W; 1300 does, and that stack only pays once energy can sit in the box instead of twenty extensions. Build storage, then the deferred RCL3 five plus the ten new (15×3k) on the 15-tick cadence. Builder already prefers storage/link over ext; keep that.

---

**One line:** slam 5 at RCL2 (550 / 5W miner), skip the next 5 through the 135k climb (800 is dead), storage before any RCL4 ext.
