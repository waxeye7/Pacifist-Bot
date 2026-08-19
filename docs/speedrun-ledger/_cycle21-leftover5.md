# leftover-5 paths — no leak

Dest-21 slam still L2. Policy KEEP. Not this race's named knob.

| path | hold |
| --- | --- |
| `PlanV2.extensionTake` `lvl<=3 → min(5,engine)` | yes |
| L4 until `storage.my` | yes |
| `BasePlan.placeFromBasePlan` uses `extensionTake` | yes |
| checkerboard `rooms.construction.ts` uses `extensionTake` | yes |
| L4 pre-queued ext sites stripped until storage | yes |

No RCL3>5 site path found. Cycle-21 lastSeen cand ext 1–5, none >5.
