# Cycle 0 spawn audit — spawn-placement → RCL4

Full citations in the explore pass. `getBody` uses `energyAvailable` (min 1 segment). RCL2 upgraders stuck at 2 WORK (`floor(550/300)=1`). RCL3 can queue a 500e upgrader / 550e miner at 300 available. Home `getCarrierBody` assumes 6 WORK / 12 e/t while miners are 2–5W.

**Remotes:** closed below RCL3. No first-class disable flag — guardrail A/B needs one. Home eco does not depend on remotes.

**First 100 ticks:** drop-mine → carrier → spawn. Not miner-to-spawn. Not container-first.

**RCL4–5 upgrader floors:** already a 10k/15k/30k/60k band, not one magic number. Almost unused before storage.

## Ranked 3

1. **Capacity/RCL miner+upgrader tiers** — `getBody` + spawnrules[1..3] + miner rungs. Never emit cost > 85% capacity without the existing clamp.
2. **Carriers sized to live miner WORK** — `getCarrierBody` / `homeCarriersWanted`. Keep first `[C,C,M]`.
3. **RCL1–3 queue/HOL + builders** — builder gate `carriers>1 && miners>1` (in flight). Interleave after ~10 -6 at RCL≤3. RCL1: 2 miners → 1–2 carriers → 1 upgrader.

A/B still blocked (docker off).
