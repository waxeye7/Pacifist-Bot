# Next — extra-claim spawn bootstrap

Read-only. **Do not implement now. Do not edit `src`. Do not `push-main`.**
Do **not** unclaim **E36N57**.

One knob. Not a race A/B. Live shard3 extras (E36N59 / E36N58 / E37N57 / E38N59)
had 0 creeps, spawn sites at ~3500/15k, then the sites went to 0/15k and the
rooms dropped. Colony builders (`buildcontainer`) did not finish them.

---

## Live miss

Siting worked. Escort did not.

| poll | extras |
| --- | --- |
| `_status-tree.md` tick **82270524** | E36N59 site 19,7 **3500**/15k · E36N58 42,6 **3300** · E38N59 20,20 **350** · E37N57 26,29 **0**. **0 creeps** all four. DG 6.5–12.7k. |
| `_status-empire.md` tick **82277070** | E36N59 **DROPPED**. Remaining sites **0/15k**. E38N59 DG ~500 (dead). E36N58 / E37N57 DG ~6k. |

`autoExpand` was stuck `claimed` on a **foreign-spawn** brick (E39N58, later
E35N59). `Memory.target_colonise` stays that room. The extras were never it.

---

## Why colony builders do not finish those sites

Spawn-first is not the hole. Dispatch is. The role will finish a spawn site
**if a creep with `targetRoom` set to that room is standing in it**.

### 1. Role — would finish (gated correctly)

`src/Roles/buildcontainer.ts`:

- **`:80-88`** spawnless → `targets` filtered to `STRUCTURE_SPAWN` only.
  `findClosestByRange` cannot pick an extension.
- **`:125-150`** opportunistic upgrade / RCL1 walk-to-controller is
  `if (!buildTheSpawnFirst …) return`. While a spawn site exists they build it.
- **`:182-186`** re-sites `target_colonise.spawn_pos` only on `% 25`, only if
  **this creep is in the room**, no plan owns the spawn, no sites, no spawn.
  Planned extras never re-site from the role (`planOwnsTheSpawn`).

`fill: true` withdraws from the **mother** storage once, then walks. Empty
bank sets `fill = false` (`:49-53`) so they are not parked at home.

### 2. `ensureSpawnSite` — only the AutoExpand room

`src/Managers/AutoExpand.ts:174-186`. Phase `claimed` (`:477-491`), every 10
ticks: if no MY spawn and no spawn site on `st.spawnPos`, `clearPlanSpawnTile`
+ `createConstructionSite(SPAWN)`.

Does **not** run for extra owned rooms. Those get a site from
`placeFromPlanV2` / `spawnFirstLockdown` (`PlanV2.ts:141-157`, `:2052-2055`)
or legacy `ensureSpawnFirst` (`rooms.construction.ts:618-651`).
Lockdown strips **non-spawn** sites. It does not send a creep.

Foreign spawn on the brick rooms: RCL1–6 cap is 1. `ensureSpawnSite` cannot
complete a plan tile next to Zhaban/foreign `Spawn1`. CBs sent there idle.

### 3. Dispatch — one name, and it is the brick

`src/Rooms/rooms.spawning.ts:2523-2547`. The only `role: 'buildcontainer'`
push in the bot. Destination is **`Memory.target_colonise.room` only**.

Gates (all must pass): this room is the closest RCL3+ that can pay
(`storage > 10k`, else nearest fallback, `:2447-2505`); `containerbuilders < 2`
(**this mother’s** `homeRoom` count, `:690-693`); `!danger`; bucket `> 7750`;
linear distance `≤ 7`; target visible, `controller.my`, level ≥ 1, and
(no MY spawn **or** RCL≤1 **or** RCL≥4 thin).

Spawnless rooms cannot help themselves: `spawning()` returns at `:58-61`
when `findSpawn()` is empty. Commune `builder` never leaves home.

Comment at `:2516` already says the fix: *loop owned rooms; if no spawn and
a spawn site exists, spawn builders.* The loop is commented out. Dead.

`AutoExpand.armColonise` (`:147-162`) **rewrites** `target_colonise` every
time it runs. `SC(room, x, y)` (`Commands.ts:1837-1851`) is not durable
while `autoExpand` is in `claiming` / `claimed`.

Stuck `claimed` + foreign spawn ⇒ the mother’s 1–2 CBs walk to a room with
**no finishable MY spawn site**. Extras with 3500/15k get zero.

How extras appear (not this knob): `CanClaimRemote = GCL − owned`
(`rooms.ts:426-431`). Observer `WallClearer` claim-then-unclaim
(`rooms.observe.ts:242+`, `WallClearer.ts:25-33`). `claimRemotes` (off unless
`Memory.features.claimRemotes === true`, `:4789-4801`). AutoExpand
`PHASE_TIMEOUT` 20k (`AutoExpand.ts:447-456`) deletes state and
`target_colonise`, **leaves the claimed room**.

### 4. Why 3500/15k then dropped

`src/Rooms/rooms.ts:407-413`:

```ts
if (Game.time % 25000 == 0) {
  _.forEach(Game.constructionSites, function (site) {
    if (site.room == undefined || site.room.find(FIND_MY_CREEPS).length == 0) {
      site.remove();
    }
  });
}
```

Owned extras, 0 creeps, **our** spawn site: removed. Progress gone.
Next `placeFromPlanV2` / `ensureSpawnFirst` re-sites **0/15k**.

Tick **82275000** sits between the two polls. Matches E36N58 3300 → 0/15k
while the room was still claimed.

RCL1 `ticksToDowngrade` starts at 20 000 and falls 1/tick if nobody upgrades.
0 creeps ⇒ room drops (E36N59). The site dies with it.

Spawn-first means a CB that *did* arrive would **not** upgrade while the
site exists. Fresh claim (DG 20k) can finish 15k in time. A leftover at
DG ~6k and 0/15k cannot on **one** locally-harvesting 8W (`getBody([W,C,M],
room, 24)` ≈ 4 e/t duty cycle → ~24k e in 6k ticks needs two bodies, not one).

---

## Exact change

File: `src/Rooms/rooms.spawning.ts`. The ContainerBuilder block
(`:2523-2547`). Destination only.

**Pick a finishable spawn-site room, not `target_colonise` blindly.**

Next to the existing closest-funded-mother walk (`:2462-2505`):

```ts
function finishableSpawnSiteRoom(from: string): string | null {
    const hits: string[] = [];
    for (const name in Game.rooms) {
        const r = Game.rooms[name];
        if (!r.controller || !r.controller.my) continue;
        if (r.find(FIND_MY_SPAWNS).length) continue;
        if (r.find(FIND_STRUCTURES, {filter: (s: Structure) =>
            s.structureType === STRUCTURE_SPAWN && !(s as StructureSpawn).my}).length) continue;
        if (!r.find(FIND_MY_CONSTRUCTION_SITES, {filter: (s: ConstructionSite) =>
            s.structureType === STRUCTURE_SPAWN}).length) continue;
        hits.push(name);
    }
    if (!hits.length) return null;
    const armed = Memory.target_colonise && Memory.target_colonise.room;
    if (armed && hits.indexOf(armed) !== -1) return armed;
    hits.sort((a, b) =>
        Game.map.getRoomLinearDistance(from, a) - Game.map.getRoomLinearDistance(from, b));
    return hits[0];
}
```

In the existing `if (closestRoom && closestRoom.name == room.name)` arm,
replace `target_colonise` **as the CB `targetRoom`** with:

```ts
const need = finishableSpawnSiteRoom(room.name);
```

Keep every mother gate (RCL≥3, storage>10k, bucket>7750, `!danger`,
distance≤7, this room is the closest payer). Change only:

- destination = `need` (null ⇒ do not queue a CB)
- cap **1** live+queued `buildcontainer` with `targetRoom == need`
  (do not reuse `containerbuilders < 2` — that is the mother’s total, and
  it is already spent on the brick)

Body stays `getBody([WORK, CARRY, MOVE], room, 24)`, `fill: true`.

Claimer / ranger / `armColonise` stay on `target_colonise`. This knob does
not claim, unclaim, or unstick AutoExpand.

---

## Do not bundle

- Exempt spawn sites from the 25k 0-creep janitor (`rooms.ts:407-413`).
  Next miss after this knob lands, not the same change.
- Skip / abort AutoExpand on foreign-spawn rooms (E39N58 / E35N59).
- `SC()` durability vs `armColonise`.
- Two CBs, convoy, `supportOtherRooms`.
- Upgrade-while-DG-low (fights spawn-first).
- `claimRemotes`, WallClearer, `CanClaimRemote`.
- Unclaim anyone. **Especially not E36N57.**
- `push-main` / `push-race` / mid-race push.

---

## Console now (not the knob)

`SC()` is one room and AutoExpand overwrites it in ≤10 ticks.

```
Memory.features.autoExpand = false;
stopExpand();
SC("<room>", x, y);   // x,y = live MY spawn site this tick, not a stale ledger tile
```

Mother is the closest RCL3+ with `storage > 10k` within dist 7 (live:
E37N59). Do not `SC` E36N57 (has a spawn). E38N59 DG~500 is already dead.
E36N58 / E37N57 at ~6k DG + 0/15k: **one** CB is probably too late; this
knob is for the **next** finishable extra, not a rescue of those two.

Turn AutoExpand back on only after a live pack re-push
(`push-live-expansion.mjs`) so the next GCL is not the leftover brick.

---

## Pass / fail

After the knob (once pushed, not now):

- A spawnless owned room with a MY spawn site and no foreign spawn has
  **≥1** `ContainerBuilder-*` with `targetRoom` set to it, spawned from the
  closest funded RCL3+.
- That creep’s `targets` in the colony are spawn sites only
  (`buildTheSpawnFirst`).
- `target_colonise === E35N59` (or any foreign-spawn brick) does **not**
  consume the CB slot.
- E36N57 still owned, still has its spawn.

Fail: extras still 0 creeps while E37N59 storage >10k and bucket >7750;
or CBs still walking to the brick; or a spawn site at 3k+ vanishes on
`Game.time % 25000 == 0` (janitor, separate).
