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
 * feeds, declares the number, and then layers 3-7 eat them: 80 rooms lost 159
 * seats, and four rooms (E14S2 8->3, E16S3 8->3, E18S8 8->3, E17S5 5->3) shipped
 * UNDER the 4-seat floor this planner calls hard — passing the validator only on
 * a declaration they had generated themselves. 120 of the 159 went to
 * extensions, 18 to the observer (the one structure whose position is
 * irrelevant), 14 to towers and 7 to labs.
 *
 * A seat is worth more than the three tiles of hauler walk an extension saves by
 * standing on it: it throttles the upgrader fleet for the life of the room. So
 * the seats are protected down to a floor, and the DEFAULT floor is what layer 1
 * measured, capped at PARK_PROTECT — a room whose controller only ever offered
 * five seats is held to five, and one that offered eight is held to eight.
 *
 * This is a veto and not a score because a score has to be tuned against every
 * other term in five different layers and a floor does not — and because the
 * measurement above says the price of the veto is zero: the fleet ships the same
 * ramparts, the same shallow count and the same 172/172 extensions with the
 * whole ring held as it did with three quarters of it held.
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
 * and it bought NOTHING — identical 8264 ramparts, identical 39 shallow
 * extensions, identical 172/172 at 60 extensions, identical road median. The
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
