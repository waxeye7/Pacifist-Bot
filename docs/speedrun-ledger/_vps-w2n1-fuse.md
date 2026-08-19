# VPS W2N1 fuse/starve — src audit

HTTP notes only. No SSH. No push-vps / push-race / seed / unclaim.

Last poll (`_status-vps.md` tick **2152042**): RCL7 · `danger=true` · `blown_fuse=true` · `hostiles=[]` · storage **0** · towers **0/0** · Spawn2 e=**0**.

## src hole: **no**

`src/Rooms/rooms.defence.ts` already writes both flags off the same `FIND_HOSTILE_CREEPS` scan:

```
if (HostileCreeps.length > 0) { danger=true; … } else { danger=false; … }
if (HostileCreeps.length > 0) { blown_fuse=true; } else { blown_fuse=false; }
```

Safemode also forces both false. `blown_fuse` is **write-only** (nothing in src reads it). Dest compiled with this file **must** clear fuse the first tick hostiles is empty.

**src:** none — runtime (hostiles just left / poll objects vs Memory skew). Next dest tick writes both false. Do not push.

Compile-miss fingerprint would be `danger=false` + `blown_fuse=true`. Poll has **both true** → dest last ran the `length > 0` arm (or `roomDefence` did not run that tick). Not a missing else-clear.

## Empty-tower fill is **not** fuse/danger-gated

- `fillNeed` / `findFillerTarget`: empty towers are legal targets (half-full first, then any free cap). No `danger` / `blown_fuse` check.
- Filler **withdraw**: storage/bin still work under danger. `acquireEnergy…` (drops/containers) is `!danger` only. storage=0 + leftover `danger` ⇒ filler cannot refill ⇒ towers stay 0/0.
- EnergyManager: no tower fill; danger only changes replacement body.

Starve while flags are still true is empty bank + scavenger gated by **danger**, not fuse.

RCL7 `queueBuilder` is `!danger && danger_timer==0` (`rooms.spawning.ts`) — builders pause until danger clears. Sites already 0 this poll.

Did not apply src. Did not push.
