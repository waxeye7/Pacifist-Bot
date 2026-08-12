/**
 * Shared terrain + mongo helpers for plan-suite v2.
 * Intentionally tiny — no layout logic here.
 */
import { execSync } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const V2_ROOT = __dirname;
export const OUT_V2 = path.join(__dirname, "..", "out-v2");

/**
 * TERRAIN CODES ARE BITMASKS, NOT AN ENUM.
 *
 * The room terrain string stores one digit per tile: bit0 = wall, bit1 =
 * swamp. Code 3 (wall|swamp) is a REAL WALL that happens to also carry the
 * swamp flag — 10,863 of them exist across the 164 claimable rooms on this
 * shard, and every one of them used to read as buildable floor here because
 * this module compared with `=== WALL`.
 *
 * Ground truth, @screeps/engine/src/utils.js:333-336
 *     exports.checkTerrain = function(terrain, x, y, mask) {
 *         var code = terrain instanceof Uint8Array ? terrain[y*50+x]
 *                                                  : Number(terrain.charAt(y*50 + x));
 *         return (code & mask) > 0;
 *     };
 * and utils.js:149
 *     if(structureType != 'road' && exports.checkTerrain(objects, x, y, C.TERRAIN_MASK_WALL)) return false;
 *
 * So: wall = (code & 1) > 0, swamp = (code & 2) > 0, and a tile can be both.
 * Wall always wins for walkability and buildability.
 */
export const WALL = 1;
export const SWAMP = 2;

export const D4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const D8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function tileAt(terrain, x, y) {
  if (x < 0 || x > 49 || y < 0 || y > 49) return WALL;
  return parseInt(terrain.charAt(y * 50 + x), 10);
}
/** wall = bit 0. Code 3 (wall|swamp) IS a wall. */
export function isWall(terrain, x, y) {
  return (tileAt(terrain, x, y) & WALL) > 0;
}
/** swamp = bit 1. A code-3 tile is a wall first — it is never "swamp" to us. */
export function isSwamp(terrain, x, y) {
  const t = tileAt(terrain, x, y);
  return (t & WALL) === 0 && (t & SWAMP) > 0;
}
export function walkable(terrain, x, y) {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49 && !isWall(terrain, x, y);
}
export function buildable(terrain, x, y) {
  return x >= 2 && x <= 47 && y >= 2 && y <= 47 && !isWall(terrain, x, y);
}

// ---------------------------------------------------------------------------
// ENGINE BORDER-ADJACENCY RULE
// ---------------------------------------------------------------------------
/**
 * @screeps/engine/src/utils.js:120-126 (checkConstructionSite, verbatim):
 *
 *     var borderTiles;
 *     if(structureType != 'road' && structureType != 'container' &&
 *        (x == 1 || x == 48 || y == 1 || y == 48)) {
 *         if(x == 1)  borderTiles = [[0,y-1],[0,y],[0,y+1]];
 *         if(x == 48) borderTiles = [[49,y-1],[49,y],[49,y+1]];
 *         if(y == 1)  borderTiles = [[x-1,0],[x,0],[x+1,0]];
 *         if(y == 48) borderTiles = [[x-1,49],[x,49],[x+1,49]];
 *     }
 *     ... if(borderTiles) for(var i in borderTiles)
 *             if(!exports.checkTerrain(objects, bt[0], bt[1], C.TERRAIN_MASK_WALL)) return false;
 *
 * Three things the model has to copy exactly:
 *   1. road and container are EXEMPT. Everything else is not — including the
 *      extractor, whose exemption (utils.js:145) comes AFTER the border check.
 *   2. The four `if`s are sequential, not else-if, so at a CORNER the later
 *      assignment wins: a structure at (1,1) is checked against the y==1
 *      triple [[0,0],[1,0],[2,0]] and NOT against the x==1 triple. Same for
 *      (48,1), (1,48), (48,48) — the y-side always wins.
 *   3. Every border tile must BE a natural wall (the test is inverted: a
 *      non-wall edge tile rejects the site). No clamping is needed — x and y
 *      of a legal structure are in 1..48, so the triples never leave 0..49.
 */
export function borderTiles(structureType, x, y) {
  if (structureType === "road" || structureType === "container") return null;
  if (!(x === 1 || x === 48 || y === 1 || y === 48)) return null;
  let bt = null;
  if (x === 1) bt = [[0, y - 1], [0, y], [0, y + 1]];
  if (x === 48) bt = [[49, y - 1], [49, y], [49, y + 1]];
  if (y === 1) bt = [[x - 1, 0], [x, 0], [x + 1, 0]];
  if (y === 48) bt = [[x - 1, 49], [x, 49], [x + 1, 49]];
  return bt;
}

/** true when the engine's border-adjacency rule permits `type` at (x,y). */
export function borderLegal(terrain, x, y, type) {
  const bt = borderTiles(type, x, y);
  if (!bt) return true;
  for (const [bx, by] of bt) if (!isWall(terrain, bx, by)) return false;
  return true;
}

/**
 * Full terrain-side createConstructionSite predicate, mirroring the
 * `_.isString(objects)` branch of utils.js:128-162. Object-side collisions
 * (stacking, obstacles) are the validator's STACK/OBJECT checks, not this.
 */
export function engineBuildable(terrain, x, y, type) {
  if (x < 1 || y < 1 || x > 48 || y > 48) return false; // utils.js:191 (objects branch)
  if (!borderLegal(terrain, x, y, type)) return false; // utils.js:139-143
  if (type === "extractor") return true; // utils.js:145-147
  if (type !== "road" && isWall(terrain, x, y)) return false; // utils.js:149
  return true;
}
export function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
export function key(x, y) {
  return `${x},${y}`;
}

// ---------------------------------------------------------------------------
// THE EXTERIOR FLOOD — ONE IMPLEMENTATION, TWO FIELDS, AN EXPLICIT CONTRACT
// ---------------------------------------------------------------------------
/**
 * Exterior = the tiles an attacker can stand on: flood from the four room
 * edges, `blockSet` blocks, natural wall blocks. That is the whole definition
 * and it was written out twice in this tree — layer-shell called the argument
 * `cutSet`, layer-walls called it `rampartSet`, and the bodies were otherwise
 * character-for-character the same function. Two copies of a definition is two
 * chances for one of them to drift, so there is one. (layer-ext's 7b reflow
 * keeps its own `floodExterior` and that is NOT a third copy: it floods over a
 * `passable` predicate in which ROADS TUNNEL NATURAL WALL, because the reflow
 * has to see the board a creep on the shipped road network sees. Different
 * question, different flood, and it says so at its own call site.)
 *
 * ------------------------------------------------------------------------
 * ...AND THE ANSWER DEPENDS ENTIRELY ON WHAT YOU PUT IN `blockSet`, WHICH IS
 * WHY THERE ARE TWO FIELDS ON THE PLAN AND NOT ONE.
 * ------------------------------------------------------------------------
 *   plan.exterior   — THE ENCLOSURE. Flooded against layer 2's min-cut RING
 *                     alone, frozen the moment the shell is bought, and never
 *                     written again. This is the field `plan.depth` is derived
 *                     from and the field every "is this tile inside the shell
 *                     we paid for" question is asked of. It is not stale for
 *                     that question: it IS that question.
 *   liveExterior()  — THE WALL THE ROOM IS STANDING ON RIGHT NOW. Flooded
 *                     against EVERY rampart in plan.structures.rampart at the
 *                     moment of the call. This is the field every "may a creep
 *                     / a road / an attacker be here" question is asked of.
 *
 * The two disagree, always and by construction, in BOTH directions:
 *   - ADDING a rampart (every eco bubble, lab cover, mineral seat and personal
 *     rampart from layers 2-6) can only SHRINK the exterior, so the enclosure
 *     reading WITHHOLDS tiles that are legally interior to the shipped wall;
 *   - REMOVING a rampart (layer 7's inert prune) can only GROW it, so the
 *     enclosure reading EXPOSES tiles it still calls interior that the shipped
 *     wall has since opened to the outside.
 *
 * The second direction is the dangerous one and it is the one that bit. Round
 * 23 fixed a single pass (stage 5b, the along-the-cut swap) that had shipped
 * two paved tiles outside their own wall. Round 24's instrumented re-compose of
 * the 172-room world found the same defect one stage over and unfixed, in
 * `paveable()` — the sole expansion predicate for every stitch, spur and
 * extension-face road layer 7 lays. See the block above that predicate in
 * layer-walls.mjs for the measurement and its roster; the short version is that
 * it was answering a question about a wall the room had already stopped
 * standing on, and that no other test in that layer would have caught it.
 *
 * So: consumers whose question is about the SHIPPED WALL call liveExterior();
 * consumers whose question is about the ENCLOSURE keep plan.exterior AND SAY SO
 * at the call site. There is no third option, and there is no consumer that
 * gets to be vague about which one it meant.
 *
 * The refresh contract is not a convention. `liveExterior` memoises per plan and
 * the memo key is the rampart array's IDENTITY and its LENGTH plus an explicit
 * stamp, so every way this tree has ever moved a rampart — reassigning the array
 * (the shell hand-off, the inert prune, layer-ext's retirement pass, the m7
 * dedupe) and pushing onto it (lab cover, mineral bubbles, shallow-extension
 * cover, the 7b reflow's shallow set) — invalidates it without anyone having to
 * remember.
 *
 * `invalidateExterior()` exists for the case the key cannot see — a same-length
 * in-place edit — and ALL EIGHT of those sites call it anyway (five in
 * pipeline.mjs, two in layer-walls.mjs, one in layer-ext.mjs; layer-shell builds
 * its list before it is on a plan and is not one). That is not
 * belt-and-braces for its own sake: two of the eight (layer-ext's retirement pass
 * and the 7b reflow's push) were relying on the length term of the memo key
 * WITHOUT knowing it, because they were written before the memo existed and
 * nobody had gone back to check. A memo that is correct by luck is the bug this
 * whole header replaces, and "what can invalidate the flood" should be one grep
 * and not an argument.
 */
export function exteriorFlood(terrain, blockSet) {
  const e = new Uint8Array(2500);
  const q = [];
  for (let i = 0; i < 50; i++) {
    for (const [x, y] of [
      [i, 0],
      [i, 49],
      [0, i],
      [49, i],
    ]) {
      if (!walkable(terrain, x, y) || blockSet.has(key(x, y))) continue;
      const ii = x + y * 50;
      if (!e[ii]) {
        e[ii] = 1;
        q.push(ii);
      }
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % 50,
      y = (i / 50) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 49 || ny > 49) continue;
      if (!walkable(terrain, nx, ny) || blockSet.has(key(nx, ny))) continue;
      const ni = nx + ny * 50;
      if (e[ni]) continue;
      e[ni] = 1;
      q.push(ni);
    }
  }
  return e;
}

/**
 * The exterior of the wall the room is standing on at this instant.
 * Returns `{ ext, rset }` — the flood and the rampart key set it was taken
 * against, because every caller that wants one wants the other.
 */
export function liveExterior(terrain, plan) {
  const ramp = plan.structures?.rampart || [];
  const m = plan._liveExt;
  if (m && m.ref === ramp && m.n === ramp.length && m.stamp === (plan._extStamp || 0)) return m;
  const rset = new Set(ramp.map((r) => key(r.x, r.y)));
  const ext = exteriorFlood(terrain, rset);
  plan._liveExt = { ref: ramp, n: ramp.length, stamp: plan._extStamp || 0, rset, ext };
  // the field name layer 7 and the pipeline already publish under
  plan.shippedExterior = ext;
  return plan._liveExt;
}

/** call after anything mutates plan.structures.rampart */
export function invalidateExterior(plan) {
  plan._extStamp = (plan._extStamp || 0) + 1;
  plan._liveExt = null;
}

/**
 * THE ENCLOSURE READING IS ALLOWED, AND IT IS CHECKED.
 *
 * Layers 3-6 ask the enclosure question on purpose (see above) and their answer
 * is one-directional by construction: nothing removes a rampart before layer 7,
 * so the frozen flood can only ever be MORE conservative than the live wall —
 * it withholds interior, it never exposes exterior. "By construction" is the
 * same phrase that was true of `paveable()` right up until the inert prune was
 * added underneath it, so it is measured instead of asserted.
 *
 * `exposed` is the count of tiles the frozen enclosure calls INTERIOR that the
 * live wall calls EXTERIOR — the dangerous direction, and the number that must
 * be 0. It is 0 in 172/172 rooms at every one of the four call sites today; the
 * record ships so that a reader can see that rather than be told it, and so the
 * validator can gate it. A non-zero reading is not a rounding error: it means
 * that consumer has started running after a rampart-REMOVING pass and has to
 * move to liveExterior() the same way paveable() did.
 */
/**
 * OM3 / MM2 (round 25) — THE WITHHELD COUNT WAS A NUMBER NOBODY COULD CHECK.
 *
 * `withheld` shipped as an integer and nothing else: no tile list, and
 * `plan.exterior` is stripped out of the artifact, so no reader and no gate
 * could re-derive it. Zeroing all 688 of this fleet's records and inflating one
 * of them by 500 both passed 172/172 — a field that survives being set to
 * anything is a decoration, whatever it happens to be measuring. (The answer it
 * happens to be measuring is clean: the withheld tiles are remote-cluster
 * bubbles, and layer 7's `paveable()` reads the LIVE flood and paved none of
 * them. That is the point — it is clean and it was not checkable.)
 *
 * So the tiles ship. It is a small list — the fleet's four call sites withhold a
 * couple of thousand tile-readings between them over a few hundred distinct
 * tiles — and it makes every consumer of this record derivable rather than
 * asserted:
 *
 *   the COUNT is the length of the list beside it;
 *   the per-room DISTINCT set is the union of the four lists, which is NOT the
 *   sum of the four counts and never was — the same tile withheld from all four
 *   consumers is counted four times by the sum and once by the union, and the
 *   basis sentence below says so rather than leaving a reader to discover it by
 *   adding the fleet up and getting a number three times too big;
 *   the MONOTONICITY the record's own justification implies (the frozen flood
 *   can only ever be more conservative, and nothing removes a rampart before
 *   layer 7, so a later call site can only withhold MORE) is now a set
 *   containment a gate can run and not just a pair of integers;
 *   and the FROZEN FLOOD ITSELF is reconstructible from `meta.shell.cutAtFreeze`
 *   (see pipeline.mjs) — layer 2's exterior is the flood over layer 2's cut, and
 *   layer 7 moves that cut in seven of this fleet's rooms, which is exactly why
 *   the pre-mutation list is published beside it.
 */
export const EXTERIOR_CONTRACT_BASIS =
  `Each entry is one consumer's reading of the FROZEN layer-2 enclosure (plan.exterior) against the ` +
  `live wall at the moment that consumer ran. \`exposed\` is the dangerous direction and must be 0: ` +
  `tiles the frozen flood calls interior that the live wall calls exterior. \`withheldTiles\` is the ` +
  `safe direction — interior the frozen flood refuses to hand this consumer, because layers 3-6 only ` +
  `ADD ramparts — and \`withheld\` is its length. THE FOUR COUNTS OVERLAP AND MUST NOT BE ADDED: a ` +
  `tile withheld from every consumer appears in all four lists, so the sum over the entries counts it ` +
  `four times and the room's distinct withheld set is the UNION of the lists, not the sum of the ` +
  `counts. The frozen flood is reconstructible: it is exteriorFlood() over meta.shell.cutAtFreeze, ` +
  `which is layer 2's cut before layer 7's prune and seal reconciliation move it.`;
export function checkEnclosureContract(terrain, plan, at) {
  const frozen = plan.exterior;
  if (!frozen || !plan.meta) return null;
  const { ext: live } = liveExterior(terrain, plan);
  let exposed = 0;
  const exposedTiles = [];
  const withheldTiles = [];
  for (let i = 0; i < 2500; i++) {
    if (!!frozen[i] === !!live[i]) continue;
    if (!frozen[i] && live[i]) {
      exposed++;
      if (exposedTiles.length < 8) exposedTiles.push(`${i % 50},${(i / 50) | 0}`);
    } else withheldTiles.push(`${i % 50},${(i / 50) | 0}`);
  }
  const rec = { at, exposed, withheld: withheldTiles.length, withheldTiles };
  if (exposed) rec.exposedTiles = exposedTiles;
  (plan.meta.exteriorContract ||= []).push(rec);
  plan.meta.exteriorContractBasis = EXTERIOR_CONTRACT_BASIS;
  if (exposed) {
    (plan.meta.shortfalls ||= []).push({
      gate: "exterior",
      detail:
        `${at} reads the frozen enclosure (plan.exterior) but ${exposed} tile(s) it ` +
        `calls interior are OUTSIDE the wall the room is standing on ` +
        `(${exposedTiles.join(" ")}${exposed > exposedTiles.length ? " ..." : ""}) — ` +
        `this consumer now runs after a rampart-removing pass and must read ` +
        `liveExterior() instead`,
      tiles: exposedTiles.map((t) => {
        const [x, y] = t.split(",").map(Number);
        return { x, y };
      }),
    });
  }
  return rec;
}

// ---------------------------------------------------------------------------
// PLACEMENT INVARIANTS THAT BELONG TO A ROOM OBJECT, NOT TO A STRUCTURE
// ---------------------------------------------------------------------------
/**
 * THE MINERAL'S WORK SEAT IS A PLACEMENT INVARIANT, NOT A LATE DISCOVERY.
 *
 * E9S9 shipped an extractor on 41,18 and its container on 40,19 that NO CREEP
 * CAN EVER REACH. The mineral's eight neighbours are five natural walls and two
 * of our labs, so 40,19 is the only mining stand the room has; 40,19's own eight
 * neighbours are three natural walls, three labs, a tower and a spawn. Every one
 * an engine obstacle. The mineral is unharvestable forever, both structures
 * decay forever, and the RCL6 extractor build order stalls on a site no builder
 * can stand beside.
 *
 * Nothing caught it because every guard in the pipeline was written about
 * STRUCTURES. layer-labs already refuses a stamp that empties the mineral's ring
 * (`keepsMineralSeat`), and that guard held — the ring kept 40,19. What it did
 * not ask is whether the surviving seat could still be WALKED TO. The
 * controller has had exactly this protection since the claim-seat work
 * (`plan.claimSeat` plus a reserved `claimApproach`, so the room keeps one
 * walkable step into the seat no matter what the mass does); the mineral is the
 * other room object a creep has to stand beside, and it had half of it.
 *
 * So the invariant is stated once, here, and every layer that places a blocking
 * structure asks it about its own candidate: AT LEAST ONE mineral-ring tile must
 * be free AND keep at least one free walkable tile to be approached from. It is
 * local (8x8 lookups, no flood) because it runs inside the extension mass's
 * inner loop; the GLOBAL version — a flood from the sitter that has to arrive —
 * is the validator's job (see MINERAL SEAT in validate.mjs), and the two are
 * checked against each other on every run of the fleet.
 *
 * A ring that is ALREADY empty of free tiles before we place anything is the
 * room beating us, not us beating the room: layer 5 declares that case
 * (`no free walkable ring tile`) and this invariant deliberately passes it
 * through rather than making every later layer unsatisfiable.
 */
export function mineralRing(terrain, plan) {
  const out = [];
  if (!plan || !plan.mineral) return out;
  const objs = plan.objectTiles || new Set();
  for (const [dx, dy] of D8) {
    const x = plan.mineral.x + dx,
      y = plan.mineral.y + dy;
    if (x < 1 || y < 1 || x > 48 || y > 48) continue;
    if (!walkable(terrain, x, y)) continue;
    if (objs.has(key(x, y))) continue;
    out.push({ x, y });
  }
  return out;
}

/**
 * True when, with `blocked` standing (engine obstacles only — roads, containers
 * and ramparts are walkable), the mineral still has a stand a creep can occupy
 * and step into. `ring` may be passed in when the caller has already computed it
 * for this room, which is the whole reason this is affordable in a hot loop.
 */
export function mineralSeatHolds(terrain, plan, blocked, ring) {
  const seats = ring || mineralRing(terrain, plan);
  if (!seats.length) return true; // an already-sealed ring is layer 5's honest shortfall
  const objs = plan.objectTiles || new Set();
  for (const s of seats) {
    if (blocked.has(key(s.x, s.y))) continue;
    for (const [dx, dy] of D8) {
      const x = s.x + dx,
        y = s.y + dy;
      if (x < 0 || y < 0 || x > 49 || y > 49) continue;
      if (!walkable(terrain, x, y)) continue;
      const k = key(x, y);
      if (objs.has(k)) continue; // the mineral itself, a source, the controller
      if (blocked.has(k)) continue;
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// THE UPGRADER'S PARKING IS A PRICED RESOURCE, NOT FREE FLOOR
// ---------------------------------------------------------------------------
/**
 * Layer 1 chooses the controller link on how many walkable range-3 seats it
 * feeds, declares the number, and then layers 3-7 eat them — measured on the
 * round-9 build (2026-08-02), the run this rule was written against: 80 rooms
 * lost 159 seats, and four rooms (E14S2 8->3, E16S3 8->3, E18S8 8->3,
 * E17S5 5->3) shipped UNDER the 4-seat floor this planner calls hard — passing
 * the validator only on a declaration they had generated themselves. 120 of
 * the 159 went to extensions, 18 to the observer (the one structure whose
 * position is irrelevant), 14 to towers and 7 to labs.
 *
 * A seat is worth more than the three tiles of hauler walk an extension saves by
 * standing on it: it throttles the upgrader fleet for the life of the room. So
 * the seats are protected down to a floor, and the DEFAULT floor is what layer 1
 * measured, capped at PARK_PROTECT — a room whose controller only ever offered
 * five seats is held to five, and one that offered eight is held to eight.
 *
 * This is a veto and not a score because a score has to be tuned against every
 * other term in five different layers and a floor does not — and because the
 * measurement above says the price of the veto is zero: in that same round-9
 * A/B the fleet shipped the same ramparts, the same shallow count and the same
 * 172/172 extensions with the whole ring held as it did with three quarters of
 * it held.
 *
 * ---------------------------------------------------------------------------
 * "THE DEFAULT" IS DOING REAL WORK IN THAT SENTENCE — TWO ROOMS ARE BELOW IT.
 * ---------------------------------------------------------------------------
 * This paragraph used to read "the floor IS what layer 1 measured, capped at
 * PARK_PROTECT", full stop, while E12S5 ships `meta.ctrlParkFloor = 2`. Both
 * statements were true about different things and the reader was given no way
 * to tell: the cap is the DEFAULT reservation, and `maybeReleaseParks` in
 * pipeline.mjs may lower it — once, on the composition the room is about to
 * ship, and only when the room is paying for the reservation in SHALLOW
 * EXTENSIONS (a personal rampart repaired forever plus a structure a ranged
 * attacker can reach). Two rooms took that trade: E12S5 (7 -> 5 seats) and
 * E9S2 (8 -> 7), each with a `ctrlParks` declaration naming
 * the tiles it gave back and what it bought.
 *
 * What is NEVER lowered is PARK_FLOOR_HARD = 4, which is MIN_PARKS in layer 1
 * and the validator's `ctrlparks` gate: the release pass is judged on the seats
 * the room SHIPS, not on the size of the reservation, and a composition that
 * ships under four is rejected outright. E12S5 holds 2 and ships 5.
 *
 * So: `ctrlParkFloor` is what this room reserved, `ctrlParks` is what it ships,
 * and `ctrlParkFloorWhy` (written next to it) says which of the two rules
 * produced the number. A doc sentence that needs a footnote to stop being wrong
 * is a doc sentence with a missing clause.
 */
/**
 * How many of layer 1's counted upgrader seats are held against every later
 * layer. 8 is the ring's own maximum, so this is "all of them" — and that is a
 * measurement, not a maximalist default. A floor of 6 (the number the review
 * asked for) was run over the whole fleet first: it cost 33 rooms one seat each,
 * and it bought NOTHING — identical ramparts, identical shallow extensions,
 * identical 172/172 at 60 extensions, identical road median. That A/B ran on
 * the round-9 build (2026-08-02), whose totals were 8264 ramparts and 39
 * shallow extensions; the round-20 build of this same 172-room fleet ships 8208
 * ramparts and 25 shallow extensions, still 172/172 at 60 (road median 81). The
 * seats the mass wanted at 6 it simply took from somewhere else, so the cheaper
 * floor was cheaper only for the controller. Held at the full count.
 */
export const PARK_PROTECT = 8;

/**
 * EVERY TILE THE LAYERS THAT PLACE BLOCKING STRUCTURES MAY NOT HAVE.
 *
 * One list, one definition, five consumers (towers, labs, misc, the extension
 * mass and the post-prune reflow). It used to be two lines copy-pasted into four
 * files, which is why the mineral's stand and the upgrader's parking — the other
 * two things a creep has to stand on — were never in it.
 *
 * THIS IS A STRUCTURE BAN, NOT AN OBSTACLE. It deliberately does NOT go into the
 * layers' `occupied` sets: those double as the pathing mask and the no-road
 * mask, and reserving a walkable tile there tells a layer the tile is a WALL.
 * The first cut of the claim seat did exactly that and E15S5 paid for it — its
 * tower moved off 34,6 onto 33,6 and then could not be stitched to the road
 * network at all, because the one tile the stitch wanted to pave was the
 * reserved approach. A creep stands on these tiles; a road or a rampart may run
 * over them; only a blocking STRUCTURE may not be placed on them.
 */
export function reservedTiles(plan) {
  const s = new Set();
  if (!plan) return s;
  if (plan.claimSeat) s.add(key(plan.claimSeat.x, plan.claimSeat.y));
  if (plan.claimApproach) s.add(key(plan.claimApproach.x, plan.claimApproach.y));
  for (const p of plan.parkReserve || []) s.add(key(p.x, p.y));
  return s;
}

/**
 * THE MINERAL IS NOT ON THIS LIST, AND THAT IS THE POINT.
 *
 * The first cut reserved a mineral seat and an approach exactly the way the
 * controller's are reserved, and it works — but a static reservation spends two
 * tiles in EVERY room to fix a problem one room in 172 has. Measured: E12S6 (106
 * deep tiles for the whole RCL8 program) paid three extra SHALLOW extensions,
 * three personal ramparts forever, for two tiles it never needed. The controller
 * pays that price willingly because a room that cannot be re-claimed is dead;
 * the mineral's failure mode is a dead extractor, and the invariant that
 * prevents it can be checked exactly instead of pre-paid.
 *
 * So `mineralSeatHolds` is a VETO every placing layer applies to its own
 * candidate — and only to candidates near enough to matter, which is what makes
 * it free in the extension mass's inner loop. `mineralGuard` is the shape that
 * does the bounds check for the caller.
 */
export function mineralGuard(terrain, plan) {
  const ring = mineralRing(terrain, plan);
  const mineral = plan && plan.mineral;
  if (!ring.length || !mineral) return { ring: [], ok: () => true, active: false };
  // A CALLER'S `occupied` IS NOT AN OBSTACLE SET, and the difference is the
  // mineral container itself. Every layer folds containers (and often the sitter
  // road) into the set it uses to mean "cannot build here", which is correct for
  // placement and wrong for walking: a creep stands on a container. Feeding that
  // set to a REACHABILITY test would declare the miner's own seat impassable and
  // refuse every candidate in the room. So the guard strips the walkable things
  // back out of whatever it is handed.
  const soft = new Set();
  for (const t of ["container", "road", "rampart"]) {
    for (const p of (plan.structures && plan.structures[t]) || []) soft.add(key(p.x, p.y));
  }
  if (plan.sitter) soft.add(key(plan.sitter.x, plan.sitter.y));
  return {
    ring,
    active: true,
    /**
     * May a blocking structure stand on `p`, given `blocked` (whatever the
     * caller is using for occupancy)? Only tiles within chebyshev 2 of the
     * mineral can seal a stand or a stand's approach, so every other tile in the
     * room is answered with two subtractions and no work at all — which is what
     * makes this affordable inside the extension mass's inner loop.
     */
    ok(p, blocked) {
      if (Math.max(Math.abs(p.x - mineral.x), Math.abs(p.y - mineral.y)) > 2) return true;
      const b = new Set();
      for (const k of blocked) if (!soft.has(k)) b.add(k);
      b.add(key(p.x, p.y));
      return mineralSeatHolds(terrain, plan, b, ring);
    },
  };
}

export function approachTile(terrain, pos) {
  if (walkable(terrain, pos.x, pos.y)) return { x: pos.x, y: pos.y };
  let best = null;
  let bestD = 99;
  for (const [dx, dy] of D8) {
    const x = pos.x + dx,
      y = pos.y + dy;
    if (!walkable(terrain, x, y)) continue;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}

/** Simple BFS path length (D8). null if unreachable. */
export function pathLen(terrain, from, to, blocked = null) {
  const start = approachTile(terrain, from);
  const goal = approachTile(terrain, to);
  if (!start || !goal) return null;
  const goalK = key(goal.x, goal.y);
  const seen = new Set([key(start.x, start.y)]);
  const q = [{ x: start.x, y: start.y, d: 0 }];
  let qi = 0;
  while (qi < q.length) {
    const { x, y, d } = q[qi++];
    if (key(x, y) === goalK) return d;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      if (!walkable(terrain, nx, ny)) continue;
      if (blocked && blocked.has(k) && k !== goalK) continue;
      seen.add(k);
      q.push({ x: nx, y: ny, d: d + 1 });
    }
  }
  return null;
}

export function fetchRoomsFromMongo(rooms) {
  const list = rooms.map((r) => JSON.stringify(r)).join(",");
  const script = `db = db.getSiblingDB("screeps");
var rooms = [${list}];
var out = [];
for (var i = 0; i < rooms.length; i++) {
  var room = rooms[i];
  var t = db["rooms.terrain"].findOne({room: room});
  if (!t) continue;
  var objects = db["rooms.objects"].find({room: room, type: {$in: ["source","controller","mineral"]}}).toArray();
  out.push({ room: room, terrain: t.terrain, objects: objects });
}
print(JSON.stringify(out));
`;
  const p = path.join(__dirname, "_dump-rooms.js");
  fs.writeFileSync(p, script);
  execSync(`docker cp "${p}" local-screeps-server-mongo-1:/tmp/dump-rooms-v2.js`);
  // The dump intermittently returns a truncated result (~1 run in 8 during the
  // round-13 harness work — one room of 172, no error). A short dump read as
  // truth turns into a false mass-failure downstream, so a result smaller than
  // the request is retried, and only a stable shortfall (rooms genuinely absent
  // from mongo) is returned.
  for (let attempt = 0; ; attempt++) {
    const raw = execSync(
      `docker exec local-screeps-server-mongo-1 mongosh --quiet --file /tmp/dump-rooms-v2.js`,
      { encoding: "utf8", maxBuffer: 80e6 },
    );
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0) throw new Error("mongo dump failed: " + raw.slice(0, 200));
    const out = JSON.parse(raw.slice(start, end + 1));
    if (out.length >= rooms.length || attempt >= 3) {
      // a stable shortfall is legitimate (rooms genuinely absent from mongo,
      // e.g. highway names in a hand-passed list) — warn, don't invent an error
      if (out.length < rooms.length)
        console.error(`fetchRoomsFromMongo: short dump persisted (${out.length}/${rooms.length}) after ${attempt + 1} attempts`);
      return out;
    }
  }
}

export function fetchAllClaimableRooms() {
  const script = `db = db.getSiblingDB("screeps");
var src = db["rooms.objects"].aggregate([
  {$match:{type:"source"}},
  {$group:{_id:"$room", n:{$sum:1}}},
  {$match:{n:{$gte:2}}}
]).toArray().map(x=>x._id);
var ctrl = db["rooms.objects"].distinct("room", {type:"controller"});
var claim = src.filter(r => ctrl.indexOf(r) >= 0).sort();
print(JSON.stringify(claim));
`;
  const p = path.join(__dirname, "_claimable.js");
  fs.writeFileSync(p, script);
  execSync(`docker cp "${p}" local-screeps-server-mongo-1:/tmp/_claimable-v2.js`);
  const raw = execSync(
    `docker exec local-screeps-server-mongo-1 mongosh --quiet --file /tmp/_claimable-v2.js`,
    { encoding: "utf8" },
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0) throw new Error("claimable dump failed: " + raw.slice(0, 200));
  return JSON.parse(raw.slice(start, end + 1));
}

export const GOLDEN = ["E2S7", "E5S1", "E5S7", "E1S4", "E9S8"];

/**
 * ---------------------------------------------------------------------------
 * THE ONE DIGEST THAT SAYS "THIS FILM IS OF THIS PLAN".
 * ---------------------------------------------------------------------------
 * `plan.mjs` writes plans-hub.json and `export-anim.mjs` re-plans every room to
 * write the films, and until round 10 nothing compared the two. A planner change
 * between the two commands leaves the gallery playing a film of a base that no
 * longer exists, under a HUD line asserting the last frame IS the shipped plan
 * tile for tile — which is exactly the state 20 rooms were in when an
 * independent final-frame check read 152/172.
 *
 * mtime does not work: plans-hub.json is rewritten on every suite run, so the
 * films read "older" the moment you re-plan even when the output is
 * byte-identical. This is the content comparison instead, and it is deliberately
 * about the FINAL FRAME's subject matter and nothing else:
 *
 *   - structure TYPE and TILE only — no meta, no shortfalls, no build order.
 *     A film is a claim about what stands where at the end; re-sorting the road
 *     array is a real change to the build order and not a change to that claim,
 *     and a false alarm on a build-order change would train the reader to ignore
 *     the alarm.
 *   - sorted (type, then y, then x) so two producers that agree about the room
 *     agree about the digest regardless of the order they emit in.
 *
 * Both callers import THIS function. Two copies of a hash is a hash that
 * eventually disagrees with itself about nothing.
 */
export function planStructureHash(plan) {
  const st = plan.structures || {};
  const parts = [];
  for (const type of Object.keys(st).sort()) {
    const tiles = (st[type] || [])
      .map((p) => [p.y, p.x])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .map(([y, x]) => `${x},${y}`)
      .join(" ");
    parts.push(`${type}:${tiles}`);
  }
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}
