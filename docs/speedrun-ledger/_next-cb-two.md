# Next — 2 CBs while spawn-site progress < 10000
Read-only. **Do not edit `src`. Do not `push-vps` / `push-race` / `push-main`.** Live/VPS already run cap-1; W3N3 is mid-site (`_vps-w3n3-cb2.md`).
One line: `maybeSpawnColonyBuilder` live gate `rooms.spawning.ts:5059`. Queue `:5060` stays `_.some` (at most one queued; 1 live + 1 queued = 2).
Now: `if (_.some(Game.creeps, (c: any) => c.memory.role == 'buildcontainer' && c.memory.targetRoom == need)) return;`
One-liner: `if (_.filter(Game.creeps, (c: any) => c.memory.role == 'buildcontainer' && c.memory.targetRoom == need).length >= (((Game.rooms[need] && Game.rooms[need].find(FIND_MY_CONSTRUCTION_SITES, {filter: (s: ConstructionSite) => s.structureType === STRUCTURE_SPAWN})[0]) || {progress: 15000}).progress < 10000 ? 2 : 1)) return;`
Cap **2** only when `need` (finishable spawnless) is visible and its MY spawn site `progress < 10000`. No vision / no site → 15000 → stay 1. `progress >= 10000` → back to 1.
Why: 8W life ≈ 3–4k after a 250–500 t walk; cap-1 freezes the site in the gap. Overlap the next walk while the 15k is still the bottleneck (W3N3 still needs ~10k + two more sequential CBs).
Do not touch body, `fill`, mother gates, `finishableSpawnSiteRoom`, `containerbuilders`, claimer/ranger, janitor. Not a race A/B.
Do **not** apply now. A push would not rescue this W3N3 life (2nd only after next cadence) and would land a dirty tree on mature VPS rooms.
Pass later: 2 live `targetRoom==need` iff site p<10000; 1 after p≥10000; never 3. Fail: still sequential with p<10000 and a funded idle mother.
