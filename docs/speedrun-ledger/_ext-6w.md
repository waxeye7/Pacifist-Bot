# RCL3 leftover 5 ext vs a 6W miner

Home rungs, `spawn_energy_miner` (`src/Rooms/rooms.spawning.ts` 4112–4178). `targetRoom == home`, RCL&lt;6:

- cap 550–749 → `[5W,M]` = 550 (line 4176). 5×2 = 10 e/t.
- cap ≥750 → `[M,M,6W,M]` = **750** (line 4159). 6W+3M. Not `[6W,M]` = 650. No 650 body exists.

Full RCL3 is spawn+10 ext = 800. `800 >= 750` is true, so the code **does** switch on replacement (`lastSpawn` + 1500). It does **not** spawn the 650 body.

`_ext-policy.md` “next miner rung is 750 and still 5W at home” is wrong on the parts, right on the yield.

A 3000-energy source regen is 10 e/t. 5W already saturates the tile. 6W is 12 theoretical, still 10 delivered.

Two sources × +1 e/t = **+0 e/t**, not +2. The 15000/2 = 7500-tick payback never starts.

Walk is the only leftover: `[6W,3M]` is 1 t/tile empty on plains; `[5W,M]` is 3 t/tile. One walk per 1500-tick life, ~10–20 tiles → ~20–40 extra mine-ticks (~200–400e). Room-wide ~0.3 e/t. 15k / 0.3 ≈ 50k ticks to repay the five ext.

RCL3 climb is 135000/16 ≈ 8438 ticks. Walk savings do not pay before RCL4.

Spawn tax goes the other way: +200e/miner (the extra 2M) every 1500t × 2 sources ≈ −0.27 e/t.

**Verdict:** leftover 5 ext at RCL3 buy a same-yield, more expensive miner. Not `[6W,M]`. No +2 e/t. No payback on the 135k climb. Defer them (`_ext-policy.md`).
