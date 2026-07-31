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

## Anti-patterns (from v1)

- Solid road rings as packing scaffold  
- Every-other wall road paint  
- Bridge-every-orphan connect  
- Placing max links/structures just because CAPS allow it  
- Score chasing while layout looks random  
