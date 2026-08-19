# Naked-shell exception — RCL6+ bank freeze catch-22

`src/utils/PlanV2.ts` only. No leftover-5 / race / RCL2–4 site-count change.
Floors stay 30k / 80k / 150k. Do not `push-vps` from this note.

Polled dest vps tick **2075529**. Freeze (`maxSitesFor` → 0, then
`placeFromPlanV2` strip) blocked W2N1 / W1N2 from ever siting a wall
while the bank sat under the floor — so the bank could never refill.

---

## What changed

`isShellNaked` (`PlanV2.ts:32–41`): **0 my ramparts OR 0 roads**.

`maxSitesFor` (`:45–63`): RCL6+ + my storage + E &lt; floor:

| | return |
| --- | ---: |
| spawnless | **1** (unchanged) |
| spawn + shell-naked | **2** (new) |
| spawn + shell stands | **0** (unchanged) |

RCL2 still 5. RCL4–5 with storage still 8. RCL6+ above floor still 8.

`placeFromPlanV2` broke-strip (`:2118–2138`): when `brokeBank &&
(budget<=0 || nakedShell)`, `remove()` every site except spawn.
**If `nakedShell`, keep `STRUCTURE_RAMPART` / `STRUCTURE_ROAD`.**
Labs / nuker / ext / terminal / observer / everything else still go.

Siting when the budget is the naked exception (`nakedShell` `:2125`):

- skip every type except `road` + `rampart` (`:2208`)
- personal covers (`plannedOccupancy`, already the cover-vs-wall
  helper) are skipped entirely (`:2247`) — the 2 slots go to the shell
- never labs / nuker / terminal / observer / 2nd spawn / ext

Spawnless is excluded from `nakedShell` so spawn-first still owns the
one slot.

---

## Expected after push (same tick-2075529 snapshot)

| Room | snapshot | exception | after |
| --- | --- | --- | --- |
| **W2N1** | RCL7 · E=0 · **0 ramp / 0 road** · Spawn2 · plan 38+69 | yes | **2** shell/road sites. Strip leftover labs/ext. Shell first, then roads. |
| **W1N2** | RCL6 · E=1.2k &lt; 30k · **46 ramp / 0 road** | yes (0 roads) | **2** road sites. Keep the 46 ramparts. Do not re-open labs/ext. |
| **W3N1** | RCL7 · E=0 · **62 ramp + 78 road** | **no** | Freeze stays **0**. Strip labs/nuker/leftover ext. Do not reopen labs. |
| **W1N1** | RCL8 · E=108k &lt; 150k · **68 ramp + 46 road** | **no** | Freeze already on. Exception off (shell stands). Labs/nuker stay stripped. If the bank drops further, still frozen. |

W1N1 “freeze not active” in the poll write-up was wrong about the
number: 108k is still under the RCL8 150k floor. The shell is what
keeps the exception off, not the bank.

---

## Not this change

- leftover-5 / `extensionTake`
- race rooms (no `planV2`)
- RCL2 `maxSitesFor===5`, RCL3 `===4`, RCL4–5 dump-8
- repair / RampartErector / builder energy gates
- the 30k/80k/150k numbers
