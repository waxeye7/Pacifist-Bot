# Gauntlet

Paste **`PROMPT.md`** into a fresh session in this repo.

| File | What it is |
| --- | --- |
| `PROMPT.md` | **Copy this.** The careful, local-first improvement loop. |
| `VALIDATION.md` | The evidence law: the ladder, A/B over before/after, soak arithmetic, and the expensive-to-undo list. |
| `GAUNTLET.md` | Doctrine — roles, ranking, locks, and the failure modes already in the git log. |

This version is deliberately conservative. It proves on the disposable local
Docker world first, it **never** pushes to LIVE or to the frozen `race` control
account, it leaves the VPS box alone, and it checkpoints with the owner instead of
running unattended.

Three things it will not let you forget:

- A dead bot reports perfect health. Prove the tick advanced.
- LIVE runs a **20 CPU limit**. Free at 100 CPU can be fatal at 20.
- `pacifist` vs `pacifist2` on one local world is a real A/B. Use it instead of a
  before/after that confounds your change with world drift.
