# BASE PLANNER PERFECTION GOAL

**Paste this whole document as the goal prompt.** It is the distilled criteria from the
owner's design sessions. The bar is: **every base plan is genuinely perfect — a harsh
reviewer finds NOTHING to criticize.** Not "gates pass." Nothing to criticize.

## Mission

Iterate the v2 base planner (`tools/plan-suite/v2/`) through build → validate →
adversarial-review → fix cycles until **two consecutive adversarial review rounds by
fresh hostile reviewers produce zero confirmed findings of any severity**, all hard
gates hold on all rooms, and the gallery reads as intentional, elegant, and unique
per room. Rise to the bar; do not lower it.

## Process (non-negotiable)

1. **Fable curates, Opus implements.** Each cycle: a tightly specified implementation
   batch (Opus), then the full suite + validator, then **fresh adversarial reviewers**
   (Opus) who must actively try to BREAK the result with their own code and data —
   never trust the planner's own meta, always re-derive. Confirmed findings become the
   next batch's spec. Repeat.
2. Reviewers must cover, every round: game-rule legality, validator circularity
   (mutation-test it), the gates below, the judgment criteria below, and 5 randomly
   sampled rooms inspected visually (render → describe → criticize like the owner would).
3. Live verification each cycle: re-push plans to the live test rooms, watch them build,
   zero console errors, no regressions on legacy rooms.
4. Terminate only on: 2 consecutive all-clean adversarial rounds + gates green +
   golden-room visual pass. If a criterion is physically impossible in a specific room,
   the plan must SAY so in its meta (honest shortfall), and the reviewer must agree it
   is genuinely impossible — that is the only accepted exception.

## Hard gates (validator-enforced, 100% of claimable 2-source rooms)

- **60/60 extensions at RCL8. Always.** (Honest-impossible exception per above.)
- Full program: 10 labs (diamond, both inputs within range 2 of every output, hauler
  access), 6 towers, 3 spawns, storage+terminal+hub trio on a sitter tile, 4+ links
  (hub, per-source, controller), source containers, controller container, mineral
  container + extractor, nuker, observer. **No factory. No power spawn. Never power.**
- Shell: distance-weighted min-cut, all ramparts, no openings, no double shell.
  Protect region sealed — zero leaks (re-derived exterior flood, not trusted meta).
- Safety re-derived: every eco structure at chebyshev depth ≥ 4 from the exterior
  region **or** carrying a personal rampart. Towers depth ≥ 4, no exceptions.
  One declared physics exemption: the extractor is built ON the mineral by rule and
  therefore cannot be moved deep — it is exempt (nothing is stored in it and it is
  trivially rebuilt), while its container must be bubbled or declared.
- Every extension has a **road on an orthogonal (D4) face** — easily accessible,
  corridor pattern, never a maze, never diagonal-only.
- One connected road network touching every structure. No roads ON ramparts. Spur
  roads TO rampart clusters allowed. Roads exist only for: hub kit, eco paths,
  lab road, tower faces, extension corridors, rampart spurs. Dead ends pruned.
- No structure on source/controller/mineral tiles (extractor on mineral exempt),
  no illegal stacking, no out-of-bounds, full CONTROLLER_STRUCTURES cap compliance —
  and the validator itself must catch injected mutations of every class it checks.
- Interior connectivity invariant: interior walk region stays one component reaching
  the sitter and a face of every structure, at every placement step.
- Deterministic output; full plan ≤ ~200ms per room offline.

## Optimization objectives (minimize / maximize — reviewer judges trade-offs)

- **MINIMIZE total rampart count** (shell + personal). Ramparts decay; every rampart
  is forever-upkeep. NEW EMPHASIS from the owner: place buildings deep enough
  (depth ≥ 4) that they don't need personal ramparts at all — a layout that pushes
  buildings into the shallow band and papers over it with personal ramparts is a
  WORSE layout even if "safe." Treat each personal rampart as a real cost inside
  placement scoring, not an afterthought. Shallow-structure count per room should
  trend toward zero except where the room genuinely has no deep space.
- Minimize road count (fleet median < 90 held; fewer if it costs nothing else).
- Minimize eco distances: hub↔sources, hub↔controller, with **controller proximity
  weighted slightly ABOVE source proximity**; mineral proximity barely matters.
- Maximize anchors inside the wall: enclose sources/controller when the cut cost is
  small ("it's good to have stuff inside — it's all about defence"). The core may sit
  OFF-center, hugging a source or the controller, when that buys enclosure. Layouts
  need not be square or centered.
- Defender mobility: internal wall-to-wall paths must not exceed attacker external
  paths ("attacker walks 10, I refuse to walk 20") — target max ratio ≤ 1.2 per room,
  and the reviewer flags every room above 1.0 with a judgment call.
- Tower coverage: equalize damage across ALL wall faces (towers fall off hard with
  range), spread, refill-distance weighted; the first-built tower (array order) must
  be the easiest to refill.
- Controller outside the wall: rampart ONLY its adjacent ring (denies claim-attack
  stands) + link + container. Nothing wider.

## Judgment criteria (the owner's voice — reviewer applies these to sampled rooms)

- "Placed with intent, elegant" — nothing that looks accidental, no spam, no filler.
- "Hyper dynamic, grown from the room" — layouts must differ meaningfully across
  terrain; identical-looking rooms on different terrain = fail.
- "Dense but walkable" — extensions flank corridors; a filler tour is short and obvious.
- "Easily defensible, low actions to maintain in late game" — small shell, low upkeep,
  link-based logistics, minimal moving parts.
- Storage is the center of gravity; spawns spread around it, easy to refill, fanned
  into different sectors (never clumped — adjacency has no mechanical value).
- Battlement metadata present where defenders should stand.
- The plan gallery page + animation must make the reasoning legible ("watch the
  planner think") and match the plan tile-for-tile.

## Anti-patterns (auto-fail if a reviewer finds one)

- Sparse checkerboard extensions; solid extension bricks; extensions walled in.
- Road spam / city grids / roads on every rampart / roads serving nothing.
- Towers clumped on the hub; towers or eco within ranged-attacker reach (depth ≤ 3,
  unramparted); safety measured against the wall list instead of the exterior region.
- Score-chasing: optimizing a number while the layout worsens. The gallery is the
  final judge, not the score.
- Silent failure or silent capping — every shortfall must be loud and explained.
- Repair-loop architecture: a layer that "fixes" a previous layer's output instead of
  the previous layer being corrected at the source.

## Baseline + known weaknesses (attack these first)

Frozen fleet metrics: `docs/PLANNER-BASELINE-2026-08-01.json`
(159 rooms · ext60 159/159 · roads median 81 · ramparts total 8704 / median 55 ·
**shallow-rampart extensions 1793** · cut median 38 · eco median 39 ·
enclosed ctrl 88 / sources 170 · mobility>1 in 18 rooms · parks min 5).
Every cycle must move at least one number the right way without regressing others.

Known open criticisms, in priority order:
1. **1793 extensions sit shallow and buy personal ramparts** — the owner's top new
   criterion: placement should avoid the depth≤3 band so those ramparts vanish.
   Corridor growth currently trades depth for road-adjacency too eagerly.
2. 18 rooms with defender-mobility max > 1.0 (worst ~3.2) — attacker out-walks
   defender somewhere on the wall.
3. Escalated rooms (seed-skip) accept worse eco; the 1.6x cap is loose.
4. Controller parks min 5 (want comfortable ≥6 where terrain allows).
5. Rampart total should fall overall (8704 → meaningfully less) via deeper packing,
   not via weaker shells.

## Environment bootstrap (context gets compacted — everything you need)

- Repo: `C:\Users\stemm\Documents\GitHub\screeps\Pacifist-Bot`. Planner code:
  `tools/plan-suite/v2/` (plain .mjs ES modules). Live bot: `src/` (TypeScript,
  `npx tsc --noEmit` must pass).
- Node: repo default resolves to fnm v12 — use `fnm exec --using 22 node` for
  planner scripts and `"C:/Program Files/nodejs/node.exe"` for fetch-based scripts.
- Local server: docker `local-screeps-server-*`, API http://127.0.0.1:23025,
  mongo has all terrain. Bot users: pacifist (token in redis key
  `auth_local-pacifist-user-token-001`), pacifist-race, waxeye.
  Push code: `npm run push-pserver && npm run push-pacifist && npm run push-waxeye`.
- Live rooms E11S2/E11S5 are HYBRIDS (legacy structures hold some caps — storage/
  tower positions can't match plan there; that is known, not a planner bug).
  Rooms claimed by auto-expand (E9S2, E17S4, ...) are pure-plan rooms.
- Gallery served by `python -m http.server 8766` from `tools/plan-suite/out-v2/`
  (run detached if dead). Delegate implementation/review to Opus subagents with
  tightly curated specs; run adversarial reviewers as separate fresh agents.

## Process addendum

- **Commit after every clean cycle** (small conventional commits) — never let more
  than one cycle of work sit uncommitted.
- Update `docs/PLANNER-BASELINE-*.json` snapshots as metrics improve; keep the old
  ones for the trend line.

## After termination: the next campaign chains automatically

When THIS goal terminates (2 consecutive all-clean adversarial rounds + gates +
golden visual pass), do not stop. The owner has chained the next long-running
goal: **the early-game speedrun campaign** — `docs/EARLY-GAME-SPEEDRUN-CAMPAIGN.md`.
Read that document and begin it immediately, with the same process discipline
(Fable curates, Opus implements, adversarial verification, commit every clean
cycle). It is expected to take far longer than this goal; that is intended.
The owner's words: "keep going for ages … until nothing left to improve."

## Tooling (already built — use it)

- Suite: `fnm exec --using 22 node tools/plan-suite/v2/plan.mjs --all-claimable`
- Validator: `.../validate.mjs` (extend it whenever a reviewer finds an unchecked class
  — then mutation-test the new check)
- Anims: `.../export-anim.mjs --all` · Gallery: http://127.0.0.1:8766/
- Live: `push-plan.mjs <room> --user pacifist --adopt`, live view at /live/,
  spawn-in / expansion pack tooling under `tools/server/`
- Docker mongo has all room terrain; ~159 claimable rooms is the test fleet.
