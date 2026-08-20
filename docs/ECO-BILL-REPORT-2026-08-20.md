# Planner v2 — the eco bill (enclosure priced in ramparts, bubbles included)

Commits on `main`: `5e4f650` (planner + validator parser fix + docs + harness), `f7b206d` (live bot: income ramparts obey the same exposure rule).

## What changed (layer 2, `tools/plan-suite/v2/layer-shell.mjs`)

Before: the min-cut minimised **wall tiles**; the personal ramparts ("bubbles") on an exposed
source seat/link, the mineral seat and the controller's stand-denial ring were bought afterwards
and never entered the decision. A source that cost 3 wall tiles to take in was refused while its
2 bubbles were paid anyway; a controller that cost 5 was refused while its 8-tile ring was paid.

Now every enclosure decision is priced on one bill:

```
bill(cut) = |cut ∪ bubbles(cut)|                      ramparts layer 2 emits
          + mineral works layer 5 will have to bubble   (seat — and extractor, where legal)
          + exposed works NO rampart can cover           (extractor on wall terrain, border band)
```

"Exposed" = outside the wall **or inside but depth < 4** (a ranged attacker across the wall reaches it).

- Radius pick, reachability swap and mobility band all sort on the bill.
- Each eco site (controller, every source, the mineral) is **bid for**: works dilated by 2
  (deep → owes nothing), the legacy area/ring set, a dilate-3 retry on a natural-wall miss; then
  pairs and all-remaining. A bid is taken when the bill does not rise; ties only within
  `ECO_TIE_MAX_STRETCH = 4` wall tiles.
- Guards kept: no leak, no second castle, deep-interior floor, mobility guard, reach veto — plus:
  - **deep credit** in a room short of `needDeep` (1 rampart per 2 deep tiles within the shortfall);
  - the owner's **mobility premium** (3 ramparts per 1.0 lap reclaimed, cap 12, only past lap 2) now
    lives in layer-shell and is spent by the radius pick and by eco bids; no bid may drag a room
    at/under the floor past it;
  - **reach knee** `ECO_REACH_KNEE = 22` (sitter chebyshev): no eco bid stretches the shell past it or
    stretches a shell already past it (E15S5's lobe took a shell 22→24 and the weakest tower face
    through the 1200 hard floor).
- Extractor: every mineral in this fleet sits on wall terrain, where the engine refuses a rampart
  (`checkConstructionSite` exempts only the extractor). An exposed extractor is therefore priced as
  the rampart it cannot have; layer 5 ramparts it where the tile could take one (never here).
- Everything is published: `meta.shell.ecoLedger` (every bid: site, pre-bid cut/bill/deep, every
  candidate with cut/bill/reason/credit/premium, before/after) and `meta.shell.ecoBill`
  (base / traded / shipped / ramparts / mineralDue / uncoverable / credit / premium). The fleet
  summary prints the ledger summed (`eco bill (layer 2, …)`).

## Proof (172-room fleet, same terrain dump, baseline = HEAD before the change)

| metric | baseline | new | Δ |
|---|---|---|---|
| ramparts shipped | 8208 | **8031** | **−177 (−2.2%)** |
| bill (ramparts + uncoverable exposed works) | 8361 | 8174 | −187 |
| rooms fewer / same / more ramparts | — | 61 / 100 / 11 | (max +8, a priced mobility purchase) |
| shallow extensions (renting personal ramparts) | 25 | 10 | −15 |
| roads | 14100 | 14177 | +77 (+0.5%) |
| built gated lap over target (rooms) | 55 | 53 | −2 |
| rooms with lap > 2 | 31 | 26 | −5 |
| weakest tower face, mean / under 1800 / under 1200 | 2435 / 5 / 0 | 2413 / 5 / 0 | −0.9% / = / = |
| controller enclosed / strict source enclosures | 92 / 215 | 92 / 211 | = / −4 (cost more than their bubbles) |
| exposed seat/link/ctrl-link with no rampart (border-illegal only) | 6 | 6 | = |
| validator (`validate.mjs`) rooms passing | 154/172 | 156/172 | +2 |
| numeral audit | 1 WRONG (stale r45 figure) | 0 WRONG | |
| suite wall clock | 500 s | 371 s | max-flow memo |

Biggest wins: E9S2 −20, E11S5 −11, E16S5 −9, E13S8/E15S7/E19S7/E6S5 −7. Regressions: E7S1 +8,
E19S8 +6, E17S5 +5 — all mobility-premium purchases (lap 3.5→0, 2.67→0, 4.4→1.83) under the
owner's own price; the rest ≤ +3.

Ledger over the fleet: 1224 site bids — accepted source 48 / controller 16 / mineral 14 / pair 2;
refused second-castle 965 / price 449 / mobility 26 / no-cut 13 / reach 12.

## Tests

- `tools/plan-suite/v2/_test-eco-bill.mjs` — 13 carved-terrain scenarios with countable wall
  costs (source trade K=1..5 incl. the tie, tie-stretch accept/refuse, controller 8-ring take at
  +8 wall, controller refuse, mineral take/refuse with the uncoverable extractor priced,
  second-castle, pair-beats-singles) + fleet ledger invariants over plans-hub.json: **13/13 + fleet PASS**.
- `npm run typecheck`, `npm run lint`, `npm run test-unit` (354 passing) — live-bot side.
- validate.mjs 156/172; the 16 left: 14 pre-existing classes at HEAD (layer-6 lane `shrunk`/`fullRun`
  records, `mineralOffNetworkWhy` prose) + **E21S6, E8S7**: shell lap 0 but built lap 1.3–1.4 → the
  mobility declaration ships `negotiated: null` (declareMobility's own branch) and the validator's
  record inventory does not admit it (it assumes a negotiation record + ladder, and cross-refs them
  from `repair.tower.*`/`lift.*`). Never reached before; fixing it properly means NULLREF-licensing
  those referents and a per-class lift-lap derivation in validate.mjs.
- mutate.mjs: baseline 156/172, 1330/1366 mutations bite (36 escapes, mostly "no room with the
  required property" in this fleet).

## Rollout

- Plans: `tools/plan-suite/out-v2/plans-hub.json` + films are regenerated (this machine, docker down →
  `ROOMS_FILE=tools/plan-suite/v2/_r28-mech/rooms.json`). Pushing needs the local stack:
  `node tools/server/push-expansion-pack.mjs --user pacifist --dest pserver` (segments 80–86) /
  `node tools/server/push-plan.mjs <room> --dest … --adopt` (segment 88). Not pushed from here.
- Bot: `npm run push-vps` (or the dest you want) for the income-rampart gate. Not pushed from here.

## Follow-ups worth knowing

- `towerCoverage` declarations (weakest face < 1200) have no declprose renderer → any room that
  ever trips it fails validation. Not triggered in this build; the reach knee is what keeps it away.
- `second-castle` refuses ~2/3 of all bids: the min-cut often encloses an eco pocket as a separate
  ring. A connected-enclosure formulation would let more trades through.

## Post-ship finding (2026-08-20, live W5N3): the cut can run THROUGH a planned blocker

The first pack shipped under the eco bill put W5N3's **source link on a shellCut
tile** (19,2 — source at 17,3 hugs the room edge). A blocker structure standing
in the wall line breaks the defender lane: a RampartDefender walking the shell
bounces off the link tile and has to leave the wall to get around it.

Bot-side containment is deployed (commit pending alongside this note):
placeFromPlanV2 refuses to site any WALL_BLOCKERS type on a shellCut tile
(loud log), assignDefenderTiles skips rampart seats with a blocking structure
beneath, and W5N3's adopted plan was hand-patched (link 19,2 → 17,2, off-cut,
still adjacent to seat+source; all other adopted plans on live+VPS sweep clean).

Planner follow-ups this needs at the source:
1. **layer-shell**: min-cut candidate tiles must exclude tiles carrying planned
   blocker structures (spawn/ext/storage/tower/link/terminal/lab/nuker/observer)
   — the cut must route AROUND works, never over them. (The works existed before
   the cut here; the shell chose the clash.)
2. **validate.mjs**: a hard gate `shell|blocker-on-cut` — non-empty
   intersection of meta.shell.cut with any blocker structure list fails the
   room. (Not added here: the gate-kind registries make a partial add fail the
   validator itself; belongs to the pipeline owner.)
