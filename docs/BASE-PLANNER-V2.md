# Base planner v2 — RCL8, layer by layer

**Status:** greenfield (old `tools/plan-suite/legacy/plan-offline.mjs` is frozen / not the source of truth)  
**Doctrine:** plan the **finished RCL8 base**. Lower RCLs place into those same tiles as caps unlock. Lower RCL looks imperfect — that's fine.

## Layers (only advance when current layer looks intentional)

| # | Layer | Places | Done when |
|---|--------|--------|-----------|
| **1** | **Hub** | storage, terminal, **1 hub link**, 3 spawns, need-roads | grow from room confluence; storage still accessible |
| 2 | Economy links | source containers + source links + controller link (remaining of 6 links) | haul chain clear |
| 3 | Labs | 10-lab strip (keep live manager shape) | road face each lab |
| 4 | Towers | 6 towers | shell cover later; for now near hub / spread |
| 5 | Extensions | 60 dense + thin service roads | looks packed on purpose |
| 6 | Shell | min-cut walls + ramps + hub→ramp roads | RA3-safe |
| 7 | RCL8 odds | factory, nuker, observer | tucked, not hub spam |

## Hard rules

- **One step at a time** — no multi-layer thrash in one PR.
- **Grow from the room** — sources/controller distance fields → confluence seed → flood core → claim tiles. No stamps, no hub-kit order.
- **Intentional counts** — RCL8 caps are max, not targets. Hub uses **1 link**, not 3.
- **No powerSpawn.**
- **Judge by eye** first; metrics second.
- Lower RCL = same plan, fewer buildings built yet.

## Run

```bash
fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --all-claimable
# gallery: tools/plan-suite/out-v2/index.html
```

## Segments, adoption, migration

The planner is offline; the bot never plans a v2 layout itself. Plans reach a
room through **RawMemory segments**:

| Segment(s) | Written by | Read by |
|---|---|---|
| `88` | `tools/server/push-plan.mjs <room>` | `runPlanV2Adoption` after `adoptPlan("E11S2")` |
| `80`–`85` | `tools/server/push-expansion-pack.mjs` | `AutoExpand.runPackAdoption` (per-room plans) |
| `86` | same | the auto-expand target index |
| `89`–`99` | `tools/server/push-anim.mjs` | `utils/PlanAnimator` (replay overlay) |
| `10` | the bot | `utils/ErrorExporter` |

Both adoption paths call the same **`packPlanPayload`** (`utils/PlanV2.ts`), so
a hand-adopted room and an auto-claimed one end up with byte-identical
`room.memory.planV2`. The payload carries a schema version `v` (absent = 1) and
a `planHash` over the whole plan payload — structures, shell cut, road staging,
sitter and lab inputs. A changed hash logs `layout changed`, clears the one-shot
migration notes, and demotes a heuristic `auto` arm on an established room.

**`setActiveSegments` REPLACES the active set.** Every request must therefore be
the *union* of what is already active, what anyone else asked for this tick, and
what you want. Go through `requestSegments()` in `utils/Segments.ts` — never call
`RawMemory.setActiveSegments` directly. (`RawMemory.segments` only reflects last
tick's activation, so the per-tick heap set inside the helper is what stops two
callers in the same tick cancelling each other.)

Adoption writes the plan; it does **not** authorise demolition. See
`docs/LAYOUT-MIGRATION.md` for the `planMigration` arm and `migrationAllowed`.

## Anti-patterns (from v1)

- Solid road rings as packing scaffold  
- Every-other wall road paint  
- Bridge-every-orphan connect  
- Placing max links/structures just because CAPS allow it  
- Score chasing while layout looks random  
