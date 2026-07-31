Quarantined v1 offline planner — read-only parts quarry. Salvageable pieces: distance-weighted min-cut (getCutForMask, cap=1+distP^2), interiorFromPerimeter, depthSafeMask, pathDistField. Do not extend.

Note: after the move into `legacy/`, the `__dirname`-relative paths in `plan-offline.mjs`
(`out/`, `assets/`, `dump-rooms.js`, `_claimable.js`) no longer resolve — they point one
level too deep, and the top-level `_claimable.js` sweep clone was deleted. Not fixed on
purpose: these files are kept for reading, not running.
