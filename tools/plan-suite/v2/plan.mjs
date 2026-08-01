/**
 * Pacifist base planner v2 — layer runner
 *
 * Currently: hub only (layer 1). RCL8 final positions.
 * Gallery uses real Screeps structure SVGs.
 *
 *   node tools/plan-suite/v2/plan.mjs
 *   node tools/plan-suite/v2/plan.mjs --rooms E2S7,E5S1
 *   node tools/plan-suite/v2/plan.mjs --all-claimable
 */
import fs from "fs";
import path from "path";
import {
  OUT_V2,
  GOLDEN,
  fetchRoomsFromMongo,
  fetchAllClaimableRooms,
} from "./shared.mjs";
import {
  renderRoomSvg,
  renderThumbSvg,
  thumbLegendHtml,
  hubCrop,
  legendHtml,
  iconLayers,
  iconDataUri,
  ROAD_PAINT,
  RAMPART_PAINT,
} from "./render.mjs";
import { EXT_TARGET, planRoom } from "./pipeline.mjs";

/**
 * Sprite kinds the animation player rasterises. Same names render.mjs uses, so
 * `iconLayers` hands back the SAME file stack the gallery SVG draws.
 */
const ANIM_SPRITE_TYPES = [
  "extension",
  "storage",
  "terminal",
  "tower",
  "lab",
  "link",
  "nuker",
  "observer",
  "extractor",
  "spawn",
  "container",
  "source",
  "mineral",
  "controller",
];

/**
 * The gallery's own base64 embedder, once per page, keyed by structure type.
 * The player rasterises each stack into a tile-sized offscreen canvas — it does
 * not own an icon table of its own, because a second table is a table that
 * drifts.
 */
function animSprites() {
  const out = {};
  for (const t of ANIM_SPRITE_TYPES) {
    const layers = iconLayers(t)
      .map((l) => ({ u: iconDataUri(l.file), s: l.scale }))
      .filter((l) => l.u);
    if (layers.length) out[t] = layers;
  }
  return out;
}

/**
 * The claims stage is the one stage whose tiles are HETEROGENEOUS — storage,
 * terminal, links, spawns and containers all land in it — and the frame file
 * only carries a colour. Rather than reverse-engineering the type back out of
 * the palette (which would break the moment a colour changed), the type is read
 * straight off the shipped plan and matched by coordinate. Every other stage is
 * one type by construction, so a stage->type map covers it.
 */
function animClaimKinds(plan) {
  const out = {};
  for (const t of ["container", "link", "spawn", "terminal", "storage"]) {
    for (const p of plan.structures[t] || []) out[`${p.x},${p.y}`] = t;
  }
  return out;
}

/**
 * PER-LAYER CAPTIONS, READ OFF THE PLAN — NEVER INVENTED.
 *
 * Each string below is assembled from a number the planner already published
 * (meta.counts, meta.towers, meta.extensions, meta.shellEscalation, shell.*).
 * If the plan does not carry the number, the layer gets no caption; a made-up
 * caption on a film whose whole selling point is "this is what actually
 * happened" would be the worst possible bug.
 */
function animNotes(plan) {
  const m = plan.meta || {};
  const c = m.counts || {};
  const n = {};

  if (plan.seed && plan.hub) {
    n.seed = `seed (${plan.seed.x},${plan.seed.y}) → hub (${plan.hub.x},${plan.hub.y})`;
  }
  if (m.coreSize != null) n.core = `${m.coreSize} tiles in the pocket`;
  n.claims =
    `${c.spawn ?? 0} spawns · ${c.container ?? 0} containers · ${c.link ?? 0} links` +
    (m.storageAccessD4 != null ? ` · storage reachable from ${m.storageAccessD4} sides` : "");
  // ------------------------------------------------------------------
  // ROAD CAPTIONS ARE PER LAYER NOW, AND EACH ONE COUNTS ONLY ITS OWN TILES.
  //
  // There used to be exactly one road caption, and it read: "<total> road
  // tiles — hub, spawns, sources, controller, plus the layer-7 rampart spurs
  // (drawn here so the web reads as one net)". The parenthesis was an honest
  // admission that the film was showing a frame that never existed, and it
  // was attached to the frame a reviewer needs in order to check layer 4's lab
  // declaration. The film now emits each layer's roads at that layer (see
  // roadProvenance in export-anim.mjs), so each caption states what THAT layer
  // laid, read off meta.roadLayer rather than asserted.
  // ------------------------------------------------------------------
  const rl = m.roadLayer || {};
  const aliveRoads = new Set((plan.structures.road || []).map((r) => `${r.x},${r.y}`));
  const perLayer = {};
  let ghosts = 0;
  for (const k of Object.keys(rl)) {
    perLayer[rl[k]] = (perLayer[rl[k]] || 0) + 1;
    if (!aliveRoads.has(k)) ghosts++;
  }
  const laid = (l) => perLayer[l] || 0;
  const total = c.road ?? aliveRoads.size;
  if (laid(1)) {
    n.roads = `${laid(1)} tiles laid with the hub kit, before the wall exists — the finished room ships ${total} across every layer`;
  } else if (c.road != null) {
    n.roads = `${total} road tiles`;
  }
  if (laid(3)) n.roadsTwr = `${laid(3)} tiles — refill spurs to the towers layer 3 has just placed`;
  if (laid(4)) {
    n.roadsLab =
      `${laid(4)} tiles — access to the lab diamond, laid AFTER it: the anchor scan rejects a diamond ` +
      `that touches the road network, so this road cannot exist while the labs are being chosen`;
  }
  if (laid(5)) n.roadsMisc = `${laid(5)} tiles — the run out to the mineral seat`;
  if (laid(6)) {
    n.roadsExt =
      `${laid(6)} corridor tiles — the extension mass grows off these faces` +
      (m.extensions ? ` (${m.extensions.stubRoads} stub roads by layer 6's own count)` : "");
  }
  if (laid(7)) {
    n.roadsLate =
      `${laid(7)} tiles — rampart spurs and the extension-face safety net` +
      (m.walls ? ` · ${m.walls.spurred}/${m.walls.clusters} wall clusters served` : "");
  }
  if (ghosts) {
    n.roadsPrune =
      `${ghosts} tiles deleted — laid by an earlier layer, dead ends once every layer was in` +
      (m.walls ? ` · meta.walls.pruned = ${m.walls.pruned}` : "");
  }

  const bits = [];
  const esc = m.shellEscalation;
  if (esc && esc.walked) {
    const why = [];
    if (esc.why?.demand) why.push("the tight wall left no deep floor for the program");
    if (esc.why?.shallow) why.push("extensions were being forced onto shallow, exposed tiles");
    if (esc.why?.mobility) why.push("defenders could not out-walk an attacker around the wall");
    const tried = `${esc.steps} composition${esc.steps === 1 ? "" : "s"} tried`;
    // A WALK IS NOT A PURCHASE. Most rooms that walk the ladder walk it and
    // come home: pickedNeedDeepBonus 0 means the wider bubbles were composed,
    // priced and REJECTED. Reporting that as "bought a wider wall" would put a
    // purchase on the caption of a room that bought nothing.
    bits.push(
      (esc.pickedNeedDeepBonus > 0
        ? `ESCALATED — bought a wider wall (+${esc.pickedNeedDeepBonus} deep-tile demand, ${tried})`
        : `WALKED THE LADDER — ${tried}, and the cheapest cut still won`) +
        (why.length ? ` because ${why.join(" and ")}` : ""),
    );
  }
  if (plan.shell) {
    bits.push(
      `${plan.shell.cut.length} cut tiles · ${plan.shell.upkeepPerTick} e/tick upkeep · ${plan.shell.deepTiles} deep tiles sealed in` +
        ` · controller ${plan.shell.enclosedController ? "inside" : "outside"}, sources ${plan.shell.enclosedSources}/${(plan.sources || []).length} inside`,
    );
  }
  if (bits.length) n.ramparts = bits.join(" — ");

  if (m.towers) {
    n.towers = `the weakest wall tile still takes ${m.towers.minShellDmg} damage a tick (${m.towers.avgShellDmg} average) · every tower refills within ${m.towers.maxRefill} steps`;
  }
  if (c.lab) n.labs = `${c.lab} labs — both inputs within range 2 of every output`;
  if (c.nuker) n.nuker = "300k energy and 5k ghodium have to be hauled here, so it hugs the hub";
  if (plan.mineral) n.extractor = `mineral at (${plan.mineral.x},${plan.mineral.y}) — the extractor is built on top of it`;
  if (m.extensions) {
    n.extensions =
      `${m.extensions.placed}/${m.extensions.target} placed · ${m.extensions.stubRoads} stub roads` +
      (m.extensions.corridorFallback
        ? ` · ${m.extensions.corridorFallback} placed road-blind (fallback)`
        : " · every one of them D4 on a road");
  }
  return n;
}

/**
 * Browser replay of the planner stages — dependency-free vanilla JS.
 *
 * SEVEN stacked canvases, bottom to top:
 *   terrain    drawn once
 *   scaffoldA  dt + distance fields  — dimmed once the plan starts landing
 *   scaffoldB  basin + core          — dimmed once the wall goes up
 *   under      ramparts
 *   roads      roads                 — ABOVE the ramparts and BELOW the
 *                                      structures, which is the order
 *                                      renderRoomSvg stacks them in
 *   cells      the structures themselves, as real Screeps sprites
 *   marks      sources / controller / mineral + transient FX
 *
 * WHY ROADS GOT THEIR OWN CANVAS. They used to share `under` with the
 * ramparts, which cost two things. First the stacking was backwards: the film
 * drew every road before the wall, so the wall painted over the roads, while
 * the gallery SVG draws ramparts first and roads on top. Second, and the
 * reason it had to change, layer 7's dead-end prune now ERASES road tiles in
 * the film (see roadProvenance in export-anim.mjs) — clearing a tile on a
 * shared canvas would take the rampart underneath it with it, and 4 pruned
 * tiles across the fleet do carry a rampart.
 *
 * THE FRAMES ARE NOT TOUCHED HERE. Steps come from anim/<room>.json exactly as
 * export-anim.mjs wrote them; this file only decides how a tile is DRAWN, how
 * fast, and what the banner says about it. The last frame is therefore the
 * shipped plan tile for tile, painted with the sprite stack render.mjs gives
 * the gallery.
 *
 * PACING IS PER TILE, NOT PER STEP. export-anim emits roads, ramparts and
 * extensions in chunks of 2-3 tiles because the payload has to fit inside a
 * 100KB memory segment — a packaging decision, not a storytelling one. The
 * player expands those chunks back into single placements, so the eye gets one
 * thing at a time and "step forward" means one structure rather than three.
 * Scaffolding steps (whole distance-transform bands, whole flood rings) stay
 * atomic: they are one idea each, and one of them is 300 tiles wide.
 */
function animPlayerHtml(plan) {
  const marks = JSON.stringify({
    sources: plan.sources || [],
    controller: plan.controller || null,
    mineral: plan.mineral || null,
    hub: plan.hub || null,
  });
  const sprites = JSON.stringify(animSprites());
  const claimKinds = JSON.stringify(animClaimKinds(plan));
  const battlements = JSON.stringify(
    (plan.shell?.battlements || []).map((b) => `${b.x},${b.y}`),
  );
  const notes = JSON.stringify(animNotes(plan));
  // NOTE: the player script uses string concat, never template literals —
  // this whole file is one big JS template literal already.
  return `<div class="card anim-card" id="anim"><h3>Animated plan — watch the planner build ${plan.room}</h3>
<div class="anim-wrap" id="animWrap">
  <canvas class="anim-layer" id="animTerrain"></canvas>
  <canvas class="anim-layer" id="animScaffA"></canvas>
  <canvas class="anim-layer" id="animScaffB"></canvas>
  <canvas class="anim-layer" id="animUnder"></canvas>
  <canvas class="anim-layer" id="animRoads"></canvas>
  <canvas class="anim-layer" id="animCells"></canvas>
  <canvas class="anim-layer" id="animMarks"></canvas>
  <div class="anim-title" id="animTitle"><div class="tt" id="animTitleName"></div><div class="te" id="animTitleWhy"></div></div>
</div>
<div class="anim-banner">
  <div class="ab-head">
    <span class="ab-badge" id="animBadge">Layer 1</span>
    <span class="ab-name" id="animName">&mdash;</span>
    <span class="ab-count" id="animCount">&mdash;</span>
  </div>
  <div class="ab-why" id="animWhy"></div>
  <div class="ab-note" id="animNote"></div>
</div>
<div class="anim-bar"><div class="anim-bar-fill" id="animBar"></div></div>
<div class="anim-ctl">
  <button id="animPrevStage" class="btn" title="back to the start of this layer (or the one before it)">&#8676;</button>
  <button id="animBack" class="btn" title="one placement back">&#9664;</button>
  <button id="animPlay" class="btn btn-wide">&#10074;&#10074; pause</button>
  <button id="animFwd" class="btn" title="one placement forward">&#9654;</button>
  <button id="animNextStage" class="btn" title="skip to the next layer">&#8677;</button>
  <button id="animRestart" class="btn" title="back to the first frame">&#8635;</button>
  <label class="trail"><input type="checkbox" id="animTrails" checked/>trails</label>
</div>
<div class="anim-ctl">
  <span class="spd-lab">speed</span>
  <input type="range" id="animSpeed" min="-2" max="3" step="0.25" value="0"/>
  <span class="spd-val" id="animSpeedVal">1&times;</span>
  <span class="rate" id="animRate"></span>
</div>
<div class="stages" id="animStages"></div>
<div class="anim-label" id="animLabel">loading anim/${plan.room}.json &hellip;</div>
</div>
<script>
(function () {
  var ROOM = ${JSON.stringify(plan.room)};
  var TERRAIN = ${JSON.stringify(plan.terrain)};
  var MARKS = ${marks};
  var SPR = ${sprites};
  var CLAIMK = ${claimKinds};
  // THE SITTER IS A TILE THE PLAN RESERVES, NOT A STRUCTURE IT BUILDS. It is
  // passed by coordinate rather than inferred from the claims palette, because
  // a colour is not an identity — see paintSitter for what goes wrong when the
  // player treats it as one.
  var SITTER = ${JSON.stringify(plan.sitter || null)};
  var BATTL = ${battlements};
  var NOTES = ${notes};
  var RP = ${JSON.stringify(ROAD_PAINT)};
  var MP = ${JSON.stringify(RAMPART_PAINT)};

  var CELL = 15, N = 50, W = CELL * N;
  // TILES PER SECOND at 1x, before the per-stage multiplier in meta.stageRates.
  // The building stages sit on rates 0.4-1.5, so the structures land at roughly
  // 1.3-4.8 tiles/sec — slow enough to follow a single extension with your eye.
  var TILE_RATE = 3.2;
  var HOLD_MS = 3600;          // dwell on the finished plan before looping
  var LAYER_PAUSE_MS = 1100;   // beat between layers, so the cut is legible
  var TITLE_HOLD = 900, TITLE_FADE = 900;

  var BATT = {};
  for (var bi = 0; bi < BATTL.length; bi++) BATT[BATTL[bi]] = 1;

  // stage -> [layer number, plain name, one-line WHY, counted noun, chip]
  var STAGE_INFO = {
    dt:         [1, 'reading the room', 'how far every tile sits from the nearest wall — the wide-open ground is where a base can fit', 'tiles', '1 · dt'],
    fields:     [1, 'walking distances', 'flood out from every source and the controller: how many steps does a hauler pay from here?', 'tiles', '1 · fields'],
    seed:       [1, 'the seed', 'the single tile with the cheapest total walk to everything the room earns from', 'tile', '1 · seed'],
    basin:      [1, 'the basin', 'grow out from the seed, cheapest walk first — is there actually room here?', 'tiles', '1 · basin'],
    core:       [1, 'the core pocket', 'the open pocket the hub trio has to fit inside', 'tiles', '1 · core'],
    claims:     [1, 'the hub', 'storage, terminal, link, spawns and miner seats — one deliberate tile at a time', 'tiles', '1 · hub'],
    roads:      [1, 'the eco roads', 'one connected web: hub to spawns to sources to controller — this is the ONLY road set that exists before the wall', 'tiles', '1 · roads'],
    ramparts:   [2, 'the wall', 'the cheapest rampart line that seals the base (distance-weighted min-cut)', 'ramparts', '2 · wall'],
    towers:     [3, 'towers', 'set-cover the wall so no rampart tile is out of tower range', 'towers', '3 · towers'],
    roadsTwr:   [3, 'tower spurs', 'the refill road to each tower, laid by the same pass that placed it', 'tiles', '3 · spurs'],
    labs:       [4, 'labs', 'the one stamp worth keeping — a diamond where every reagent pair is in reach', 'labs', '4 · labs'],
    roadsLab:   [4, 'lab access', 'paved AFTER the diamond: the anchor scan rejects a lab site that touches an existing road, so this road cannot be on screen while the labs are chosen', 'tiles', '4 · lab road'],
    nuker:      [5, 'the nuker', 'one deep tile hugging the hub, because everything it eats has to be carried', 'nuker', '5 · nuker'],
    observer:   [5, 'the observer', 'needs no access at all, so it takes the far leftover tile', 'observer', '5 · observer'],
    extractor:  [5, 'the extractor', 'the one structure built ON a room object — it sits on the mineral', 'extractor', '5 · extractor'],
    roadsMisc:  [5, 'the mineral run', 'the haul road out to the mineral seat', 'tiles', '5 · mineral road'],
    roadsExt:   [6, 'extension corridors', 'dig the corridor first — every extension has to land with a D4 face on a road', 'tiles', '6 · corridors'],
    extensions: [6, 'extensions', 'growing corridors into deep, safe floor — 60 of them, every one on a road face', 'extensions', '6 · extensions'],
    roadsPrune: [7, 'the dead-end prune', 'the one pass allowed to DELETE an earlier layer\\'s road — these led somewhere before the later layers filled it in', 'tiles', '7 · prune'],
    roadsLate:  [7, 'rampart spurs', 'roads TO the wall so defenders can reach it, plus the extension-face safety net', 'tiles', '7 · spurs'],
    roadsResid: [0, 'unattributed roads', 'these tiles carry no meta.roadLayer entry — the film will not guess which layer laid them', 'tiles', '? · unattributed']
  };
  function info(stage) {
    return STAGE_INFO[stage] ||
      [0, String(stage).replace(/_/g, ' '), '', 'steps', String(stage)];
  }

  // stage -> what a tile of it IS. '#road' / '#rampart' / '#unroad' / '#sitter'
  // are hand-painted (no sprite exists for any of them); claims is
  // heterogeneous and uses CLAIMK instead. SIX road stages, one per pipeline
  // layer that lays road, plus the layer-7 prune which UNPAINTS.
  var STAGE_KIND = {
    roads: '#road', roadsTwr: '#road', roadsLab: '#road', roadsMisc: '#road',
    roadsExt: '#road', roadsLate: '#road', roadsResid: '#road',
    roadsPrune: '#unroad',
    ramparts: '#rampart', towers: 'tower', labs: 'lab',
    nuker: 'nuker', observer: 'observer', extractor: 'extractor',
    extensions: 'extension'
  };
  // stages whose steps are expanded back into ONE PLACEMENT PER TILE
  var EXPAND = {
    claims: 1, roads: 1, roadsTwr: 1, roadsLab: 1, roadsMisc: 1, roadsExt: 1,
    roadsPrune: 1, roadsLate: 1, roadsResid: 1,
    ramparts: 1, towers: 1, labs: 1,
    nuker: 1, observer: 1, extractor: 1, extensions: 1
  };
  // scaffold stages that live on the LATE scaffold canvas (dimmed at the wall)
  var SCAFF_LATE = { basin: 1, core: 1 };
  var TOWER_RANGE = 5;

  var now = (window.performance && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };

  var dpr = Math.min(2, window.devicePixelRatio || 1);
  function ctx2d(id) {
    var c = document.getElementById(id);
    c.width = W * dpr; c.height = W * dpr;
    c.style.width = W + 'px'; c.style.height = W + 'px';
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }
  var elScaffA = document.getElementById('animScaffA');
  var elScaffB = document.getElementById('animScaffB');
  var gT = ctx2d('animTerrain'), gA = ctx2d('animScaffA'), gB = ctx2d('animScaffB'),
      gU = ctx2d('animUnder'), gR = ctx2d('animRoads'), gC = ctx2d('animCells'),
      gM = ctx2d('animMarks');
  var rr = typeof gC.roundRect === 'function';

  // --- terrain (once) ---
  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x++) {
      var t = TERRAIN.charCodeAt(y * N + x) - 48;
      gT.fillStyle = (t & 1) ? '#0e0e0e' : (t & 2) ? '#16301a' : '#2c2c24';
      gT.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
  gT.strokeStyle = 'rgba(0,0,0,0.28)'; gT.lineWidth = 0.5;
  for (var i = 0; i <= N; i++) {
    gT.beginPath(); gT.moveTo(i * CELL, 0); gT.lineTo(i * CELL, W); gT.stroke();
    gT.beginPath(); gT.moveTo(0, i * CELL); gT.lineTo(W, i * CELL); gT.stroke();
  }

  // --- sprites: rasterise each gallery icon stack into one tile-sized canvas --
  // Composing once up front means a 300-placement rewind is 300 blits instead
  // of 600 SVG rasterisations, and it keeps the layer ORDER (border under body)
  // even though the images resolve out of order.
  var SPRITE = {};
  function loadSprites(cb) {
    var jobs = [], k, j;
    for (k in SPR) for (j = 0; j < SPR[k].length; j++) jobs.push([k, j, SPR[k][j].u]);
    if (!jobs.length) return cb();
    var left = jobs.length, imgs = {};
    function done() { if (--left === 0) { compose(imgs); cb(); } }
    for (var i = 0; i < jobs.length; i++) {
      (function (job) {
        var im = new Image();
        im.onload = function () { imgs[job[0] + '#' + job[1]] = im; done(); };
        im.onerror = done;
        im.src = job[2];
      })(jobs[i]);
    }
  }
  function compose(imgs) {
    var R = Math.max(24, Math.round(CELL * dpr * 2)); // 2x supersample, then blit down
    for (var k in SPR) {
      var off = document.createElement('canvas');
      off.width = R; off.height = R;
      var g = off.getContext('2d'), drew = 0;
      for (var j = 0; j < SPR[k].length; j++) {
        var im = imgs[k + '#' + j];
        if (!im) continue;
        var sc = SPR[k][j].s, pad = R * (1 - sc) / 2, sz = R * sc;
        try { g.drawImage(im, pad, pad, sz, sz); drew++; } catch (e) { /* unusable asset */ }
      }
      if (drew) SPRITE[k] = off;
    }
  }

  // --- tile painters (the gallery's own paint, shared via render.mjs) --------
  function paintRect(g, x, y, hex) {
    g.fillStyle = hex;
    var px = x * CELL + 1, py = y * CELL + 1, w = CELL - 2;
    if (rr) { g.beginPath(); g.roundRect(px, py, w, w, 2.5); g.fill(); }
    else g.fillRect(px, py, w, w);
  }
  function paintRoad(g, x, y) {
    g.fillStyle = RP.base;
    g.fillRect(x * CELL, y * CELL, CELL, CELL);
    g.fillStyle = RP.top;
    g.fillRect(x * CELL + CELL * RP.inset, y * CELL + CELL * RP.inset,
               CELL * RP.size, CELL * RP.size);
  }
  function paintRampart(g, x, y) {
    var hot = BATT[x + ',' + y] === 1;
    var px = x * CELL + MP.inset, py = y * CELL + MP.inset, w = CELL - 2 * MP.inset;
    g.save();
    g.beginPath();
    if (rr) g.roundRect(px, py, w, w, CELL * MP.radius); else g.rect(px, py, w, w);
    g.globalAlpha = hot ? MP.hotFillOpacity : MP.fillOpacity;
    g.fillStyle = MP.fill; g.fill();
    g.globalAlpha = MP.strokeOpacity;
    g.strokeStyle = MP.stroke;
    g.lineWidth = hot ? MP.hotStrokeWidth : MP.strokeWidth;
    g.stroke();
    g.restore();
  }
  /**
   * THE SITTER IS NOT A STRUCTURE, SO IT MAY NOT PAINT LIKE ONE.
   *
   * The claims stage emits the sitter tile as a white cell. It has no entry in
   * CLAIMK (there is no structure there — that is the entire point of the
   * tile), so it fell through paintTile to paintRect, which fills opaquely
   * with no globalAlpha. Nothing about that is visible until you notice WHERE
   * the sitter goes: it is the tile the hub trio all touch, and in most rooms
   * the hub roads run straight through it. E17S4 40,34 and E2S7 22,26 are
   * roads in the shipped plan and were solid white squares in the last frame
   * of the film — while the HUD underneath asserted "this last frame IS the
   * shipped plan, tile for tile". One tile per room, forever, on the one
   * claim the film makes about its own fidelity.
   *
   * Rejected: dropping the sitter beat entirely. It is a real decision the hub
   * layer makes and it deserves its second on screen. Rejected: painting it on
   * the marks canvas, which is cleared and redrawn every frame — the sitter
   * would then be the one placement that a rewind could not take back.
   *
   * So it is drawn as a MARK rather than a fill: a dashed white ring inset
   * into the tile over a 12%-alpha wash. The road underneath reads through it,
   * the tile still reads as claimed, and the last frame matches the plan.
   */
  function paintSitter(g, x, y) {
    var px = x * CELL + 2.5, py = y * CELL + 2.5, w = CELL - 5;
    g.save();
    g.globalAlpha = 0.12;
    g.fillStyle = '#ffffff';
    g.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    g.globalAlpha = 0.95;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.2;
    if (g.setLineDash) g.setLineDash([2.5, 2]);
    g.strokeRect(px, py, w, w);
    g.restore();
  }
  /** layer 7's prune: the tile had a road, and now it does not */
  function unpaintRoad(g, x, y) {
    g.clearRect(x * CELL, y * CELL, CELL, CELL);
  }
  function kindFor(stage, x, y) {
    if (stage === 'claims') {
      var ck = CLAIMK[x + ',' + y];
      if (ck) return ck;
      if (SITTER && x === SITTER.x && y === SITTER.y) return '#sitter';
      return null;
    }
    return STAGE_KIND[stage] || null;
  }
  function paintTile(g, stage, x, y, hex) {
    var k = kindFor(stage, x, y);
    if (k === '#road') { paintRoad(g, x, y); return; }
    if (k === '#unroad') { unpaintRoad(g, x, y); return; }
    if (k === '#rampart') { paintRampart(g, x, y); return; }
    if (k === '#sitter') { paintSitter(g, x, y); return; }
    if (k && SPRITE[k]) { g.drawImage(SPRITE[k], x * CELL, y * CELL, CELL, CELL); return; }
    paintRect(g, x, y, hex);   // scaffolding, and anything unmapped
  }

  // --- markers + transient FX ----------------------------------------------
  var cursor = null;
  function disc(p, fill) {
    gM.beginPath();
    gM.arc(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, CELL * 0.42, 0, 6.2832);
    gM.fillStyle = fill; gM.fill();
  }
  function mark(p, kind, fill) {
    if (!p) return;
    disc(p, fill);
    if (SPRITE[kind]) gM.drawImage(SPRITE[kind], p.x * CELL, p.y * CELL, CELL, CELL);
  }
  function drawMarks() {
    gM.clearRect(0, 0, W, W);
    for (var s = 0; s < MARKS.sources.length; s++) mark(MARKS.sources[s], 'source', 'rgba(255,225,77,0.30)');
    mark(MARKS.controller, 'controller', 'rgba(102,204,255,0.30)');
    mark(MARKS.mineral, 'mineral', 'rgba(224,166,255,0.30)');
    if (MARKS.hub) {
      gM.beginPath();
      gM.arc(MARKS.hub.x * CELL + CELL / 2, MARKS.hub.y * CELL + CELL / 2, CELL * 0.5, 0, 6.2832);
      gM.lineWidth = 1.6; gM.strokeStyle = '#00E676'; gM.stroke();
    }
    // the eye needs somewhere to be between placements — this is where the
    // planner's hand is resting right now
    if (cursor) {
      gM.save();
      gM.strokeStyle = '#fff'; gM.globalAlpha = 0.9; gM.lineWidth = 1.6;
      if (gM.setLineDash) gM.setLineDash([3, 3]);
      gM.strokeRect(cursor.x * CELL - 1.5, cursor.y * CELL - 1.5, CELL + 3, CELL + 3);
      gM.restore();
    }
  }

  var fx = [], fxDirty = false;
  function addPulse(x, y, hex) { fx.push({ k: 0, x: x, y: y, c: hex, t0: now(), life: 620 }); }
  function addRange(x, y, r) { fx.push({ k: 1, x: x, y: y, r: r, c: '#ff8844', t0: now(), life: 1200 }); }
  function addTrail(x, y, hex) { fx.push({ k: 2, x: x, y: y, c: hex, t0: now(), life: 2600 }); }
  function drawFx(t) {
    if (!fx.length) {
      if (fxDirty) { drawMarks(); fxDirty = false; }
      return;
    }
    drawMarks();
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i], a = (t - f.t0) / f.life;
      if (a >= 1) { fx.splice(i, 1); continue; }
      if (a < 0) a = 0;
      var cx = f.x * CELL + CELL / 2, cy = f.y * CELL + CELL / 2;
      gM.save();
      if (f.k === 0) {
        var e = 1 - Math.pow(1 - a, 3);          // ease-out expansion
        gM.strokeStyle = f.c;
        gM.globalAlpha = 1 - a;
        gM.lineWidth = 3.2 * (1 - a) + 0.5;
        gM.beginPath(); gM.arc(cx, cy, CELL * (0.45 + 3.0 * e), 0, 6.2832); gM.stroke();
        gM.globalAlpha = (1 - a) * 0.55;
        gM.beginPath(); gM.arc(cx, cy, CELL * (0.45 + 1.5 * e), 0, 6.2832); gM.stroke();
      } else if (f.k === 1) {
        var sx = (f.x - f.r) * CELL, sy = (f.y - f.r) * CELL, sw = (2 * f.r + 1) * CELL;
        gM.strokeStyle = f.c; gM.lineWidth = 1.6;
        if (gM.setLineDash) gM.setLineDash([5, 4]);
        gM.globalAlpha = (1 - a) * 0.9;
        gM.strokeRect(sx, sy, sw, sw);
        gM.globalAlpha = (1 - a) * 0.10;
        gM.fillStyle = f.c; gM.fillRect(sx, sy, sw, sw);
      } else {
        gM.globalAlpha = (1 - a) * 0.5;
        gM.fillStyle = f.c;
        gM.fillRect(f.x * CELL + 2, f.y * CELL + 2, CELL - 4, CELL - 4);
      }
      gM.restore();
    }
    fxDirty = true;
  }

  // --- title cards ----------------------------------------------------------
  var elTitle = document.getElementById('animTitle');
  var elTName = document.getElementById('animTitleName');
  var elTWhy = document.getElementById('animTitleWhy');
  var titleT0 = 0, titleOn = false;
  function showTitle(stage) {
    var txt;
    if (stage === '__done') txt = ['PLAN COMPLETE', ROOM + ' · ' + plc.length + ' placements'];
    else {
      var inf = info(stage);
      txt = [(inf[0] ? 'LAYER ' + inf[0] + ' — ' : '') + inf[1].toUpperCase(), inf[2] || ''];
    }
    elTName.textContent = txt[0];
    elTWhy.textContent = txt[1];
    titleT0 = now(); titleOn = true;
    tickTitle(titleT0);
  }
  function tickTitle(t) {
    if (!titleOn) return;
    var age = t - titleT0;
    var o = age < TITLE_HOLD ? Math.min(1, 0.12 + age / 150) : 1 - (age - TITLE_HOLD) / TITLE_FADE;
    if (age >= TITLE_HOLD + TITLE_FADE) { titleOn = false; o = 0; }
    else if (o < 0) o = 0;
    elTitle.style.opacity = o;
    elTitle.style.transform = 'scale(' + (1.05 - 0.05 * Math.min(1, age / 420)) + ')';
  }

  // --- playback -------------------------------------------------------------
  var steps = null, palette = [], plc = [], idx = 0, acc = 0, last = 0;
  var holdUntil = 0, pauseUntil = 0, playing = true, speed = 1, trails = true;
  var stageStart = {}, stageTiles = {}, tileRun = [], stageOrder = [], curStage = null;
  var rates = {}, scaff = {}, fadeAAt = Infinity, fadeBAt = Infinity;
  var elPlay = document.getElementById('animPlay');
  var elCount = document.getElementById('animCount');
  var elLabel = document.getElementById('animLabel');
  var elStages = document.getElementById('animStages');
  var elBar = document.getElementById('animBar');
  var elBadge = document.getElementById('animBadge');
  var elName = document.getElementById('animName');
  var elWhy = document.getElementById('animWhy');
  var elNote = document.getElementById('animNote');
  var elSpeed = document.getElementById('animSpeed');
  var elSpeedVal = document.getElementById('animSpeedVal');
  var elRate = document.getElementById('animRate');
  var elTrails = document.getElementById('animTrails');

  /**
   * Roads and ramparts go UNDER the structures, exactly as the gallery stacks
   * them — ramparts on gU, roads on gR above it, structures on gC above that.
   * The road stages are recognised by STAGE_KIND rather than by a name list,
   * so adding a seventh road stage cannot silently put it on the wrong canvas
   * (which, for the erase stage, would clear the ramparts).
   */
  function isRoadStage(stage) {
    var k = STAGE_KIND[stage];
    return k === '#road' || k === '#unroad';
  }
  function ctxFor(stage) {
    if (isRoadStage(stage)) return gR;
    if (stage === 'ramparts') return gU;
    if (!scaff[stage]) return gC;
    return SCAFF_LATE[stage] ? gB : gA;
  }
  function rateOf(stage) {
    var r = rates[stage];
    return (r > 0) ? r : 1;
  }
  function drawPlacement(p) {
    var st = steps[p.s], g = ctxFor(st.stage), c = st.cells, i;
    if (p.o < 0) {
      for (i = 0; i < c.length; i += 3) paintTile(g, st.stage, c[i], c[i + 1], palette[c[i + 2]]);
    } else {
      paintTile(g, st.stage, c[p.o], c[p.o + 1], palette[c[p.o + 2]]);
    }
  }
  function clearCells() {
    gA.clearRect(0, 0, W, W); gB.clearRect(0, 0, W, W);
    gU.clearRect(0, 0, W, W); gR.clearRect(0, 0, W, W);
    gC.clearRect(0, 0, W, W);
  }
  /** the thinking layers recede as the real base lands on top of them */
  function applyFades(i) {
    elScaffA.style.opacity = i >= fadeBAt ? 0.14 : (i >= fadeAAt ? 0.25 : 1);
    elScaffB.style.opacity = i >= fadeBAt ? 0.25 : 1;
  }

  function seek(to) {
    if (to < 0) to = 0;
    if (to > plc.length) to = plc.length;
    clearCells();
    fx.length = 0; fxDirty = true;
    for (var i = 0; i < to; i++) drawPlacement(plc[i]);
    idx = to; acc = 0; holdUntil = 0; pauseUntil = 0;
    cursor = to > 0 ? tileOf(plc[to - 1]) : null;
    applyFades(idx);
    if (!plc.length) return;   // no steps: nothing to title, nothing to count
    curStage = steps[plc[Math.min(idx, plc.length - 1)].s].stage;
    // THE END OF THE FILM IS A PLACE YOU CAN ARRIVE AT TWO WAYS.
    //
    // showTitle('__done') used to fire only from the play loop, at the moment
    // idx crossed plc.length. Drag the scrubber to the end, or press
    // "next stage" on the last stage, and you landed on the identical final
    // frame with "LAYER 6 — EXTENSIONS" over it — the card claiming the film
    // was still mid-extension while the finished plan sat underneath. The
    // completion card belongs to the STATE, not to the route taken to it.
    showTitle(idx >= plc.length ? '__done' : curStage);
    drawMarks();
    hud();
  }
  function tileOf(p) {
    var c = steps[p.s].cells, o = p.o < 0 ? 0 : p.o;
    return { x: c[o], y: c[o + 1] };
  }

  function advance() {
    var p = plc[idx], st = steps[p.s];
    drawPlacement(p);
    if (p.o >= 0) {
      var x = st.cells[p.o], yy = st.cells[p.o + 1], hex = palette[st.cells[p.o + 2]] || '#ffffff';
      cursor = { x: x, y: yy };
      addPulse(x, yy, hex);
      if (trails) addTrail(x, yy, hex);
      if (st.stage === 'towers') addRange(x, yy, TOWER_RANGE);
    } else {
      cursor = null;
    }
    idx++;
    applyFades(idx);
    drawMarks();
  }

  function hud() {
    var done = idx >= plc.length;
    var i = Math.min(idx, plc.length);
    var cur = plc[Math.min(idx, plc.length - 1)];
    var active = done ? stageOrder[stageOrder.length - 1] : steps[cur.s].stage;
    var inf = info(active);
    var tiles = done ? stageTiles[active] : (i > stageStart[active] ? tileRun[i - 1] : 0);
    elBadge.textContent = inf[0] ? 'Layer ' + inf[0] : 'stage';
    elName.textContent = inf[1];
    elWhy.textContent = inf[2] || '';
    elNote.textContent = NOTES[active] || '';
    elCount.textContent = tiles + ' / ' + stageTiles[active] + ' ' + inf[3];
    elLabel.textContent = done
      ? 'plan complete — this last frame IS the shipped plan, tile for tile'
      : steps[cur.s].label;
    elBar.style.width = (100 * i / plc.length) + '%';
    // the scaffolding stages are paced a WHOLE BAND at a time, so "tiles/sec"
    // would be a lie there by two orders of magnitude
    elRate.textContent = '≈ ' + (TILE_RATE * rateOf(active) * speed).toFixed(1) +
      (EXPAND[active] ? ' tiles/sec here' : ' bands/sec here');
    var kids = elStages.children;
    for (var k = 0; k < kids.length; k++) {
      var sg = kids[k].getAttribute('data-stage');
      kids[k].className = 'stage' + (sg === active ? ' on'
        : (stageOrder.indexOf(sg) < stageOrder.indexOf(active) ? ' past' : ''));
    }
  }

  function frame(t) {
    requestAnimationFrame(frame);
    drawFx(t);
    tickTitle(t);
    if (!steps) return;
    if (!last) last = t;
    var dt = (t - last) / 1000; last = t;
    if (dt > 0.5) dt = 0.5;
    if (!playing) return;
    if (idx >= plc.length) {
      if (!holdUntil) holdUntil = t + HOLD_MS;
      else if (t >= holdUntil) { holdUntil = 0; seek(0); }
      return;
    }
    if (pauseUntil) {
      if (t < pauseUntil) return;
      pauseUntil = 0;
    }
    // budget in SECONDS: a placement costs 1/(TILE_RATE * stageRate), so a
    // stage rate of 5 skims and a rate of 0.4 dwells on every single tile.
    acc += dt * speed;
    var moved = false, guard = 0;
    while (idx < plc.length) {
      var sg = steps[plc[idx].s].stage;
      if (sg !== curStage) {
        // BEAT BETWEEN LAYERS. The cut used to happen mid-stride and the eye
        // never registered that the subject had changed.
        curStage = sg; showTitle(sg); hud();
        pauseUntil = t + LAYER_PAUSE_MS / Math.max(0.5, speed);
        acc = 0;
        return;
      }
      var cost = 1 / (TILE_RATE * rateOf(sg));
      if (acc < cost) break;
      acc -= cost; advance(); moved = true;
      if (++guard > 400) { acc = 0; break; }
    }
    if (moved) {
      hud();
      if (idx >= plc.length) showTitle('__done');
    }
  }

  function setPlaying(v) {
    playing = v;
    elPlay.innerHTML = playing ? '&#10074;&#10074; pause' : '&#9654; play';
  }
  function stageOf(i) { return steps[plc[Math.min(i, plc.length - 1)].s].stage; }

  elPlay.onclick = function () { setPlaying(!playing); };
  document.getElementById('animRestart').onclick = function () { seek(0); };
  document.getElementById('animFwd').onclick = function () {
    setPlaying(false);
    if (idx < plc.length) { curStage = stageOf(idx); advance(); hud(); }
  };
  document.getElementById('animBack').onclick = function () {
    setPlaying(false); seek(idx - 1);
  };
  document.getElementById('animNextStage').onclick = function () {
    var here = stageOrder.indexOf(stageOf(idx >= plc.length ? plc.length - 1 : idx));
    var nxt = here + 1;
    while (nxt < stageOrder.length && stageStart[stageOrder[nxt]] <= idx) nxt++;
    seek(nxt < stageOrder.length ? stageStart[stageOrder[nxt]] : plc.length);
  };
  document.getElementById('animPrevStage').onclick = function () {
    var here = stageOrder.indexOf(stageOf(Math.min(idx, plc.length - 1)));
    var top = stageStart[stageOrder[here]];
    // rewind to the top of THIS layer first; a second press goes back one more
    seek(idx > top + 1 ? top : (here > 0 ? stageStart[stageOrder[here - 1]] : 0));
  };
  elSpeed.oninput = function () {
    speed = Math.pow(2, parseFloat(elSpeed.value));
    elSpeedVal.innerHTML = (speed < 1 ? speed.toFixed(2).replace(/0+$/, '') : speed.toFixed(2).replace(/\\.?0+$/, '')) + '&times;';
    if (steps) hud();
  };
  elTrails.onchange = function () { trails = elTrails.checked; };

  loadSprites(function () {
    drawMarks();
    fetch('anim/' + ROOM + '.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (a) {
        steps = a.steps;
        palette = [];
        for (var k in a.palette) palette[+k] = a.palette[k];
        // meta is optional — without it every stage runs at 1x on one cell layer
        var meta = a.meta || {};
        rates = meta.stageRates || {};
        scaff = meta.stageScaffold || {};

        // EXPAND THE CHUNKS. export-anim packs 2-3 tiles per step to fit a
        // memory segment; that is packaging, and the film should not inherit it.
        for (var i = 0; i < steps.length; i++) {
          var st = steps[i];
          if (EXPAND[st.stage]) {
            for (var o = 0; o < st.cells.length; o += 3) plc.push({ s: i, o: o, n: 1 });
          } else {
            plc.push({ s: i, o: -1, n: st.cells.length / 3 });
          }
        }
        for (var j = 0; j < plc.length; j++) {
          var sg = steps[plc[j].s].stage;
          if (!(sg in stageStart)) { stageStart[sg] = j; stageOrder.push(sg); stageTiles[sg] = 0; }
          stageTiles[sg] += plc[j].n;
          tileRun[j] = stageTiles[sg];
        }
        // dt+fields recede once real tiles get claimed; basin+core at the wall
        fadeAAt = stageStart.claims !== undefined ? stageStart.claims
          : (stageStart.roads !== undefined ? stageStart.roads : Infinity);
        fadeBAt = stageStart.ramparts !== undefined ? stageStart.ramparts
          : (stageStart.towers !== undefined ? stageStart.towers : Infinity);
        for (var q = 0; q < stageOrder.length; q++) {
          var b = document.createElement('button');
          var inf = info(stageOrder[q]);
          b.className = 'stage'; b.textContent = inf[4];
          b.setAttribute('data-stage', stageOrder[q]);
          b.setAttribute('title', inf[1] + ' — ' + inf[2]);
          b.onclick = (function (name) {
            return function () { seek(stageStart[name]); };
          })(stageOrder[q]);
          elStages.appendChild(b);
        }
        seek(0);
        requestAnimationFrame(frame);
      })
      .catch(function (e) {
        elLabel.textContent = 'no animation for ' + ROOM + ' (' + e.message +
          ') — run: node tools/plan-suite/v2/export-anim.mjs --all';
      });
  });
})();
</script>`;
}

/** the only escape in this file — details are prose written by the layers */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** the target the as-built gated lap is judged against (layer-shell MOBILITY_TARGET) */
const MOBILITY_TARGET = 1.2;
/** pairs whose absolute detour is at or below this many tiles are not judged */
const MOBILITY_DETOUR_FLOOR = 4;

/** the as-built gated lap — the number that decides, not the shell's mass-free one */
function builtGated(plan) {
  const v = plan?.meta?.walls?.mobility?.builtGated;
  return typeof v === "number" ? v : null;
}
function mobilityOver(plan) {
  const v = builtGated(plan);
  return v !== null && v > MOBILITY_TARGET;
}

/**
 * DECLARED SHORTFALLS, rendered in full. A room that met every gate says so
 * out loud — omitting the section for the clean rooms is the same hiding bug
 * one level up, because then an empty page is indistinguishable from a page
 * that never had the section at all.
 */
function shortfallsHtml(plan) {
  const list = plan.meta?.shortfalls || [];
  if (!list.length) {
    return `<div class="card sf-card"><h3>Declared shortfalls</h3>
<p class="sf-none">No declared shortfalls — this room met every gate it was measured against.</p></div>`;
  }
  const items = list
    .map((s) => {
      const tag = [s.gate, s.kind, s.source].filter(Boolean).map(esc).join(" · ");
      const tiles = (s.tiles || []).length
        ? `<div class="sf-tiles">tiles: ${s.tiles.map((t) => `${t.x},${t.y}`).join(" · ")}</div>`
        : "";
      return `<div class="sf-item"><div class="sf-gate">${tag || "(untagged gate)"}</div>
<div class="sf-detail">${esc(s.detail)}</div>${tiles}</div>`;
    })
    .join("\n");
  return `<div class="card sf-card"><h3>Declared shortfalls · ${list.length}</h3>
<p class="sf-lead">Every gate this plan knowingly failed, in the layer's own words. Nothing here is a crash — it is a
measured miss the planner chose to publish rather than paper over.</p>
${items}</div>`;
}

/**
 * PLANNER NOTES — THE CHANNEL THE GALLERY WAS THROWING AWAY.
 *
 * `meta.notes` is the planner's observation channel: layers write into it when
 * they have measured something about the room that a reader needs in order to
 * judge the plan, but which excuses nothing. 79 of the 159 rooms carry at least
 * one. Not one of them was rendered anywhere. E8S5's page printed "Declared
 * shortfalls · 3" and said nothing at all about its own
 * "SEALED INTERIOR FLOOR: 2 tile(s) ... (24,35 24,36)" note — the strings
 * SEALED, 24,35 and 24,36 appeared zero times in E8S5.html, and neither SEALED
 * nor SHALLOW EXTENSIONS appeared anywhere in the index. validate.mjs read
 * meta.notes and printed them; the gallery, which is the artifact anyone
 * actually opens, did not. "Every shortfall must be loud and explained" is not
 * a claim a page can make while dropping half of what the planner said.
 *
 * WHY THIS IS A SEPARATE CARD AND NOT MORE ROWS IN THE SHORTFALL CARD. The two
 * channels mean opposite things to a reviewer, and the validator treats them as
 * opposites: a SHORTFALL is a declaration that turns a would-be FAIL into a
 * pass, and a NOTE excuses nothing and is printed regardless. Merging them
 * would let a note read as an excuse, which is precisely the laundering the
 * declaration channel exists to make visible. Different card, different colour,
 * different lead paragraph, and each says in words which of the two it is.
 *
 * Notes are pre-composed prose from the layers, so they are escaped and printed
 * verbatim; the gallery does not get to summarise a measurement it did not make.
 */
function notesHtml(plan) {
  const list = (plan.meta?.notes || []).filter((n) => typeof n === "string" && n.length);
  if (!list.length) {
    return `<div class="card nt-card"><h3>Planner notes</h3>
<p class="nt-none">No notes — no layer had an observation to record about this room.</p></div>`;
  }
  const items = list
    .map((n) => {
      // layers write "TOPIC: sentence." — split the shouted topic into its own
      // line when there is one, and leave the note alone when there is not
      const m = /^([A-Z][A-Z0-9 \-/]{3,60}):\s*([\s\S]+)$/.exec(n);
      const topic = m ? `<div class="nt-topic">${esc(m[1])}</div>` : "";
      return `<div class="nt-item">${topic}<div class="nt-detail">${esc(m ? m[2] : n)}</div></div>`;
    })
    .join("\n");
  return `<div class="card nt-card"><h3>Planner notes · ${list.length}</h3>
<p class="nt-lead">Observations the layers recorded about this room. <b>A note is not a shortfall.</b> It excuses
nothing and it is not attached to a gate — nothing above passes because of anything below. These are measurements the
planner thought a reader would need in order to judge the plan, printed whether or not the room met every gate.</p>
${items}</div>`;
}

/** the defender-mobility row: as-built gated lap first, shell reading demoted */
/**
 * "ROADS TO THE RAMPARTS, NEVER ON THEM" — AND THE TWO PLACES IT IS NOT TRUE.
 *
 * The doctrine line was printed flat, next to a plan that stacks a road on a
 * rampart in almost every room. Both cases are deliberate and neither is a spur:
 *
 *   CROSSINGS  an eco road to a source or controller the cut could not afford to
 *              enclose has to pass THROUGH the wall line. There is no route
 *              around a closed loop; the alternative is not paving to the source.
 *   BUBBLE SEATS  a miner's container outside the shell carries its own personal
 *              rampart, and the seat is on the hauling road because it IS the
 *              hauling road's destination. Fleet-wide that is 27 tiles.
 *
 * Printed from the plan rather than asserted, so the exception cannot drift away
 * from the thing it is excusing.
 */
function roadOnRampartNote(plan) {
  const roads = new Set((plan.structures.road || []).map((r) => `${r.x},${r.y}`));
  const cut = new Set((plan.shell?.cut || []).map((c) => `${c.x},${c.y}`));
  const containers = new Set((plan.structures.container || []).map((c) => `${c.x},${c.y}`));
  let cross = 0;
  let seat = 0;
  for (const r of plan.structures.rampart || []) {
    const k = `${r.x},${r.y}`;
    if (!roads.has(k)) continue;
    if (cut.has(k)) cross++;
    else if (containers.has(k)) seat++;
    else cross++;
  }
  if (!cross && !seat) return "";
  const bits = [];
  if (cross) bits.push(`${cross} wall CROSSING${cross === 1 ? "" : "s"} (an eco road to an unenclosed source or controller has to pass through the loop)`);
  if (seat) bits.push(`${seat} bubble SEAT${seat === 1 ? "" : "S"} (a miner's container outside the shell wears its own rampart and sits on the hauling road by design)`);
  return ` — except ${bits.join(" and ")}`;
}

function mobilityCell(plan) {
  const mob = plan.meta?.walls?.mobility;
  const bg = builtGated(plan);
  if (!mob || bg === null) return "—";
  const over = bg > MOBILITY_TARGET;
  const shell = plan.shell
    ? `shell ungated record ${plan.shell.mobility.max} max · ${plan.shell.mobility.mean} mean`
    : "shell ungated record —";
  const floorGated = typeof mob.floorGated === "number" ? mob.floorGated : "—";
  return `<span class="mob-main${over ? " mob-over" : ""}">${bg}</span> <span class="mob-lab">as-built gated lap</span>` +
    (over ? ` <span class="mob-badge">over target ${MOBILITY_TARGET}</span>` : ` <span class="mob-ok">within target</span>`) +
    `<div class="mob-sub">mass-free: ${floorGated} bare-terrain gated · ${shell}</div>`;
}

function roomPage(plan) {
  const m = plan.meta?.counts || {};
  const full = renderRoomSvg(plan, 20);
  const zoom = renderRoomSvg(plan, 36, hubCrop(plan, 5));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${plan.room} hub v2</title>
<style>
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e8e8e8;margin:18px}
h1{margin:0 0 6px} .sub{color:#9ab;line-height:1.5;max-width:1100px}
.ok{color:#6f6} a{color:#6af}
.row{display:flex;flex-wrap:wrap;gap:20px;margin-top:14px;align-items:flex-start}
.card{background:#121212;padding:14px;border-radius:10px;border:1px solid #2a2a2a}
.card h3{margin:0 0 10px;color:#8cf;font-size:14px}
.card svg{display:block;image-rendering:auto;max-width:100%;height:auto}
table{border-collapse:collapse;margin-top:12px;font-size:13px}
td,th{border:1px solid #333;padding:6px 10px}
.anim-card{width:778px}
.anim-wrap{position:relative;width:750px;height:750px;border-radius:6px;overflow:hidden;background:#000}
.anim-layer{position:absolute;left:0;top:0;width:750px;height:750px;transition:opacity .6s cubic-bezier(.4,0,.2,1)}
.anim-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  pointer-events:none;opacity:0;text-align:center;padding:0 30px;
  background:radial-gradient(ellipse at center,rgba(0,0,0,.62) 0%,rgba(0,0,0,.28) 45%,rgba(0,0,0,0) 72%)}
.anim-title .tt{font-size:34px;font-weight:800;letter-spacing:3px;color:#eaf6ff;
  text-shadow:0 0 18px rgba(0,190,255,.55),0 2px 6px #000}
.anim-title .te{margin-top:8px;font-size:14px;letter-spacing:.6px;color:#9fd6f2;
  max-width:460px;line-height:1.45;text-shadow:0 1px 5px #000}
.anim-banner{margin-top:10px;background:#101820;border:1px solid #23323d;border-left:3px solid #2b6a86;
  border-radius:0 8px 8px 0;padding:9px 12px;min-height:62px}
.ab-head{display:flex;align-items:baseline;gap:10px}
.ab-badge{background:#12303f;color:#8cf;border:1px solid #2b6a86;border-radius:999px;padding:2px 10px;
  font-size:11px;letter-spacing:1.2px;text-transform:uppercase;white-space:nowrap}
.ab-name{font-size:17px;font-weight:700;color:#eaf6ff;letter-spacing:.3px}
.ab-count{margin-left:auto;font-variant-numeric:tabular-nums;color:#9fd6f2;font-size:12.5px;
  letter-spacing:.4px;white-space:nowrap}
.ab-why{margin-top:4px;color:#b9cdd8;font-size:13px;line-height:1.45}
.ab-note{margin-top:4px;color:#7f96a3;font-size:11.5px;line-height:1.4;font-variant-numeric:tabular-nums}
.anim-bar{height:4px;background:#222;border-radius:2px;margin-top:10px;overflow:hidden}
.anim-bar-fill{height:100%;width:0;background:#8cf;transition:width .08s linear}
.anim-ctl{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:#9ab}
.btn{background:#1d1d1d;color:#dfe;border:1px solid #3a3a3a;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:13px}
.btn:hover{background:#282828}
.btn-wide{min-width:96px}
.trail{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#9ab;cursor:pointer}
.spd-lab{font-size:12px;letter-spacing:.5px;color:#9ab}
.anim-ctl input[type=range]{flex:1 1 auto;accent-color:#8cf;background:transparent;cursor:pointer}
.spd-val{min-width:44px;text-align:right;color:#cde;font-variant-numeric:tabular-nums;font-size:12.5px}
.rate{color:#7f96a3;font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:132px;text-align:right}
.stages{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
.stage{background:#171717;color:#667;border:1px solid #2a2a2a;border-radius:999px;padding:3px 10px;font-size:11px;letter-spacing:.4px;cursor:pointer}
.stage.past{color:#9ab;border-color:#333}
.stage.on{background:#12303f;color:#8cf;border-color:#2b6a86;box-shadow:0 0 0 1px #2b6a8666}
.anim-label{margin-top:8px;font-size:13px;color:#cde;min-height:18px}
.sf-card{margin-top:16px;max-width:1100px}
.sf-card h3{color:#ffb454}
.sf-lead{margin:0 0 12px;color:#9ab;font-size:12.5px;line-height:1.5}
.sf-none{margin:0;color:#6f6;font-size:13px}
.sf-item{border-left:3px solid #a4642a;background:#171310;border-radius:0 6px 6px 0;padding:9px 12px;margin-top:10px}
.sf-gate{color:#ffb454;font-size:12px;letter-spacing:.6px;text-transform:uppercase;margin-bottom:5px}
.sf-detail{color:#dcdcdc;font-size:13px;line-height:1.55}
.sf-tiles{margin-top:6px;color:#9ab;font-size:12px;font-variant-numeric:tabular-nums}
/* NOTES ARE NOT SHORTFALLS — the palette says so before the words do. Orange
   left rail and orange headings are the declaration channel; notes get a cool
   blue rail so the eye never reads one as the other from across the page. */
.nt-card{margin-top:16px;max-width:1100px}
.nt-card h3{color:#79c0ff}
.nt-lead{margin:0 0 12px;color:#9ab;font-size:12.5px;line-height:1.5}
.nt-lead b{color:#cfe6ff}
.nt-none{margin:0;color:#7f96a3;font-size:13px}
.nt-item{border-left:3px solid #2b6a86;background:#101820;border-radius:0 6px 6px 0;padding:9px 12px;margin-top:10px}
.nt-topic{color:#79c0ff;font-size:12px;letter-spacing:.6px;text-transform:uppercase;margin-bottom:5px}
.nt-detail{color:#dcdcdc;font-size:13px;line-height:1.55}
.mob-main{font-size:16px;font-weight:700;color:#6f6;font-variant-numeric:tabular-nums}
.mob-main.mob-over{color:#ff6b6b}
.mob-lab{color:#9ab;font-size:12px}
.mob-ok{color:#6f6;font-size:11px;border:1px solid #2f5c33;border-radius:999px;padding:1px 7px;margin-left:4px}
.mob-badge{background:#3a1414;color:#ff8b8b;border:1px solid #7d2626;border-radius:999px;
  padding:1px 8px;font-size:11px;letter-spacing:.5px;margin-left:4px;white-space:nowrap}
.mob-sub{color:#889;font-size:11.5px;margin-top:3px}
</style></head><body>
<h1>${plan.room} · Layer 1 Hub</h1>
<p class="sub">
<b>Grow from room</b> — anchors (sources/controller) → distance fields → confluence seed → flood core → claim tiles.<br/>
<b class="ok">1 storage · 1 terminal · 1 hub link · 3 spawns</b> · no stamp / no kit order.
</p>
${legendHtml()}
<div class="row">
  ${animPlayerHtml(plan)}
  <div class="card"><h3>Full room — shell, towers, labs, roads</h3>${full}</div>
  <div class="card"><h3>Hub zoom (±5)</h3>${zoom}</div>
</div>
<table>
<tr><th>piece</th><th>count</th><th>intent</th></tr>
<tr><td>storage</td><td>${m.storage ?? 0}</td><td>hub center</td></tr>
<tr><td>terminal</td><td>${m.terminal ?? 0}</td><td>hub trio — all touch the sitter tile</td></tr>
<tr><td>links</td><td>${m.link ?? 0}</td><td>hub + per-source + controller</td></tr>
<tr><td>containers</td><td>${m.container ?? 0}</td><td>one miner seat per source, plus the controller upgrader bin (the pre-RCL7 energy drop), plus the mineral miner seat when the room has a mineral</td></tr>
<tr><td>spawn</td><td>${m.spawn ?? 0}</td><td>RCL8 = 3, fanned into sectors</td></tr>
<tr><td>road</td><td>${m.road ?? 0}</td><td>one connected network: hub ↔ spawns ↔ sources ↔ controller</td></tr>
<tr><td>rampart</td><td>${m.rampart ?? 0}</td><td>weighted min-cut shell (no openings) + eco bubbles · ${plan.shell ? plan.shell.upkeepPerTick + " e/tick upkeep, " + plan.shell.deepTiles + " deep tiles inside" : "—"}</td></tr>
<tr><td>extension</td><td>${m.extension ?? 0}</td><td>60/60 required — every one has a D4 face on the interior</td></tr>
<tr><td>lab</td><td>${m.lab ?? 0}</td><td>4×4 diamond, both inputs in range 2 of all outputs</td></tr>
<tr><td>tower</td><td>${m.tower ?? 0}</td><td>weighted set-cover of the cut, refill-ease weighted in</td></tr>
<tr><td>nuker / observer</td><td>${m.nuker ?? 0} / ${m.observer ?? 0}</td><td>nuker hugs the hub (300k energy to haul) · no factory, no power spawn</td></tr>
<tr><td>extractor</td><td>${m.extractor ?? 0}</td><td>sits ON the mineral (the one structure allowed on an object tile) + a miner container on the mineral ring · no road by design</td></tr>
<tr><td>upgrader parks</td><td>${plan.meta?.ctrlParks ?? 0}</td><td>walkable seats the controller link feeds — 4 is the floor, below that the upgrader fleet throttles</td></tr>
<tr><td>enclosure</td><td>${plan.shell ? (plan.shell.enclosedController ? "ctrl ✓" : "ctrl ✗") + " · src " + plan.shell.enclosedSources + "/" + plan.sources.length : "—"}</td><td>eco pulled inside the wall when it cost ≤4 (controller) / ≤3 (source) extra cut tiles</td></tr>
<tr><td>defender mobility</td><td>${mobilityCell(plan)}</td><td>target <b>${MOBILITY_TARGET}</b> — interior walk ÷ exterior walk between wall tiles, judged only over pairs whose absolute detour exceeds a ${MOBILITY_DETOUR_FLOOR}-tile detour floor. The headline is the AS-BUILT lap (extension mass in the room, the walk the garrison actually gets); the mass-free readings below it are the same measure with the mass removed. &lt;1 means we out-manoeuvre the attacker.</td></tr>
<tr><td>rampart spurs</td><td>${plan.meta?.walls ? plan.meta.walls.spurred + "/" + plan.meta.walls.clusters + " clusters · " + plan.meta.walls.spurTiles + " tiles" : "—"}</td><td>roads TO the ramparts, never ON them${roadOnRampartNote(plan)} · ${plan.meta?.walls ? plan.meta.walls.pruned + " dead-end tiles pruned, " + plan.meta.walls.fillerTiles + " ext-face tiles" : "—"}${plan.meta?.walls?.inertPruned ? " · " + plan.meta.walls.inertPruned + " inert rampart(s) deleted (wall that defended nothing once every layer's ramparts were in)" : ""}</td></tr>
<tr><td>ext corridors</td><td>${plan.meta?.extensions ? plan.meta.extensions.stubRoads + " stub roads" : "—"}</td><td>extensions grow flanking the road network — ${plan.meta?.extensions?.corridorFallback ? plan.meta.extensions.corridorFallback + " placed road-blind (fallback)" : "every one of them D4 on a road"}</td></tr>
</table>
${shortfallsHtml(plan)}
${notesHtml(plan)}
<p>seed (${plan.seed?.x},${plan.seed?.y}) → hub (${plan.hub.x},${plan.hub.y}) · core ${plan.meta?.coreSize} · storage D4 <b>${plan.meta?.storageAccessD4}</b> · pCtrl ${plan.meta?.pathController} · pSrc ${plan.meta?.pathSourcesSum}</p>
<p><a href="index.html">← gallery</a></p>
</body></html>`;
}

function main() {
  // TRUE PROCESS WALL CLOCK. The line at the bottom of this report used to say
  // "total Ns" and that number was sum(meta.planMs) — in-planner time only. It
  // excluded the mongo fetch, the validation pass, the SVG render and 159 file
  // writes of >1MB each, and the goal doc then quoted it as "the full 159-room
  // suite". A reviewer timed the process at 98s against a committed claim of
  // under 90 and was right to; the two numbers were measuring different things
  // and only one of them was labelled. Both are printed now, and labelled.
  const suiteT0 = performance.now();
  const args = process.argv.slice(2);
  let rooms = GOLDEN;
  const ri = args.indexOf("--rooms");
  if (ri >= 0 && args[ri + 1]) rooms = args[ri + 1].split(",").map((s) => s.trim());
  if (args.includes("--all-claimable") || args.includes("--all")) {
    rooms = fetchAllClaimableRooms();
  }

  console.log("Plan v2 — layer 1 HUB grow-from-room · Screeps SVGs");
  console.log("Rooms:", rooms.length);
  const data = fetchRoomsFromMongo(rooms);
  fs.mkdirSync(OUT_V2, { recursive: true });

  const plans = [];
  for (const d of data) {
    const plan = planRoom(d);
    if (plan.error) {
      console.log(d.room, "ERROR", plan.error);
      plans.push({ room: d.room, error: plan.error });
      continue;
    }
    for (const [tag, e] of [
      ["SHELL", plan.shellError],
      ["TOWER", plan.towerError],
      ["LAB", plan.labError],
      ["MISC", plan.miscError],
      ["EXT", plan.extError],
      ["WALLROAD", plan.wallRoadError],
    ]) {
      if (e) console.log(d.room, `${tag} ERROR`, e);
    }

    plans.push(plan);
    const c = plan.meta.counts;
    const sh = plan.shell;
    console.log(
      d.room,
      `hub(${plan.hub.x},${plan.hub.y})`,
      `spawn=${c.spawn}`,
      `roads=${c.road}`,
      sh
        ? `cut=${sh.cut.length} deep=${sh.deepTiles} upkeep=${sh.upkeepPerTick}e/t${sh.budgetPass ? "" : " SPACE-SHORT"}${sh.priceyWall ? " pricey-wall" : ""}`
        : "no-shell",
      sh ? `encl[ctrl=${sh.enclosedController ? "Y" : "n"} src=${sh.enclosedSources}/${plan.sources.length}]` : "",
      // the as-built GATED lap is the verdict; the shell's mass-free max is the raw record
      builtGated(plan) !== null
        ? `mob[built-gated=${builtGated(plan)}${mobilityOver(plan) ? " OVER-TARGET" : ""}` +
          ` floor-gated=${plan.meta.walls.mobility.floorGated}` +
          (sh ? ` shell-ungated=${sh.mobility.max}` : "") +
          `]`
        : sh
          ? `mob[shell-ungated=${sh.mobility.max} mean=${sh.mobility.mean}]`
          : "",
      plan.meta.towers
        ? `twr[min=${plan.meta.towers.minShellDmg} avg=${plan.meta.towers.avgShellDmg} rf<=${plan.meta.towers.maxRefill}]`
        : "",
      plan.meta.extensions
        ? `ext=${plan.meta.extensions.placed}/${plan.meta.extensions.target}${plan.meta.extensions.placed < EXT_TARGET ? " SHORT" : ""}`
        : "",
    );
    fs.writeFileSync(path.join(OUT_V2, `${d.room}.html`), roomPage(plan));
  }

  const ok = plans.filter((p) => !p.error);
  let index = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Pacifist Plan v2 — Hub</title>
<style>
body{font-family:system-ui,sans-serif;background:#080808;color:#eee;margin:20px}
h1{margin-bottom:4px} .sub{color:#889;max-width:1100px;line-height:1.55}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:18px;margin-top:18px}
.card{background:#101010;border:1px solid #222;border-radius:10px;padding:12px}
.card h3{margin:0 0 8px;font-size:14px}
.card img.thumb{display:block;width:100%;height:auto;image-rendering:auto;background:#0a0a0a;border-radius:6px}
a{color:#6af} .tag{color:#6f6;font-size:12px;margin-left:8px}
.mob{font-size:11px;margin-left:8px;border-radius:999px;padding:2px 8px;white-space:nowrap;
  background:#12220f;color:#8fd48f;border:1px solid #2f5c33}
.mob.over{background:#3a1414;color:#ff8b8b;border-color:#7d2626}
.mob i{font-style:normal;opacity:.72;font-weight:400}
.mob b{font-variant-numeric:tabular-nums}
/* the shell's ungated record is a DIFFERENT measure, so it is a different chip
   in a different colour — see the badge comment below */
.mobs{font-size:11px;margin-left:6px;border-radius:999px;padding:2px 8px;white-space:nowrap;
  background:#141a22;color:#8fb4d4;border:1px solid #2b4a5c}
.sfc{font-size:11px;margin-left:6px;color:#ffb454}
.ntc{font-size:11px;margin-left:6px;color:#79c0ff}
.watch{margin-left:8px;font-size:11px;color:#8cf;text-decoration:none;background:#12303f;border:1px solid #2b6a86;border-radius:999px;padding:2px 8px}
.watch:hover{background:#17415a;color:#bfe6ff}
</style></head><body>
<h1>Plan v2 · Layer 1 — Hub</h1>
<p class="sub">
<b>Grow from the room</b>: eco anchors flood distance fields → confluence seed → grow core → claim hub tiles.<br/>
Only hub layer: storage + terminal + 1 link + 3 spawns + need-based roads.<br/>
Cards below are lazy-loaded flat-colour thumbnails (key underneath); the real Screeps sprites, the animation and the
declared shortfalls and notes are on each room's own page — click the thumbnail or the room name.
</p>
${legendHtml()}
${thumbLegendHtml()}
<div class="grid">`;
  // THUMBNAILS ON DISK, LAZY-LOADED. The index used to inline
  // renderRoomSvg(p, 10) — a ~1MB sprite-heavy SVG — once per room, and came
  // to 159,056,753 bytes: 13.8s of transfer and 17.2s to domComplete on
  // localhost, with 24 of the 159 cards still missing at the 10-second mark.
  // renderThumbSvg writes a ~30KB resource-free SVG per room (the WHY, and the
  // three approaches rejected on the way there, are in render.mjs); the index
  // references it with loading=lazy, so the browser fetches only the cards the
  // reader has scrolled to. Every room still has a card and every card still
  // links to its full-sprite room page.
  const thumbDir = path.join(OUT_V2, "thumbs");
  fs.mkdirSync(thumbDir, { recursive: true });
  for (const p of ok) {
    fs.writeFileSync(path.join(thumbDir, `${p.room}.svg`), renderThumbSvg(p, 8));
    const sh = p.shell ? `cut ${p.shell.cut.length} · deep ${p.shell.deepTiles}` : "no shell";
    const lb = p.structures.lab?.length ? `${p.structures.lab.length} labs` : "NO LABS";
    // ------------------------------------------------------------------
    // TWO NUMBERS, TWO CHIPS, EACH SAYING WHICH ONE IT IS.
    //
    // The badge read "mob 0" for E12S7 while that room's own page printed 1.5.
    // Both are true and they are not the same quantity: 0 is the AS-BUILT
    // GATED lap (extension mass in the room, and only pairs whose absolute
    // detour clears the 4-tile floor are judged — E12S7 has one candidate pair
    // and it is below the floor, so nothing is judged and the lap is 0), while
    // 1.5 is the shell's UNGATED record, measured on the bare cut with no mass
    // and no floor. Printed as a bare "mob" they looked like one number
    // disagreeing with itself. No two published numbers about the same room
    // may look like the same quantity while disagreeing — so both are here,
    // both are named, and the verdict chip is the one the target applies to.
    // ------------------------------------------------------------------
    const bg = builtGated(p);
    const mob =
      bg === null
        ? ""
        : `<span class="mob${mobilityOver(p) ? " over" : ""}" title="as-built gated defender lap — interior walk ÷ exterior walk with the extension mass in place, judged only over pairs whose absolute detour exceeds ${MOBILITY_DETOUR_FLOOR} tiles (target ${MOBILITY_TARGET}). This is the reading the gate is applied to.">as-built gated lap <b>${bg}</b>${mobilityOver(p) ? ` <i>over ${MOBILITY_TARGET}</i>` : ""}</span>`;
    const shellMob = p.shell
      ? `<span class="mobs" title="the shell's own ungated record: same ratio measured on the bare cut, no extension mass and no detour floor. Not gated, not compared to the target — it is the raw worst pair.">shell ungated <b>${p.shell.mobility.max}</b></span>`
      : "";
    const nsf = (p.meta.shortfalls || []).length;
    const sfc = nsf ? `<span class="sfc" title="declared shortfalls — gates this plan knowingly failed">${nsf} shortfall${nsf > 1 ? "s" : ""}</span>` : "";
    // A NOTE IS DISCOVERABLE FROM THE INDEX OR IT MIGHT AS WELL NOT EXIST.
    // 79 rooms carry one and nothing on this page said so, so a reviewer
    // scanning the index had no way to find the room that had something to
    // say. Deliberately a different colour and a different word from the
    // shortfall count: they are different channels (see notesHtml).
    const nnt = (p.meta.notes || []).length;
    const ntc = nnt ? `<span class="ntc" title="planner notes — observations, not declarations; they excuse nothing">${nnt} note${nnt > 1 ? "s" : ""}</span>` : "";
    index += `<div class="card"><h3><a href="${p.room}.html">${p.room}</a>
<a class="watch" href="${p.room}.html#anim" title="watch the planner build ${p.room} step by step">&#9654; watch</a>
<span class="tag">${sh} · ${p.meta.counts.tower ?? 0} towers · ${lb}</span>${mob}${shellMob}${sfc}${ntc}</h3>
<a href="${p.room}.html"><img class="thumb" loading="lazy" decoding="async" width="400" height="400" src="thumbs/${p.room}.svg" alt="${p.room} plan thumbnail"/></a></div>`;
  }
  index += `</div></body></html>`;
  fs.writeFileSync(path.join(OUT_V2, "index.html"), index);

  // THE SERIALISED PLAN CARRIES NO STOPWATCH. `meta.planMs` is wall-clock: it is
  // different on every run, it was the only thing in the artifact that was, and
  // while it was in here "the planner is deterministic" was an unfalsifiable
  // claim — plans-hub.json never hashed the same twice, so nobody could tell a
  // real non-determinism from the clock. It is dropped from the written plan and
  // kept in memory for the wall-time report below, which is console output that
  // nothing hashes. `meta.shellEscalation.steps` is the deterministic record of
  // what the room actually paid for.
  const slim = ok.map((p) => {
    const { planMs, ...meta } = p.meta;
    return {
      room: p.room,
      hub: p.hub,
      sitter: p.sitter, // push-plan.mjs ships this to the live segment
      labInputs: p.labInputs,
      structures: p.structures,
      meta,
      sources: p.sources,
      controller: p.controller,
      mineral: p.mineral,
    };
  });
  fs.writeFileSync(path.join(OUT_V2, "plans-hub.json"), JSON.stringify(slim, null, 2));

  console.log("Wrote", path.join(OUT_V2, "index.html"));
  console.log("OK", ok.length, "/", plans.length);

  // --- suite-level summary (the numbers the owner actually reads) ---
  const withShell = ok.filter((p) => p.shell);
  const short = ok.filter((p) => (p.structures.extension || []).length < EXT_TARGET);
  const cuts = withShell.map((p) => p.shell.cut.length).sort((a, b) => a - b);
  const med = (a) => (a.length ? a[a.length >> 1] : 0);
  const mobMax = withShell.map((p) => p.shell.mobility.max).filter((v) => v > 0);
  const mobMean = withShell.map((p) => p.shell.mobility.mean).filter((v) => v > 0);
  const avg = (a) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 100) / 100 : 0);
  console.log(
    `extensions 60/60: ${ok.length - short.length}/${ok.length}` +
      (short.length ? ` — SHORT: ${short.map((p) => `${p.room}:${p.structures.extension.length}`).join(" ")}` : ""),
  );
  console.log(`cut size: median ${med(cuts)} · min ${cuts[0]} · max ${cuts[cuts.length - 1]}`);
  // roads are a running cost (decay + build CPU + creep-tick opportunity), so
  // the distribution is a first-class number, not a footnote
  const roads = ok.map((p) => p.structures.road.length).sort((a, b) => a - b);
  const qr = (f) => roads[Math.min(roads.length - 1, Math.floor(roads.length * f))];
  console.log(
    `roads: median ${med(roads)} · mean ${(roads.reduce((s, v) => s + v, 0) / roads.length).toFixed(1)} · ` +
      `min ${roads[0]} · p75 ${qr(0.75)} · p90 ${qr(0.9)} · max ${roads[roads.length - 1]}`,
  );
  const stubs = ok.map((p) => p.meta.extensions?.stubRoads ?? 0).sort((a, b) => a - b);
  const fallback = ok.filter((p) => (p.meta.extensions?.corridorFallback ?? 0) > 0);
  console.log(
    `ext corridors: stub roads median ${med(stubs)} · max ${stubs[stubs.length - 1]}` +
      (fallback.length
        ? ` — road-blind fallback in ${fallback.length} rooms (${fallback
            .map((p) => `${p.room}:${p.meta.extensions.corridorFallback}`)
            .join(" ")})`
        : " · no road-blind fallback anywhere"),
  );
  const wm = ok.filter((p) => p.meta.walls);
  console.log(
    `rampart spurs: ${wm.reduce((s, p) => s + p.meta.walls.spurred, 0)} spurs / ` +
      `${wm.reduce((s, p) => s + p.meta.walls.clusters, 0)} clusters · ` +
      `${wm.reduce((s, p) => s + p.meta.walls.spurTiles, 0)} tiles · ` +
      `pruned ${wm.reduce((s, p) => s + p.meta.walls.pruned, 0)} dead-end road tiles · ` +
      `ext-face net ${wm.reduce((s, p) => s + p.meta.walls.fillerTiles, 0)} tiles`,
  );
  // sources: STRICT is the headline (works inside AND the whole walkable ring
  // inside — the same bar the controller is held to); the looser works-only
  // reading is printed beside it rather than replaced. See layer-shell.
  console.log(
    `enclosed: controller ${withShell.filter((p) => p.shell.enclosedController).length}/${withShell.length} · ` +
      `sources ${withShell.reduce((s, p) => s + p.shell.enclosedSources, 0)}/${withShell.reduce((s, p) => s + p.sources.length, 0)} strict` +
      ` (works-only ${withShell.reduce((s, p) => s + (p.shell.enclosedSourceWorks ?? 0), 0)})`,
  );
  console.log(`mobility ratio: mean-of-means ${avg(mobMean)} · worst room max ${Math.max(0, ...mobMax)}`);

  // ------------------------------------------------------------------
  // THE LANE BOUND IS ASSERTED, NOT ADVERTISED.
  //
  // Layer 6 claims a number no arrangement of the 60 extensions can lap worse
  // than; layer 7 measures what the finished room actually laps. For one review
  // cycle the two lived in the same paragraph of the same declaration and
  // disagreed in 7 rooms (E4S7 claimed 1.5 and shipped 14) because nothing ever
  // compared them. This is the comparison, fleet-wide, and it is loud: a bound
  // that does not hold is a defect in the model, not a property of the room.
  // ------------------------------------------------------------------
  const bounded = ok.filter((p) => p.meta.walls?.mobility?.boundHeld !== null && p.meta.walls?.mobility?.boundHeld !== undefined);
  const broke = bounded.filter((p) => !p.meta.walls.mobility.boundHeld);
  const unbounded = ok.filter(
    (p) => p.meta.walls && (p.meta.walls.mobility.boundHeld === null || p.meta.walls.mobility.boundHeld === undefined),
  );
  console.log(
    `lane bound holds: ${bounded.length - broke.length}/${bounded.length}` +
      (unbounded.length
        ? ` · ${unbounded.length} room(s) claim no bound (${unbounded.map((p) => p.room).join(" ")})`
        : " · every room claims one") +
      (broke.length
        ? ` — BOUND BROKEN in ${broke.length}: ${broke
            .map((p) => `${p.room}(bound ${p.meta.walls.mobility.bound} shipped ${p.meta.shell.mobilityBuilt.maxGated})`)
            .join(" ")}`
        : ""),
  );
  if (broke.length) process.exitCode = 1;

  // the quality numbers the adversarial review added to the contract
  const withTowers = ok.filter((p) => p.meta.towers);
  const t0 = withTowers.map((p) => p.meta.towers.refillDists[0]).sort((a, b) => a - b);
  const unsorted = withTowers.filter((p) => {
    const r = p.meta.towers.refillDists;
    return r.some((v, i) => i && v < r[i - 1]);
  });
  console.log(
    `tower[0] refill (the only tower at RCL3-5): median ${med(t0)} · max ${t0[t0.length - 1]}` +
      (unsorted.length ? ` — NOT refill-ordered in ${unsorted.length} rooms` : " · refill-ordered everywhere"),
  );
  const parks = ok.map((p) => p.meta.ctrlParks ?? 0).sort((a, b) => a - b);
  const thin = ok.filter((p) => (p.meta.ctrlParks ?? 0) < 4);
  console.log(
    `upgrader parks: min ${parks[0]} · median ${med(parks)}` +
      (thin.length ? ` — THIN: ${thin.map((p) => `${p.room}:${p.meta.ctrlParks}`).join(" ")}` : ""),
  );
  const noExtractor = ok.filter((p) => !(p.structures.extractor || []).length);
  console.log(
    `extractor + mineral seat: ${ok.length - noExtractor.length}/${ok.length}` +
      (noExtractor.length ? ` — missing: ${noExtractor.map((p) => p.room).join(" ")}` : ""),
  );
  // RUNTIME IS MEASURED, NOT GUESSED. planRoom stamps its own wall time into
  // meta.planMs; a room that walks the whole escalation ladder composes the
  // full layer stack four times, so this is the number that says whether a
  // search got greedy — and it is a fleet distribution, because the mean of a
  // fleet with one 2-second room in it says nothing useful.
  const msAll = ok.map((p) => p.meta.planMs ?? 0).sort((a, b) => a - b);
  const qm = (f) => msAll[Math.min(msAll.length - 1, Math.floor(msAll.length * f))];
  const slowest = ok
    .slice()
    .sort((a, b) => (b.meta.planMs ?? 0) - (a.meta.planMs ?? 0))
    .slice(0, 3);
  console.log(
    `planRoom wall time: p50 ${qm(0.5)}ms · p90 ${qm(0.9)}ms · max ${msAll[msAll.length - 1]}ms · ` +
      `in-planner total ${(msAll.reduce((s, v) => s + v, 0) / 1000).toFixed(1)}s — slowest ` +
      slowest
        .map((p) => `${p.room}:${p.meta.planMs}ms(${p.meta.shellEscalation?.steps ?? 1} composes)`)
        .join(" "),
  );
  const escalated = ok.filter((p) => p.meta.seedSkip > 0);
  console.log(
    `seed escalation: ${escalated.length}/${ok.length} rooms left the top seed` +
      (escalated.length
        ? ` (${escalated.map((p) => `${p.room}:skip${p.meta.seedSkip} eco${p.meta.pathSourcesSum + p.meta.pathController}`).join(" ")})`
        : ""),
  );
  // ...and the number a reviewer with a stopwatch will actually see. It is
  // larger than the in-planner total by the mongo fetch, the render and the
  // writes, and the gap is not noise — it is roughly a tenth of the run.
  const suiteS = (performance.now() - suiteT0) / 1000;
  const inPlanner = msAll.reduce((s, v) => s + v, 0) / 1000;
  console.log(
    `SUITE WALL CLOCK: ${suiteS.toFixed(1)}s end to end (in-planner ${inPlanner.toFixed(1)}s + ` +
      `${(suiteS - inPlanner).toFixed(1)}s of mongo fetch, SVG render and ${ok.length} file writes). ` +
      `Quote this one when you mean "the suite".`,
  );
}

main();
