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
| 6 | Shell | min-cut walls + ramps + hub→ramp roads; enclosure priced in **total ramparts** (see below) | RA3-safe |
| 7 | RCL8 odds | factory, nuker, observer | tucked, not hub spam |

## Hard rules

- **One step at a time** — no multi-layer thrash in one PR.
- **Grow from the room** — sources/controller distance fields → confluence seed → flood core → claim tiles. No stamps, no hub-kit order.
- **Intentional counts** — RCL8 caps are max, not targets. Hub uses **1 link**, not 3.
- **No powerSpawn.**
- **Judge by eye** first; metrics second.
- Lower RCL = same plan, fewer buildings built yet.

## The shell prices enclosure in ramparts — all of them

The min-cut alone minimises **wall** tiles. Layer 2 minimises the **rampart
bill**: the wall *plus* every personal rampart that wall leaves the room owing —
an exposed source's miner seat and link, the mineral seat (and the extractor,
when its tile could hold one), the controller link/container and, when the
controller sits outside, the stand-denial ring around it. "Exposed" means
outside the wall **or inside but shallower than depth 4** (a ranged attacker on
the far side of the wall still reaches it).

```
bill(cut) = |cut ∪ bubbles(cut)|
          + mineral works layer 5 will bubble under this cut
          + exposed works no rampart can cover (wall-terrain extractor, border band)
```

So the radius pick sorts by bill, and after it every eco site is **bid for**:
its works dilated by 2 (so they come out deep and owe nothing), then the legacy
area/ring set; a bid is taken when the bill does not rise — a strictly cheaper
bill at any stretch, a tie only while the wall grows by at most
`ECO_TIE_MAX_STRETCH` tiles (a tie that drags the shell out is a tower-face and
lap problem the bill cannot see) — subject to the old guards (no leak, no second
castle, no loss of deep interior, reach veto, mobility guard). A room whose bare
shell is short of `needDeep` gets a **deep credit**: one rampart per
`DEEP_CREDIT_TILES_PER_RAMPART` deep tiles a bid brings, counted only up to the
shortfall (an eco lobe is sometimes the cheapest interior a starved room can
buy, and a shortfall is paid back in shallow extensions renting personal
ramparts). Mobility keeps the owner's price: the radius pick and every eco bid
may spend the ladder's premium (`mobilityAllowance` — 3 ramparts per 1.0 of
gated lap reclaimed, cap 12, only past a lap of 2) on a shorter lap, and no bid
may drag a room that is at or under that floor past it — the bill cannot see the
twelve ramparts the ladder would then spend buying the lap back. No eco bid
may stretch the shell past `ECO_REACH_KNEE` (chebyshev from the sitter — the
tower battery's reach proxy) nor stretch a shell already past it. Sites still
owing are bid for in pairs and all together. Every bid —
accepted or refused, with its cut size, bill, credit and reason — is published in
`meta.shell.ecoLedger`; `meta.shell.ecoBill` carries the bill at the bare pick,
after the trades and as shipped. The fleet summary prints the ledger summed
(`eco bill (layer 2, …)`).

The extractor sits on the mineral, and minerals sit on wall terrain, where the
engine refuses a rampart (`checkConstructionSite` exempts only the extractor
from the terrain-wall test) — so an exposed extractor is priced as the rampart
it cannot have and the only remedy is taking the mineral inside. Layer 5 still
buys the seat's bubble (and the extractor's, on the floor-terrain mineral that
does not exist in this fleet).

Offline without docker: `ROOMS_FILE=tools/plan-suite/v2/_r28-mech/rooms.json`
points both fetchers at a tracked 172-room dump.

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
migration notes, and re-arms via `armNewPlanMigration` (force-ALIGN; hub only
on a young colony).

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
