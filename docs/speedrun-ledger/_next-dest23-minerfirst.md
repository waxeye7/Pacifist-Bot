# Dest-23 — miner-first `=== 0`, not a full revert

Src only. **Not** push-pacifist / **not** push-race. Cycle-21
(`run-2026-08-16T10-19-31Z`) dest still compiled L2/L3 `homeMinerBestWork < 2`.
Dest-22 already staged dest-cheap `=== 0`. Dest-23 is the twin on the
roster break. L4 strip stays cargo (dest-24).

## Pick

**B — do not full-revert.** One knob: case 2/3 `if (homeMinerBestWork(room) === 0) break` (was `< 2`).

| pick | knob | slam / future | call |
| --- | --- | --- | --- |
| A | delete L2/L3 miner-first break | 0-miner CA/UG/builders on empty mine (E37N57 / c16 E18S5) | **SEND BACK** — starves slam |
| **B** | L2/L3 miner-first `=== 0` | leftover 1W still income; 0-miner still holds roster | **SHIP src, not dest-21** |
| C | leave `< 2` | dest-22 leftover 1W + HOL 5W → no builders (c21 E16S9 8 road sites, 0 standing, c=2) | **SEND BACK** — starves slam / dest-21 pave |

RCL1 `EnergyMinersInRoom < 1` **stays** (empty-spawn correctness).
`lastSpawn=0` poke **absent**. leftover-5 **stays**. dest-22 dest-cheap
`=== 0` **stays**.

## Why not A

Slam-5 and dest-21 `paveNow` need builders the tick sites exist.
Full revert queues CA/UG/builders on the same pass as a 0-miner
`spawn_energy_miner` unshift. Dest-22 will cheap-rewrite HOL `[5W,M]`
only at `=== 0`; A then spends that trickle on roster. Default
**SEND BACK if it starves slam.**

`< 2` (C) is the other starve: dest-22 *keeps* leftover 1W (2 e/t),
and C then blocks builders/CA/UG until a 2W hatches. Healthy slam
start is already 2W (no-op). The live hole is leftover 1W after
TTL / dest-cheap.

## Future check (leftover-5 + RCL8)

Roster gate only. Does **not** touch `extensionTake`, L4 strip
(`rooms.construction.ts` ~817–823), PLACE_ORDER, or `maxSitesFor`.

1. **Build every RCL8 structure?** Yes. leftover-5 `lvl<=3 → 5`. L4
   still 5 until `room.storage.my` (site ≠ standing; hub ≠ storage),
   then engine cap. 60 ext / storage / terminal / labs / towers /
   depot still happen. Delay, not skip-forever.
2. **Unlock a body / steal a later climb?** No. Does not site leftover
   5 on 135k. Does not buy dead 800.
3. **Same room can still hit RCL8?** Yes. No rewrite required.

Clock KEEP still needs RCL4 **8/8** vs **29029** / this-ctrl **29053**.
Never 24512. Film slam-5 8/8 vs dest-21. If slam-5 worse, leftover-5
leaks, or L4 dumps ext before `storage.my` → **SEND BACK**.

## After 21 FINAL + dest-22

Do not seed dest-23 while 21 watches. Dest-22 first (dest-cheap
`=== 0`). Then dest-23 is this compile if dest-22 ships. One knob.
Do not KEEP miner-first off a pile.

```
NEVER  push-pacifist while 21 watches
NEVER  npm run push-race
NEVER  seed
NEVER  git push
NEVER  SSH
```
