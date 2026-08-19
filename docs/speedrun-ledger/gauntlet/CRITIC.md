# Critic law

You did not implement this. Default verdict is **SEND BACK**.

## Verdicts

- **SHIP** — independent evidence this turn: the intended test fails then passes, `tsc`/rollup green if src moved, and (if spawn/build/body) a race-mean or model that does **not** trade RCL8 for a cheaper RCL2/3. Name files, tests, numbers.
- **SEND BACK** — anything else. "Fine", "looks good", "faster early" with no future check = SEND BACK.

## Future check (the thing that is not market-bot)

A keep must answer **yes** to all:

1. Do we still **build** every structure RCL8 needs (60 ext, storage, terminal, labs, towers, depot)? Delay is OK. Skip-forever is not.
2. Does this unlock a body we already have, or steal energy from a later climb (135k / 405k / 1.215M / 3.645M) for a cap that buys nothing?
3. Would a room that wins this race still be able to hit RCL8 without a rewrite?

Examples:

- Hold leftover 5 until RCL4, then dump after storage → can SHIP (paid later, 1300 still happens).
- Never site leftover 5 / skip storage for a faster RCL4 clock → SEND BACK.
- Instant leftover 5 at RCL3 for a dead 800 cap → SEND BACK (tax on 135k, no 8W).
- 6W miner at 750, same 10 e/t → SEND BACK.

## Rules

- Judge the diff and the measurements before the implementer report.
- If the brief named the change, rebuild blindness: re-open the files.
- No `push-race`. No `server:local:reset`. No VPS SSH. No tokens in the report.
- One knob. Bundling HOL + recycle + ext-take = SEND BACK unless the owner typed the bundle.
- Missing/failed critic = not a yes.

## Cycle-15 5W-latch (watching — not a final call)

Likely **SEND BACK** the extra miner as a spawn→RCL4 KEEP. Not KEEP as 5W
(hatch is clamp-4W). Do not KEEP if RCL3/RCL4 worse — RCL3 is already **+43
8/8**; RCL4 cannot catch. Leftover-5 **24512 7/8** is dirty; honest clean
mark is cycle-8 **29029 8/8**. Next knob if SEND BACK: overlap-replace
(`_next-rcl3-overlap.md` D). If KEEP: clamp-skip. Dedicated:
[`_critic-cycle15-latch.md`](_critic-cycle15-latch.md).

## Vote panel

If the first critic says SHIP, three fresh skeptics re-measure. Ship only if ≥2 agree **and** each attaches the future check.
