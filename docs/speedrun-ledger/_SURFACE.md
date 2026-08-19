# Spawn→RCL4 surface (not just leftover 5)

Ext timing was one closed question: **C, hold leftover 5 until RCL4; don't site RCL3 roads.** That is ~1k ticks on a 10k+ RCL3 climb. The rest of the clock is bigger.

## Already in the live candidate (this baseline vs e839fc8)

Bodies / queue: getBody off cap, interleave-10, shuttle not parked 4W at RCL2, park 4W only after depot, drop RCL3 maintainer, builders `[W,2C,2M]`, earlyBuildSlots=2, miner gate not carriers>1, home haul sized to live WORK, 1:1 pre-road, CLF RCL5+ only, depot feed at 550 floor, remotes at 4 not 3.

Construction: RCL2 slam 5 then one source box, RCL3 depot→tower→(hold ext), no-pave / builder suicide on roads.

None of that is a measured win until this race finishes.

## Next knobs — after cycle-4, one at a time

| # | area | why |
|---|---|---|
| **0** | **Leftover-5** | KEEP cycle-5. |
| 1 | **RCL1 HOL** | SEND BACK cycle-6. RCL4 30139 vs 28818. |
| 2 | **Recycle 200e shuttles at 550** | SEND BACK cycle-7. Suicide walks them off the controller. |
| 3 | **6W after 550** | KEEP cycle-4. |
| **8** | **Legacy RCL3 depot** | Cycle-8 29029 vs 29628 (−599). Miss-guard; both sides already path-site. |
| **9** | **No BasePlan roads at RCL3** | Cycle-9 30728 vs 29856. KEEP policy (leftover-5 can release). Not a speed win. |
| **10** | **No source/depot boxes at RCL2** | Cycle-10. findStorage() is the hub container, so both source seats + depot site during slam (10–15k). |
| 4 | **Hold RCL3 at 2 shuttles until depot** | Inert on 6W (six already live). |
| 5 | **Hauler count tax** | Up to 3×400e per source in front of upgraders. |
| 6 | **First box tile** | Needs planV2. Race rooms miss the pack. |
| 7 | **Force 5W lastSpawn=0 at 550** | Keep the 2W working; add 5W if a seat is free. |

## Deliberately later

Remotes (clock stops at RCL4). Colony supporters (this seed places spawns). Storage floors / fillers (after the clock). Planner 98/88. Trickle-ext / 6W miner / instant leftover 5 — dead.

## How to watch

http://127.0.0.1:8767/ — means + pair film. Dark slot buttons = stalled.
