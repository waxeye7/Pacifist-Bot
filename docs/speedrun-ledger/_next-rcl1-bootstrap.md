# Next race — RCL1 2-source bootstrap HOL

After `run-2026-08-14T01-06-48Z` ends. **Do not implement now. Do not touch that run. Do not `push-race`.**

One knob. `_rcl2-ideas.md` §6 / rank #3. Cycle-0 miss in `_cycle0-adversary-spawn.md` §Might HURT. Metric: mean spawn-placement → RCL2 (200 progress). Every bench room is 2-source.

---

## Live miss

Opening 300 is supposed to buy `[W,C,M]` 200 + `[C,M]` 100.

`spawn_energy_miner` walks every home source and `unshift`es (`rooms.spawning.ts` `:4035` / `:4038` / `:4046`). Same pass:

1. Source A, `isRcl1Bootstrap && !homeHasMiner` → `[W,C,M]` (`:4194–4196`). `homeHasMiner` (`:4004`) is then true (queued counts).
2. Source B → else `[W,W,M]` 250 (`:4198–4199`). Second `unshift` puts 250 at head.
3. Spawn spends 300 on the 250. Leftover 50 buys neither the 200 nor the 100. `[C,M]` waits on regen + interleave-10.
4. `[W,C,M]` stamps `values.lastSpawn = Game.time - (CREEP_LIFE_TIME - 100)` (`:4207–4210`). At T+101 the 1W is live (`minerOnTheWay`) but not queued, so the `queuedForSource` skip (`:4090`) misses and a **third** miner unshifts while the 1W still has ~1400 TTL.

`getCarrierBody` / `homeCarriersWanted` already do the right first hauler (`[C,M]`, want 1) under `isRcl1Bootstrap`. They never see the leftover 100. RCL1 upgrader stays `spawnrules[1].upgrade_creep.amount === 1`, `getBody([W,C,C,M])` = 250 — behind the 250 HOL.

`dumpMinerEnergy` (`energyMiner.ts:187–214`) walks a load in only when RCL≤2, no **hatched** hauler, spawn/ext Chebyshev ≤8. Far source always drops. A CARRY miner cannot drop-mine — dump is a harvest skip.

`identifySources` (`rooms.ts:632–646`) inserts `resources[room].energy` in `find(FIND_SOURCES)` order, not hub-near. First key can be the long tile (E9S1 `srcSteps` 3+41).

Tick-0 fallback `!lastSpawn && Game.time < CREEP_LIFE_TIME` (`:4294–4299`) is inert on this seed (~3.12e6). Leave it.

---

## Exact change

File: `src/Rooms/rooms.spawning.ts`. Function: `spawn_energy_miner`, home `energyCapacityAvailable <= 300` branch (`:4189–4218`).

**1. One home miner until a hauler has hatched.**

Do not reuse `roomHasHauler` — that is true the tick `spawn_carrier` *pushes* `[C,M]`, so source B would unshift 250 at T+1 on top of a still-spawning 200.

Add next to `roomHasHauler` (`:4021`):

```ts
function hatchedHomeHauler(room): boolean {
    return _.some(Game.creeps, (c: any) =>
        (c.memory.role == 'carry' || c.memory.role == 'FakeFiller' || c.memory.role == 'sweeper') &&
        (c.memory.homeRoom == room.name || c.room.name == room.name) &&
        !c.spawning);
}
```

Same predicate `dumpMinerEnergy` already uses (`energyMiner.ts:194–197`).

In the cap≤300 body pick, **`return` without unshift** when bootstrap is still open and a miner is already live/queued/hatching but no hauler has left the spawn:

```ts
else if (isRcl1Bootstrap(room) && !homeHasMiner(room)) {
    body = [WORK, CARRY, MOVE];
} else if (isRcl1Bootstrap(room) && !hatchedHomeHauler(room)) {
    return; // leftover 100 must buy [C,M]; do not unshift [W,W,M]
} else {
    body = [WORK, WORK, MOVE];
}
```

`return` here matches today's control flow (skips `index++`, so the `index == 1` sweeper push at `:4053` stays dead on the first pass). Do not fall through.

After the `[C,M]` hatches, source B is allowed the 250 `[W,W,M]`. That HOL is *after* the opening 300 is spent. Leave it.

**2. Drop the T+100 re-arm.**

Delete the CARRY special case at `:4207–4210`. The `[W,C,M]` uses the same `lastSpawn` as a 300e `[W,W,M]` (`:4212–4217`: open-positions `Game.time + rand - 450`, else `Game.time - 20`). No third miner at T+100. Replacement stays ~T+1050.

Do not add a nearest-source pick. First miner stays first `data.energy` key.

---

## Do not bundle

- Body A/B: keep `[W,C,M]` + `[C,M]` + `dumpMinerEnergy`. Do **not** revert to `[W,W,M]` + `[C,C,M]` (`32b151f`) this race.
- Pin first miner to the nearer source. Follow-up only if split/far rooms lose.
- Delete the tick-0 `[W,W,M]` fallback (`:4294–4299`).
- `spawnrules[1].upgrade_creep` (stay `amount: 1`, 250e `[W,C,C,M]`).
- `getCarrierBody` / `homeCarriersWanted` bootstrap (`[C,M]`, want 1). Two `[C,M]` pushes (one per source) are fine — second sits behind leftover 100.
- `dumpMinerEnergy`, `isRcl1Bootstrap`, `homeHasMiner`, `roomHasHauler`.
- Recycle 200e shuttles at 550. RCL2 roster 4 vs 6. Force `[5W,M]` at 550. Container tile. Remotes floor. Interleave-10. Builder bodies / `earlyBuildSlots`. RCL3 upgrader 4 vs 2.
- Any keep from cycle 0 (builder miner-gate, `getBody` off cap, no 800e maintainer, CLF RCL5+).

---

## Expected spawn→RCL2

Model, not measured. Clock is ~1k ticks (this baseline cand 381–1088, ctrl 859–1149).

Dump class is spawn/ext Chebyshev, **not** `srcSteps` from the anchor (E4S7 is 8+22 from the anchor and still far from the spawn).

| class | rooms | dump ≤8? | Δ |
| --- | --- | --- | --- |
| **Near** | E13S7 / E21S4 (`srcStepsSum` 5–8; both sources at or inside spawn range 8) | yes — walk-in pays | **−50 to −200** |
| **Split** | E9S1 (3+41, spawn 6 / 30), E8S3 (4+18, spawn 8 / 22), E6S1 (2+12, spawn 7 / 15) | only the short tile | **−50 to −200** if first `energy` key is the short source; **flat / +** if it is the long tile (CARRY miner, dump never walks, 1W for ~1500t) |
| **Far-only** | both sources >8 from spawn. Hard band `srcStepsSum` 21–47 (E5S3 18+29, E8S5, E13S9) and E4S7 (8+22 from *anchor*, 12–20 from spawn) | no | **sign can flip (+)**. Killing HOL 250 + the T+100 third miner still removes spawn tax; a leftover `[W,C,M]` on the long tile is 2 e/t vs a 2W drop and dump is a harvest skip. |

Mean moves if near+split win more than far-only loses. Read the mean **and** the pair split. A green mean with red hard rooms is the flip, not a keep.

RCL2→RCL3 carry-in is small (one extra early `[C,M]`, no third 250e body). Not the reason to run this.

---

## Film / dashboard — first 200 elapsed

`http://127.0.0.1:8767/` pair film. `cr` is `[roleTag, x, y]`; `roleTag` = first two capitals of the name prefix (`race-dash.mjs` `roleTag`). Film does **not** encode body. HUD `en` / `cap` / `p` do.

| tag | name prefix |
| --- | --- |
| `EM` | EnergyMiner |
| `CA` | Carrier |
| `SW` | Sweeper |
| `UP` | Upgrader |

Scrub `e` 0–200 on every slot (spawn `st` present, `rcl` 1, `p` climbing).

**Fail (this baseline):**

- `e≈0–20`: one `EM` (the 250, source B). HUD `en` ~50 after it starts, not ~100.
- `CA` missing until regen+interleave (`e≈50–120`).
- `e≈100–180`: **3× `EM`** while the first two still live (T+100 re-arm). `UP` still absent (250 HOL).

**Pass:**

- `e≈0–15`: **1× `EM` only**. HUD `en` sits ~100 after the 200 starts (3 parts × 3 = 9 ticks).
- `e≈15–25`: **1× `EM` + 1× `CA`** (`[C,M]` 2×3 = 6 ticks).
- Second `EM` only after that `CA` is on the map (`!spawning`).
- **No third `EM` before `e≈200`.**
- Near (E13S7 / E21S4): first `EM` leaves the source toward the spawn when full. Far: `EM` stays on the tile; `CA` walks out.

Count `EM` at `e≈150`. 3 = miss still live. 1–2 = this knob landed.
