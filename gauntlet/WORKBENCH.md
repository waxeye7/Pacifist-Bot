# Gauntlet workbench (careful loop)

Last fire: 2026-08-23T13:11Z. Locks: no push-main, no push-race, no VPS SSH, no resetAllData.

Local API: `http://127.0.0.1:21025` (host 23456 is in a Windows excluded TCP range).

## SHIP billed-cpu · 2026-08-23T13:11Z

Honesty: `Memory.CPU` / heartbeat now record billed tick CPU (`Game.cpu.getUsed()` at loop end), not `end − startOfLoop`. Parse was invisible; LIVE avg100 18.24 while bucket 1068→1012 / ~999 ticks.

| | |
|---|---|
| Worktree | `Pacifist-Bot-wt-billed-cpu` / `gauntlet/billed-cpu` |
| Parent copy | `src/main.ts`, `src/utils/CpuPolicy.ts`, `src/utils/Bench.ts`, `test/unit/cpuPolicy.test.ts` (+54 −5) |
| `npm test` | 511 passing (both critics re-ran) |
| `npm run build` | compiled, not uploaded by critics |
| Local ticks | 5954612 → 5954914 (Δ302) on `:21025` |
| Re-measure | SHIP [Re-measure billed-cpu](c8c06911-4f80-4e96-98bb-5c1b6feb981e) |
| Adversarial | SHIP [Adversarial billed-cpu](5697cd69-5495-4a6a-8324-c792ce53fd61) |

`recordTick` still logs logic delta into `Memory.bench` (A/B parse is constant). Documented.

Did **not**: push-main, push-race, SSH, reset.

## SHIP optional-creep skip · 2026-08-23T14:28Z

Two-pass creep runner + `skipOptionalCreep`: owned-room economy leftovers (`repair` / `maintainer` / `builder` / `sweeper` / `MineralMiner`) idle this tick when bucket is economyOnly or used ≥ 90% of limit. Fail-open unknown roles. `scout` is **not** skipped (remote + `warScout`). Memoryless creeps queue as essential. `Memory.cpuSkip` counts skips.

| | |
|---|---|
| Worktree | `Pacifist-Bot-wt-creep-shed` / `gauntlet/creep-shed` |
| Parent copy | `src/Managers/RunAllCreepsManager.ts`, `src/utils/CpuPolicy.ts`, `src/main.ts`, `src/utils/Bench.ts`, `test/unit/cpuPolicy.test.ts` |
| `npm test` | 518 passing (critics re-ran) |
| Proof | local `pacifist2` vs `waxeye`, **cpu=3** so 90% skip could fire. Fat `pacifist` stayed 100. Limits restored to 20 after SHIP. |
| Candidate skip | `n` rose with `last==t`; roles builder/repair/sweeper; EnergyMiner ×2; E11S5 L2 alive |
| Control | no `skip` object |
| Re-measure | SHIP [Re-measure scout-drop](b147636d-787a-4afe-ae14-f8d86ed9da36) |
| Adversarial | SHIP [Adversarial scout-drop](659b32d9-71a0-4b37-9682-f11f6a6aa68e) |

Did **not**: push-main, push-race, SSH, reset.

## SHIP 20-CPU latch proof · 2026-08-23T14:50Z

Same skip, now at **limit 20** with ~7 rooms per side (spawn-in; fat `pacifist` stayed cpu=100). Skip fires on the 90% gate (used ≥ 18); candidate bucket holds vs control dump. `scout` still not skipped. EnergyMiner ×14 both sides.

| | |
|---|---|
| Candidate | `pacifist2` (creep-shed) |
| Control | `waxeye` (billed-cpu, no skip) |
| Re-measure | SHIP [Re-measure 20-CPU latch](42c78588-e191-4b53-81b6-2cffbe5d674e) Δ162: bucket **−141** vs control **−558**; skip.n 16304→18369, `last==t` |
| Adversarial | SHIP [Adversarial 20-CPU latch](4223757c-ff6b-41e4-bc7a-60249a03ff18) Δ66: candidate **+21** vs control **−52**; long span −318 vs −2397 |

Local analog of LIVE 20-CPU overspend. **Not** pushed to shard3 (`push-main` is not this loop).

Did **not**: push-main, push-race, SSH, reset.

## Next

Skip is in parent (uncommitted). LIVE shard3 still on the old bundle until a human `push-main`. Do not do that from this loop.
