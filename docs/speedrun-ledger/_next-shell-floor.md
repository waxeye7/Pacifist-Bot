# Shipped — shell-floor + multi-CB + foreign abort

Not a race knob. Dead on spawn→RCL4 (RCL6+ / spawnless / expand).
Pushed dest `vps` + `main` 2026-08-16T03:30Z. **Not** `push-pacifist` / `push-race`.

| knob | file | why |
|---|---|---|
| builder floor 300 | `creepFunctions.ts` `_roomShellSitesOnly` | W2N1 8k bank + 80k freeze = token idle 0e |
| CB cover-all then cap-2 | `rooms.spawning.ts` `finishableSpawnSiteRoom` | E37N57 waited while E36N58 had the only CB |
| `FIND_STRUCTURES && !my` | `AutoExpand.ts` `hasVisibleForeignSpawn` | unowned leftover missed `FIND_HOSTILE_SPAWNS` |
| abort claiming/claimed | `AutoExpand.ts` | E35N59 Enrique: don't sit 8k/20k if we can see it |
| builder hub-box min 50 | `creepFunctions.ts` withdrawStorage | W3N3 200e hub bounced on hard 300 |
| RCL2 tap `min(550,cap)` | `builder.ts` | hard 550 never fired at cap 300–500; spawn leave 300 |
| drop foreign `memory.storage` | `builder.ts` + `findStorage` | W3N3 pinned to ghost/other-room id |
| CB cap 3 if RCL1 DG<3000 | `rooms.spawning.ts` `colonyBuilderCap` | E37N57 10k left vs ~1.8k DG |

`spawnlessOwned` still holds the next pick. Do **not** unclaim E36N57.
16 stays the pile. Next isolated seed after 16 is called, not now.
