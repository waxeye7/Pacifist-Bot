# Cycle-16 seed leftovers — user-null census

Read-only. **Do not delete. Do not wipe. Do not seed.** Cycle-15
(`run-2026-08-15T23-57-10Z`, `cycle-15-5w-latch`, setHash `1f90aub`)
is still watching. This is the gate list for the **next** seed, after
15's watch `exitReason`.

```
NEVER  npm run push-race
NEVER  server:local:reset
NEVER  git push
NEVER  mid-race wipe / delete / reset
NEVER  --run run-2026-08-15T23-57-10Z
NEVER  unclaim E36N57
```

Control frozen `e839fc8`. Honest leftover-5 clock is cycle-8 **29029
8/8**, not dirty 24512 7/8 (`_clean-world.md`).

---

## Poll

HTTP `GET /api/game/room-objects?room=` on `http://127.0.0.1:23456`
for all 16. Tokens dest `pacifist` (`local-pacifist-user-token-001`)
and dest `race` (`local-pacifist-race-token-001`). Objects are public;
both dests returned the same structure set (creep/energy counts drift
by a tick).

| | |
|---|---|
| tick | **4728434** |
| fetched | 2026-08-16T01:05:27Z |
| seed | 2026-08-15T23:57:10.766Z / seedTick 4696947 |
| ObjectId vs seed | **0 pre-seed** / 494 post-seed user-null structs |

Cycle-15 itself started clean. Everything below is **this race's**
containers/roads. They have no `user` field (Screeps roads/containers
never do). `race.mjs --wipe` is `deleteMany({ user ∈ racers })` — it
**will leave all of them**. That is the 24512 dirt class.

---

## Totals (user-null structures)

| type | n | where |
|---|---:|---|
| container | **66** | all 16 rooms |
| road | **428** | control only (cand 0 — cycle-9 no-RCL3-roads holding) |
| rampart | 0 | live ramps are `user=pacifist1` / `pacifist-race`; wipe removes them |
| constructedWall | 0 | |
| link | 0 | |
| **sum** | **494** | |

Also seen, not structures: user-null `energy` piles (drop mine);
one user-null **ruin** (E13S9 19,37, dead container). Tombstones
carry a racer `user` — wipe removes those.

Foreign walker: E8S5 had `creep user=2` on a later poll. Cycle-11
class — `--wipe` **skips** the room. `_del-walkers.js` is the fix.
Not a leftover structure.

---

## Cross-check `_clean-world.md`

| known | now | after `--wipe` |
|---|---|---|
| E5S3 container **(40,42)** planner depot | **STAND** (this-race, oid 00:40:22Z, ch 3) | leftover ghost again |
| E12S3 container **(18,30)** planner depot | **STAND** (this-race, oid 00:39:38Z, ch 3) | leftover ghost again |
| E5S3 road **(24,30)** | gone (spawn sits there; cand 0 roads) | no |
| E8S5 road **(24,9)** | **STAND** on spawn tile (ctrl pavement) | **spawn-in refuse** |
| E4S7 road **(30,32)** | **STAND** on spawn tile (ctrl pavement) | **spawn-in refuse** |

### New planner-depot hits (not in `_clean-world.md` before)

Same `container[2]` tiles as `_next-boxes.md`. Live this race, survive wipe:

| room | side | tile | note |
|---|---|---|---|
| E18S9 | cand | **(28,6)** | + extra depot (28,5) |
| E18S5 | cand | **(10,12)** | + extra depot (5,12) |
| E9S1 | ctrl | **(27,40)** | |
| E6S1 | ctrl | **(37,8)** | |
| E3S5 | ctrl | **(41,27)** | |

**All 16 rooms** have ≥1 container Chebyshev ≤4 of the controller,
not source-adj. Wipe-only → `hasControllerDepot` is true on tick 0
of RCL3 in every room. That is the 24512 mechanism.

---

## Per-room user-null (tick 4728434)

`*` = planner depot tile from `_next-boxes.md`. `D` = depot-range
(ch ≤4, not source-adj).

### Candidate (pacifist / `pacifist1`) — 0 roads

| room | L | spawn | boxes | user-null containers |
|---|---:|---|---:|---|
| E5S3 | 3 | 24,30 | 5 | hub 24,28 / 24,31 / 24,29 · D 34,44 · D* **40,42** |
| E12S3 | 3 | 33,21 | 5 | hub 31,21 / 31,22 · D* **18,30** · src 35,10 / 47,33 |
| E18S9 | 3 | 35,13 | 5 | hub 35,11 / 35,12 · other 32,8 · D* **28,6** · D 28,5 |
| E11S6 | 4 | 25,21 | 3 | hub 25,20 · D 15,24 · src 47,4 |
| E16S9 | 3 | 35,29 | 5 | hub 35,27 / 37,31 / 35,28 · D 39,23 / 39,21 |
| E18S5 | 4 | 9,36 | 3 | hub 9,35 · D 5,12 · D* **10,12** |
| E12S1 | 3 | 27,16 | 5 | hub 27,14 / 26,18 / 27,15 · D 12,35 / 14,35 |
| E13S7 | 4 | 15,15 | 3 | hub 15,14 · D 22,11 / 22,12 |

### Control (`pacifist-race`, frozen `e839fc8`) — 428 roads

| room | L | spawn | box | road | user-null containers |
|---|---:|---|---:|---:|---|
| E9S1 | 4 | 31,40 | 4 | 51 | hub 31,42 · other 31,43 · D* **27,40** · src 12,5 |
| E13S9 | 3 | 17,33 | 5 | 51 | hub 17,35 · other 19,37 / 17,36 · D 10,30 · src 19,6 |
| E8S5 | 4 | **24,9** | 4 | **59** | D 40,8 / 40,9 · src 7,9 / 39,33 · **road on spawn** |
| E8S3 | 4 | 22,16 | 4 | 37 | hub 22,18 / 20,17 · D 16,8 · src 23,23 |
| E4S7 | 4 | **30,32** | 3 | **42** | src 24,13 · hub 30,31 · D 35,36 · **road on spawn** |
| E6S1 | 4 | 38,25 | 3 | 69 | D* **37,8** · src 36,31 / 32,41 |
| E3S5 | 3 | 23,27 | 5 | 32 | hub 23,25 / 23,26 · other 20,31 · D* **41,27** · src 16,15 |
| E21S4 | 4 | 39,11 | 4 | 87 | hub 39,13 · other 39,14 · D 40,20 · src 44,8 |

Dual depots (legacy miss-guard + extra): E5S3, E18S9, E16S9, E18S5,
E12S1, E13S7, E8S5. One leftover box is enough to park a 4W.

---

## DELETE — after cycle-15 ends only

Do **not** run while 15 is watching. Do **not** call
`_wipe-bench.js` (drops owned controllers). Do **not**
`server:local:reset`.

### Preferred — `seed-clean` (already the gate)

`_scrub-bench-objects.js` deletes every non-`source`/`mineral`/`controller`
object in the 16. That is the right delete. Then walkers, ctrl restore,
memory scrub. After 15's `exitReason`:

```
fnm exec --using 22 node tools/server/seed-clean.mjs --skip-push --hygiene-only
```

Census must show `roads=0` and no extra containers before the real
seed. Then seed a **new** run id (`_next-seed.md`). Never `--run`
`23-57-10Z`. Never `push-race`.

### Mongo — user-null only (if you are not running seed-clean)

`user: null` matches missing `user` (roads/containers). Safe on the
16 names. Does **not** touch controllers, sources, minerals, or
owned ext/spawn/tower (wipe handles those).

```javascript
// AFTER cycle-15 ends. Do not run now.
const d = db.getSiblingDB("screeps");
const rooms = [
  "E5S3", "E9S1", "E12S3", "E13S9", "E18S9", "E8S5", "E11S6", "E8S3",
  "E16S9", "E4S7", "E18S5", "E6S1", "E12S1", "E3S5", "E13S7", "E21S4",
];
rooms.forEach((r) => {
  const del = d["rooms.objects"].deleteMany({
    room: r,
    user: null,
    type: { $in: ["container", "road", "rampart", "constructedWall", "link", "ruin", "energy"] },
  });
  print(r + " user-null deleted=" + del.deletedCount);
});
```

Must-kill if you only do tiles (wipe-only recovery):

```javascript
// spawn-in blockers
d["rooms.objects"].deleteMany({ room: "E8S5", type: "road", x: 24, y: 9 });
d["rooms.objects"].deleteMany({ room: "E4S7", type: "road", x: 30, y: 32 });
// planner depot ghosts (known + new)
d["rooms.objects"].deleteMany({ room: "E5S3",  type: "container", x: 40, y: 42 });
d["rooms.objects"].deleteMany({ room: "E12S3", type: "container", x: 18, y: 30 });
d["rooms.objects"].deleteMany({ room: "E18S9", type: "container", x: 28, y: 6 });
d["rooms.objects"].deleteMany({ room: "E18S5", type: "container", x: 10, y: 12 });
d["rooms.objects"].deleteMany({ room: "E9S1",  type: "container", x: 27, y: 40 });
d["rooms.objects"].deleteMany({ room: "E6S1",  type: "container", x: 37, y: 8 });
d["rooms.objects"].deleteMany({ room: "E3S5",  type: "container", x: 41, y: 27 });
```

Tile-only is **not enough**. The other 59 containers (hub / src /
dual depot) still park a 4W or feed slam. Use the room-wide
`user: null` delete or `_scrub-bench-objects.js`.

### Console — only while rooms are still owned (before wipe)

Containers/roads are never `s.my`. Needs vision. Do not run now.

```javascript
// AFTER cycle-15 ends, BEFORE wipe. Do not run now.
const rooms = [
  "E5S3","E9S1","E12S3","E13S9","E18S9","E8S5","E11S6","E8S3",
  "E16S9","E4S7","E18S5","E6S1","E12S1","E3S5","E13S7","E21S4",
];
const kill = new Set([STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_WALL, STRUCTURE_LINK]);
for (const name of rooms) {
  const r = Game.rooms[name];
  if (!r) { console.log("no vision", name); continue; }
  let n = 0;
  for (const s of r.find(FIND_STRUCTURES)) {
    if (s.my || s.structureType === STRUCTURE_CONTROLLER) continue;
    if (!kill.has(s.structureType)) continue;
    if (s.destroy() === OK) n++;
  }
  console.log(name, "destroyed", n);
}
```

After wipe there is no vision — console cannot finish the job. Mongo
/ seed-clean can.

---

## Abort conditions for cycle-16 seed

After hygiene, before `race.mjs --seed`:

- any of the 16 has `roads > 0`
- any container remains (especially ch ≤4 of controller)
- spawn tile occupied (`E8S5 24,9` / `E4S7 30,32`)
- foreign `user` creep in the 16 or on a neighbor edge
- leftover `Memory.rooms` / `autoExpand` / `target_colonise` /
  `rclTimes.8` (`_scrub-racer-mem.mjs`)

Want census `seeded-live 16/16`. Mark vs **29029 8/8**, not 24512.
