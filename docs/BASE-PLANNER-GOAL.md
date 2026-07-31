# Base planner goal (auto-expand quality)

**Status:** active long-running goal  
**Scope:** offline suite first (`tools/plan-suite/legacy/plan-offline.mjs`) → then live `BasePlan.ts`  
**Not required:** museum-perfect art. **Required:** good enough for **dynamic auto place** on expansion.

## Hard rules (user)

1. **Full eco protect** — all extensions inside the seal (rebuilding exts is expensive).
2. **No powerSpawn** — power mode off.
3. **No double shell.**
4. **Labs** — keep current strip layout (do not rewrite live lab manager).
5. **Dense extensions** — tight packing next to each other, **not** sparse every-other-tile grid, **not** solid brick with no walk-out.
6. **Thin corridors** — intentional roads only: hub ring, radial spokes, eco paths, ramp access, sole structure faces. **Not** solid concentric rings or every-other wall paint.
7. **Towers** — spread for shell coverage (optimal range ≤5), stay refillable from storage (~≤10).
8. **Ramps** — openings + **roads on perimeter** + **road path hub → each ramp**.
9. **RCL8 = 60 extensions** on almost all normal 2-source rooms.
10. **RA3-safe shell** — min-cut dilate ≥ **3** so buildings are not within range 3 of a tile outside the wall (no protect-2 “roomy” shortcut).
11. **Good enough for auto-expand** — not perfection theater.

## Acceptance gates (suite)

Run: `fnm exec --using 22 node tools/plan-suite/legacy/plan-offline.mjs --all-claimable`

| Gate | Pass if |
|------|---------|
| A | ≥ **90%** claimable rooms place **60** extensions |
| B | Every extension has a **road neighbor** (access%) |
| C | **Cardinal corridors** or ring roads so interior can reach perimeter (not sealed blob) |
| D | Labs: road on **D4 of every lab** |
| E | Towers: ≥ **40%** of wall tiles in range ≤5 of some tower (median across rooms) |
| F | Road count intentional: prefer **&lt; 100** roads at RCL8 mid rooms (skeleton + faces); no solid rings, no every-other perimeter paint, no bridge-to-every-orphan |
| G | Golden set looks sane: **E2S7, E5S1, E5S7, E1S4, E9S8** |

Gallery: `http://127.0.0.1:8765/` (serve `tools/plan-suite/out`)

## Anti-patterns (failed attempts)

- City grid every 2 tiles → sparse exts + road spam (**user rejected**)
- Solid extension pack with no corridors → walled in (**user rejected**)
- Towers stacked on hub only
- Free-energy / fake fixes for live rooms

## Workflow

`.grok/workflows/base-planner-goal.rhai`  
Phases: **assess → implement → critic → judge** (loop rounds).

```text
/workflow base-planner-goal
# or
workflow tool name: base-planner-goal  args: { rounds: 3 }
```

## Live later (after offline gates)

- Port to `src/utils/BasePlan.ts`
- `placeFromPlan` for **new** rooms / race only
- Adopt existing E5S1 later
