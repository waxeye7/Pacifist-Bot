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
import { renderRoomSvg, hubCrop, legendHtml } from "./render.mjs";
import { EXT_TARGET, planRoom } from "./pipeline.mjs";

/**
 * Browser replay of the planner stages — dependency-free vanilla JS.
 *
 * Five stacked canvases:
 *   terrain   drawn once
 *   scaffoldA dt + distance fields   — dimmed once the plan starts landing
 *   scaffoldB basin + core           — dimmed once the wall goes up
 *   cells     the actual plan        — stays at full brightness
 *   marks     sources / controller / mineral + transient FX (pulses, ranges)
 *
 * Frames come from anim/<room>.json (export-anim.mjs). Optional `meta` in that
 * file drives pacing (stageRates) and the scaffold split (stageScaffold); if it
 * is missing the player degrades to the old flat-rate single-layer behaviour.
 */
function animPlayerHtml(plan) {
  const marks = JSON.stringify({
    sources: plan.sources || [],
    controller: plan.controller || null,
    mineral: plan.mineral || null,
    hub: plan.hub || null,
  });
  // NOTE: the player script uses string concat, never template literals —
  // this whole file is one big JS template literal already.
  return `<div class="card anim-card" id="anim"><h3>Animated plan — watch the planner think</h3>
<div class="anim-wrap" id="animWrap">
  <canvas class="anim-layer" id="animTerrain"></canvas>
  <canvas class="anim-layer" id="animScaffA"></canvas>
  <canvas class="anim-layer" id="animScaffB"></canvas>
  <canvas class="anim-layer" id="animCells"></canvas>
  <canvas class="anim-layer" id="animMarks"></canvas>
  <div class="anim-title" id="animTitle"><div class="tt" id="animTitleName"></div><div class="te" id="animTitleWhy"></div></div>
</div>
<div class="anim-bar"><div class="anim-bar-fill" id="animBar"></div></div>
<div class="anim-ctl">
  <button id="animPlay" class="btn">&#10074;&#10074; pause</button>
  <button id="animRestart" class="btn">&#8635; restart</button>
  <label class="spd">speed
    <select id="animSpeed">
      <option value="0.5">0.5&times;</option>
      <option value="1" selected>1&times;</option>
      <option value="2">2&times;</option>
      <option value="4">4&times;</option>
    </select>
  </label>
  <span class="count" id="animCount">&mdash;</span>
</div>
<div class="stages" id="animStages"></div>
<div class="anim-label" id="animLabel">loading anim/${plan.room}.json &hellip;</div>
</div>
<script>
(function () {
  var ROOM = ${JSON.stringify(plan.room)};
  var TERRAIN = ${JSON.stringify(plan.terrain)};
  var MARKS = ${marks};
  var CELL = 12, N = 50, W = CELL * N, BASE_RATE = 8, HOLD_MS = 2400;
  var TITLE_HOLD = 700, TITLE_FADE = 1000;

  // stage -> [TITLE CARD, one-line explainer, HUD noun, chip label]
  var STAGE_INFO = {
    dt:         ['DISTANCE TRANSFORM', 'how far every tile sits from the nearest wall', 'bands', 'dt'],
    fields:     ['DISTANCE FIELDS', 'walk-distance flood out of each source and the controller', 'rings', 'fields'],
    seed:       ['CONFLUENCE SEED', 'the one tile with the cheapest total walk to everything that matters', 'seed', 'seed'],
    basin:      ['BASIN', 'grow out from the seed, cheapest walk first — how much room is there?', 'rings', 'basin'],
    core:       ['CORE POCKET', 'the open pocket the hub trio has to fit inside', 'tiles', 'core'],
    claims:     ['CLAIM TILES', 'storage, terminal, link, spawns — one deliberate tile at a time', 'claims', 'claims'],
    roads:      ['ROAD NETWORK', 'one connected web: hub to spawns to sources to controller', 'roads', 'roads'],
    ramparts:   ['MIN-CUT', 'the cheapest wall that seals the base', 'ramparts', 'min-cut'],
    towers:     ['TOWERS', 'set-cover the shell so no wall tile is out of tower range', 'towers', 'towers'],
    labs:       ['LAB DIAMOND', '10 labs packed so every reagent pair is within reach', 'labs', 'labs'],
    nuker:      ['NUKER', 'one deep tile, as far inside the wall as it gets', 'nuker', 'nuker'],
    observer:   ['OBSERVER', 'anywhere inside the wall — it only has to exist', 'observer', 'observer'],
    extractor:  ['EXTRACTOR', 'the one structure built ON a room object — it sits on the mineral', 'extractor', 'extractor'],
    extensions: ['EXTENSIONS', 'flanking the corridors, closest to the hub first — every one on a road face', 'extensions', 'extensions']
  };
  function info(stage) {
    return STAGE_INFO[stage] || [String(stage).toUpperCase().replace(/_/g, ' '), '', 'steps', String(stage)];
  }
  // single-tile steps in these stages do NOT pulse (they are bulk fill / scaffolding)
  var NO_PULSE = { roads: 1, ramparts: 1, extensions: 1, labs: 1, dt: 1, fields: 1, basin: 1, core: 1 };
  // scaffold stages that live on the LATE scaffold canvas (dimmed only at the wall)
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
      gC = ctx2d('animCells'), gM = ctx2d('animMarks');

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

  // --- markers + transient FX (redrawn while pulses are alive) ---
  function dot(p, fill, stroke) {
    if (!p) return;
    gM.beginPath();
    gM.arc(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, CELL * 0.34, 0, 6.2832);
    gM.fillStyle = fill; gM.fill();
    gM.lineWidth = 1.4; gM.strokeStyle = stroke; gM.stroke();
  }
  function drawMarks() {
    gM.clearRect(0, 0, W, W);
    for (var s = 0; s < MARKS.sources.length; s++) dot(MARKS.sources[s], '#ffe14d', '#7a5c00');
    dot(MARKS.controller, '#66ccff', '#083b57');
    dot(MARKS.mineral, '#e0a6ff', '#3d1a4d');
    if (MARKS.hub) {
      gM.beginPath();
      gM.arc(MARKS.hub.x * CELL + CELL / 2, MARKS.hub.y * CELL + CELL / 2, CELL * 0.5, 0, 6.2832);
      gM.lineWidth = 1.6; gM.strokeStyle = '#00E676'; gM.stroke();
    }
  }
  drawMarks();

  var fx = [], fxDirty = false;
  function addPulse(x, y, hex) { fx.push({ k: 0, x: x, y: y, c: hex, t0: now(), life: 620 }); }
  function addRange(x, y, r) { fx.push({ k: 1, x: x, y: y, r: r, c: '#ff8844', t0: now(), life: 1100 }); }
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
      } else {
        var sx = (f.x - f.r) * CELL, sy = (f.y - f.r) * CELL, sw = (2 * f.r + 1) * CELL;
        gM.strokeStyle = f.c; gM.lineWidth = 1.6;
        if (gM.setLineDash) gM.setLineDash([5, 4]);
        gM.globalAlpha = (1 - a) * 0.9;
        gM.strokeRect(sx, sy, sw, sw);
        gM.globalAlpha = (1 - a) * 0.10;
        gM.fillStyle = f.c; gM.fillRect(sx, sy, sw, sw);
      }
      gM.restore();
    }
    fxDirty = true;
  }

  // --- title cards ---
  var elTitle = document.getElementById('animTitle');
  var elTName = document.getElementById('animTitleName');
  var elTWhy = document.getElementById('animTitleWhy');
  var titleT0 = 0, titleOn = false;
  function showTitle(stage) {
    var inf = stage === '__done'
      ? ['PLAN COMPLETE', ROOM + ' · ' + steps.length + ' planner steps']
      : info(stage);
    if (!inf[0]) return;
    elTName.textContent = inf[0];
    elTWhy.textContent = inf[1] || '';
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

  // --- playback ---
  var steps = null, palette = [], idx = 0, acc = 0, last = 0, holdUntil = 0, playing = true, speed = 1;
  var stageStart = {}, stageCount = {}, stageOrder = [], curStage = null;
  var rates = {}, scaff = {}, fadeAAt = Infinity, fadeBAt = Infinity;
  var elPlay = document.getElementById('animPlay');
  var elRestart = document.getElementById('animRestart');
  var elSpeed = document.getElementById('animSpeed');
  var elCount = document.getElementById('animCount');
  var elLabel = document.getElementById('animLabel');
  var elStages = document.getElementById('animStages');
  var elBar = document.getElementById('animBar');

  var rr = typeof gC.roundRect === 'function';
  /** scaffold stages paint on their own canvas so they can be dimmed later */
  function ctxFor(stage) {
    if (!scaff[stage]) return gC;
    return SCAFF_LATE[stage] ? gB : gA;
  }
  function drawStep(st, g) {
    var c = st.cells, col = null;
    for (var i = 0; i < c.length; i += 3) {
      var hex = palette[c[i + 2]];
      if (hex !== col) { col = hex; g.fillStyle = hex; }
      var x = c[i] * CELL + 1, y = c[i + 1] * CELL + 1, w = CELL - 2;
      if (rr) { g.beginPath(); g.roundRect(x, y, w, w, 2.5); g.fill(); }
      else g.fillRect(x, y, w, w);
    }
  }
  function clearCells() {
    gA.clearRect(0, 0, W, W); gB.clearRect(0, 0, W, W); gC.clearRect(0, 0, W, W);
  }
  /** the thinking layers recede as the real base lands on top of them */
  function applyFades(i) {
    elScaffA.style.opacity = i >= fadeBAt ? 0.14 : (i >= fadeAAt ? 0.25 : 1);
    elScaffB.style.opacity = i >= fadeBAt ? 0.25 : 1;
  }

  function seek(to) {
    clearCells();
    fx.length = 0; fxDirty = true;
    for (var i = 0; i < to; i++) drawStep(steps[i], ctxFor(steps[i].stage));
    idx = to; acc = 0; holdUntil = 0;
    applyFades(idx);
    curStage = steps[Math.min(idx, steps.length - 1)].stage;
    showTitle(curStage);
    hud();
  }

  function advance() {
    var st = steps[idx];
    if (st.stage !== curStage) { curStage = st.stage; showTitle(st.stage); }
    drawStep(st, ctxFor(st.stage));
    // a single tile landing is a decision — announce it
    if (st.cells.length === 3 && !NO_PULSE[st.stage]) {
      addPulse(st.cells[0], st.cells[1], palette[st.cells[2]] || '#ffffff');
      if (st.stage === 'towers') addRange(st.cells[0], st.cells[1], TOWER_RANGE);
    }
    idx++;
    applyFades(idx);
  }

  function hud() {
    var done = idx >= steps.length;
    var i = Math.min(idx, steps.length);
    var cur = steps[Math.min(idx, steps.length - 1)];
    var active = done ? stageOrder[stageOrder.length - 1] : cur.stage;
    var inf = info(active);
    var within = done ? stageCount[active] : i - stageStart[active];
    elCount.textContent = inf[0] + ' · ' + within + '/' + stageCount[active] + ' ' + inf[2];
    elLabel.textContent = done ? 'plan complete — looping' : cur.label;
    elBar.style.width = (100 * i / steps.length) + '%';
    var kids = elStages.children;
    for (var k = 0; k < kids.length; k++) {
      var st = kids[k].getAttribute('data-stage');
      var pos = stageOrder.indexOf(st);
      kids[k].className = 'stage' + (st === active ? ' on' : (pos < stageOrder.indexOf(active) ? ' past' : ''));
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
    if (idx >= steps.length) {
      if (!holdUntil) holdUntil = t + HOLD_MS;
      else if (t >= holdUntil) { holdUntil = 0; seek(0); }
      return;
    }
    // budget in SECONDS: each step costs 1/(BASE_RATE * stageRate), so a stage
    // rate of 5 skims and a rate of 0.4 dwells — crossing a stage boundary
    // mid-tick just changes the price of the next step.
    acc += dt * speed;
    var moved = false, guard = 0;
    while (idx < steps.length) {
      var r = rates[steps[idx].stage];
      if (!(r > 0)) r = 1;
      var cost = 1 / (BASE_RATE * r);
      if (acc < cost) break;
      acc -= cost; advance(); moved = true;
      if (++guard > 800) { acc = 0; break; }
    }
    if (moved) {
      hud();
      if (idx >= steps.length) showTitle('__done');
    }
  }

  elPlay.onclick = function () {
    playing = !playing;
    elPlay.innerHTML = playing ? '&#10074;&#10074; pause' : '&#9654; play';
  };
  elRestart.onclick = function () { seek(0); };
  elSpeed.onchange = function () { speed = parseFloat(elSpeed.value); };

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
      for (var i = 0; i < steps.length; i++) {
        var sg = steps[i].stage;
        if (!(sg in stageStart)) { stageStart[sg] = i; stageOrder.push(sg); }
        stageCount[sg] = (stageCount[sg] || 0) + 1;
      }
      // dt+fields recede once real tiles get claimed; basin+core once the wall goes up
      fadeAAt = stageStart.claims !== undefined ? stageStart.claims
        : (stageStart.roads !== undefined ? stageStart.roads : Infinity);
      fadeBAt = stageStart.ramparts !== undefined ? stageStart.ramparts
        : (stageStart.towers !== undefined ? stageStart.towers : Infinity);
      for (var j = 0; j < stageOrder.length; j++) {
        var b = document.createElement('button');
        b.className = 'stage'; b.textContent = info(stageOrder[j])[3];
        b.setAttribute('data-stage', stageOrder[j]);
        b.setAttribute('title', info(stageOrder[j])[1]);
        b.onclick = (function (name) { return function () { seek(stageStart[name]); }; })(stageOrder[j]);
        elStages.appendChild(b);
      }
      seek(0);
      requestAnimationFrame(frame);
    })
    .catch(function (e) {
      elLabel.textContent = 'no animation for ' + ROOM + ' (' + e.message +
        ') — run: node tools/plan-suite/v2/export-anim.mjs --all';
    });
})();
</script>`;
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
.anim-card{width:628px}
.anim-wrap{position:relative;width:600px;height:600px;border-radius:6px;overflow:hidden;background:#000}
.anim-layer{position:absolute;left:0;top:0;width:600px;height:600px;transition:opacity .6s cubic-bezier(.4,0,.2,1)}
.anim-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  pointer-events:none;opacity:0;text-align:center;padding:0 30px;
  background:radial-gradient(ellipse at center,rgba(0,0,0,.62) 0%,rgba(0,0,0,.28) 45%,rgba(0,0,0,0) 72%)}
.anim-title .tt{font-size:34px;font-weight:800;letter-spacing:3px;color:#eaf6ff;
  text-shadow:0 0 18px rgba(0,190,255,.55),0 2px 6px #000}
.anim-title .te{margin-top:8px;font-size:14px;letter-spacing:.6px;color:#9fd6f2;
  max-width:460px;line-height:1.45;text-shadow:0 1px 5px #000}
.anim-bar{height:4px;background:#222;border-radius:2px;margin-top:10px;overflow:hidden}
.anim-bar-fill{height:100%;width:0;background:#8cf;transition:width .08s linear}
.anim-ctl{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:13px;color:#9ab}
.btn{background:#1d1d1d;color:#dfe;border:1px solid #3a3a3a;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:13px}
.btn:hover{background:#282828}
.spd select{background:#1d1d1d;color:#dfe;border:1px solid #3a3a3a;border-radius:6px;padding:4px 6px}
.count{margin-left:auto;font-variant-numeric:tabular-nums;color:#cde;font-size:12px;letter-spacing:.5px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stages{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
.stage{background:#171717;color:#667;border:1px solid #2a2a2a;border-radius:999px;padding:3px 10px;font-size:11px;letter-spacing:.4px;cursor:pointer}
.stage.past{color:#9ab;border-color:#333}
.stage.on{background:#12303f;color:#8cf;border-color:#2b6a86;box-shadow:0 0 0 1px #2b6a8666}
.anim-label{margin-top:8px;font-size:13px;color:#cde;min-height:18px}
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
<tr><td>containers</td><td>${m.container ?? 0}</td><td>one per source (miner seat)</td></tr>
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
<tr><td>defender mobility</td><td>${plan.shell ? plan.shell.mobility.max + " max · " + plan.shell.mobility.mean + " mean" : "—"}</td><td>interior walk ÷ exterior walk between wall tiles — &lt;1 means we out-manoeuvre the attacker</td></tr>
<tr><td>rampart spurs</td><td>${plan.meta?.walls ? plan.meta.walls.spurred + "/" + plan.meta.walls.clusters + " clusters · " + plan.meta.walls.spurTiles + " tiles" : "—"}</td><td>roads TO the ramparts, never ON them · ${plan.meta?.walls ? plan.meta.walls.pruned + " dead-end tiles pruned, " + plan.meta.walls.fillerTiles + " ext-face tiles" : "—"}</td></tr>
<tr><td>ext corridors</td><td>${plan.meta?.extensions ? plan.meta.extensions.stubRoads + " stub roads" : "—"}</td><td>extensions grow flanking the road network — ${plan.meta?.extensions?.corridorFallback ? plan.meta.extensions.corridorFallback + " placed road-blind (fallback)" : "every one of them D4 on a road"}</td></tr>
</table>
<p>seed (${plan.seed?.x},${plan.seed?.y}) → hub (${plan.hub.x},${plan.hub.y}) · core ${plan.meta?.coreSize} · storage D4 <b>${plan.meta?.storageAccessD4}</b> · pCtrl ${plan.meta?.pathController} · pSrc ${plan.meta?.pathSourcesSum}</p>
<p><a href="index.html">← gallery</a></p>
</body></html>`;
}

function main() {
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
      sh ? `mob[max=${sh.mobility.max} mean=${sh.mobility.mean}]` : "",
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
.card svg{width:100%;height:auto;image-rendering:auto;background:#0a0a0a;border-radius:6px}
a{color:#6af} .tag{color:#6f6;font-size:12px;margin-left:8px}
.watch{margin-left:8px;font-size:11px;color:#8cf;text-decoration:none;background:#12303f;border:1px solid #2b6a86;border-radius:999px;padding:2px 8px}
.watch:hover{background:#17415a;color:#bfe6ff}
</style></head><body>
<h1>Plan v2 · Layer 1 — Hub</h1>
<p class="sub">
<b>Grow from the room</b>: eco anchors flood distance fields → confluence seed → grow core → claim hub tiles.<br/>
Only hub layer: storage + terminal + 1 link + 3 spawns + need-based roads. Real Screeps SVGs.
</p>
${legendHtml()}
<div class="grid">`;
  for (const p of ok) {
    const full = renderRoomSvg(p, 10);
    const sh = p.shell ? `cut ${p.shell.cut.length} · deep ${p.shell.deepTiles}` : "no shell";
    const lb = p.structures.lab?.length ? `${p.structures.lab.length} labs` : "NO LABS";
    index += `<div class="card"><h3><a href="${p.room}.html">${p.room}</a>
<a class="watch" href="${p.room}.html#anim" title="watch the planner build ${p.room} step by step">&#9654; watch</a>
<span class="tag">${sh} · ${p.meta.counts.tower ?? 0} towers · ${lb}</span></h3>
${full}</div>`;
  }
  index += `</div></body></html>`;
  fs.writeFileSync(path.join(OUT_V2, "index.html"), index);

  const slim = ok.map((p) => ({
    room: p.room,
    hub: p.hub,
    sitter: p.sitter, // push-plan.mjs ships this to the live segment
    labInputs: p.labInputs,
    structures: p.structures,
    meta: p.meta,
    sources: p.sources,
    controller: p.controller,
    mineral: p.mineral,
  }));
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
  console.log(
    `enclosed: controller ${withShell.filter((p) => p.shell.enclosedController).length}/${withShell.length} · ` +
      `sources ${withShell.reduce((s, p) => s + p.shell.enclosedSources, 0)}/${withShell.reduce((s, p) => s + p.sources.length, 0)}`,
  );
  console.log(`mobility ratio: mean-of-means ${avg(mobMean)} · worst room max ${Math.max(0, ...mobMax)}`);

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
  const escalated = ok.filter((p) => p.meta.seedSkip > 0);
  console.log(
    `seed escalation: ${escalated.length}/${ok.length} rooms left the top seed` +
      (escalated.length
        ? ` (${escalated.map((p) => `${p.room}:skip${p.meta.seedSkip} eco${p.meta.pathSourcesSum + p.meta.pathController}`).join(" ")})`
        : ""),
  );
}

main();
