/**
 * Per-room legality, film-vs-board, visual dump for hash-sample + churn.
 * Does not import validate.mjs. Round 37.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ANIM,
  D4,
  D8,
  K,
  KT,
  PAGES,
  cheb,
  depthFromExterior,
  floodExterior,
  hashedRooms,
  isWall,
  loadPlans,
  loadRooms,
  mineralSeat,
  structMap,
  tileAt,
  walkable,
} from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const hashed = hashedRooms(plans);
const sample = hashed.slice(0, 5).map((r) => r.room);
const churn = ["E11S1", "E2S7", "E1S4"];
const names = [...new Set([...sample, ...churn])];

const SEAT_OUT = "seat outside the shell — a container beyond the wall, covered where it stands";
const SEAT_IN_SHALLOW =
  "container cover — a container inside the shell on shallow floor, renting a rampart of its own";
const SEAT_IN_DEEP =
  "container cover — a container inside the shell at safe depth, renting a rampart of its own";

function labDiamond(plan) {
  const labs = plan.structures?.lab || [];
  if (labs.length !== 10) return { n: labs.length, ok: false };
  const xs = labs.map((l) => l.x);
  const ys = labs.map((l) => l.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const set = new Set(labs.map(K));
  const box16 = w === 4 && h === 4;
  let holes = 0;
  if (box16) {
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (!set.has(KT(x, y))) holes++;
  }
  const sitter = plan.sitter || plan.hub;
  const haul = Math.min(...labs.map((l) => cheb(l, sitter)));
  return { n: 10, bbox: [minX, minY, maxX, maxY], w, h, holes, box16, haul };
}

function hubTrio(plan) {
  const sitter = plan.sitter || plan.hub;
  const st = (plan.structures?.storage || [])[0];
  const tm = (plan.structures?.terminal || [])[0];
  const links = plan.structures?.link || [];
  const hubLink = links.find((l) => cheb(l, sitter) <= 1);
  const ok = sitter && st && tm && hubLink && cheb(st, sitter) <= 1 && cheb(tm, sitter) <= 1 && cheb(hubLink, sitter) <= 1;
  let spawnMin = 99;
  const spawns = plan.structures?.spawn || [];
  for (let i = 0; i < spawns.length; i++)
    for (let j = i + 1; j < spawns.length; j++) spawnMin = Math.min(spawnMin, cheb(spawns[i], spawns[j]));
  const angs = spawns.map((s) => (Math.atan2(s.y - sitter.y, s.x - sitter.x) * 180) / Math.PI);
  const seps = [];
  for (let i = 0; i < angs.length; i++)
    for (let j = i + 1; j < angs.length; j++) {
      let a = Math.abs(angs[i] - angs[j]);
      if (a > 180) a = 360 - a;
      seps.push(a);
    }
  return {
    sitter, storage: st, terminal: tm, hubLink, ok,
    spawnPairs: spawnMin === 99 ? null : spawnMin,
    spawnFanMin: seps.length ? Math.min(...seps) : null,
  };
}

function visual(plan) {
  const extn = plan.structures?.extension || [];
  const roads = new Set((plan.structures?.road || []).map(K));
  const ramp = new Set((plan.structures?.rampart || []).map(K));
  const occ = structMap(plan);
  let noD4 = 0;
  const noD4Tiles = [];
  for (const e of extn) {
    if (!D4.some(([dx, dy]) => roads.has(KT(e.x + dx, e.y + dy)))) {
      noD4++;
      noD4Tiles.push(K(e));
    }
  }
  let bricks2 = 0;
  for (const e of extn) {
    const a = occ.get(KT(e.x + 1, e.y)) || [];
    const b = occ.get(KT(e.x, e.y + 1)) || [];
    const c = occ.get(KT(e.x + 1, e.y + 1)) || [];
    if (a.includes("extension") && b.includes("extension") && c.includes("extension")) bricks2++;
  }
  const roadOnRamp = (plan.structures?.road || []).filter((r) => ramp.has(K(r)));
  const cut = new Set((plan.meta?.shell?.cut || []).map(K));
  const roadOnRampOnCut = roadOnRamp.filter((r) => cut.has(K(r))).length;
  const towers = plan.structures?.tower || [];
  const sitter = plan.sitter || plan.hub;
  const clump = towers.filter((t) => cheb(t, sitter) <= 2).length;
  return {
    ext: extn.length,
    roads: (plan.structures?.road || []).length,
    ramparts: (plan.structures?.rampart || []).length,
    noD4, noD4Tiles, bricks2,
    roadOnRamp: roadOnRamp.length,
    roadOnRampOnCut,
    clump,
    labs: labDiamond(plan),
    hub: hubTrio(plan),
  };
}

function enclosure(plan, terrain) {
  const cut = plan.meta?.shell?.cut || [];
  const freeze = plan.meta?.shell?.cutAtFreeze || [];
  const ramp = plan.structures?.rampart || [];
  const cutSet = new Set(cut.map(K));
  const freezeSet = new Set(freeze.map(K));
  const rampSet = new Set(ramp.map(K));
  const sitter = plan.sitter || plan.hub;
  const extCut = floodExterior(terrain, cutSet);
  const extFreeze = floodExterior(terrain, freezeSet);
  const extLive = floodExterior(terrain, rampSet);
  const si = sitter.x + sitter.y * 50;
  const coreTypes = ["spawn", "storage", "terminal", "tower", "nuker", "lab", "link", "extension"];
  const leakedLive = [];
  for (const t of coreTypes) {
    for (const p of plan.structures?.[t] || []) {
      if (extLive[p.x + p.y * 50]) leakedLive.push(`${t}@${K(p)}`);
    }
  }
  const depthLive = depthFromExterior(extLive);
  const shallowExt = [];
  for (const e of plan.structures?.extension || []) {
    const d = depthLive[e.x + e.y * 50];
    if (d < 4) shallowExt.push({ k: K(e), d, ramp: rampSet.has(K(e)) });
  }
  const redundant = [];
  const loadBearing = [];
  for (const t of cut) {
    const less = new Set(rampSet);
    less.delete(K(t));
    const e = floodExterior(terrain, less);
    if (e[si]) loadBearing.push(K(t));
    else redundant.push(K(t));
  }
  return {
    cutN: cut.length,
    freezeN: freeze.length,
    rampN: ramp.length,
    sitterLeaks: {
      throughCut: !!extCut[si],
      throughFreeze: !!extFreeze[si],
      throughLive: !!extLive[si],
    },
    leakedLive,
    shallowExt,
    pubShallow: plan.meta?.extensions?.shallow,
    redundant,
    loadBearingN: loadBearing.length,
    enclosedCtrl: plan.meta?.shell?.enclosedController,
    mobility: plan.meta?.walls?.mobility?.builtGated ?? plan.meta?.shell?.mobilityBuilt?.maxGated,
  };
}

function classifyRampart(plan, k, depthFreeze, extFreeze) {
  const [x, y] = k.split(",").map(Number);
  const cut = new Set((plan.meta?.shell?.cut || []).map(K));
  const denial = new Set((plan.meta?.shell?.standDenial || []).map(K));
  const occ = structMap(plan);
  const types = (occ.get(k) || []).filter((t) => t !== "rampart" && t !== "road");
  if (cut.has(k)) return { facet: "crossing", caption: "min-cut wall" };
  if (types.includes("container")) {
    const i = x + y * 50;
    const outside = !!extFreeze[i];
    if (outside) return { facet: "seat.outside", caption: SEAT_OUT };
    const deep = depthFreeze[i] >= 4;
    return { facet: "seat.inside", caption: deep ? SEAT_IN_DEEP : SEAT_IN_SHALLOW, depth: depthFreeze[i] };
  }
  if (denial.has(k)) return { facet: "ring", caption: "controller stand-denial ring" };
  if (types.length) {
    return {
      facet: "cover",
      caption: `personal cover — one ${types[0]} renting a rampart of its own`,
      occupant: types[0],
    };
  }
  return { facet: "unclassified", caption: "rampart this room's own taxonomy has no word for" };
}

function filmVsBoard(plan, terrain) {
  const fp = path.join(ANIM, `${plan.room}.json`);
  if (!fs.existsSync(fp)) return { missing: true };
  const film = JSON.parse(fs.readFileSync(fp, "utf8"));
  const freeze = new Set((plan.meta?.shell?.cutAtFreeze || []).map(K));
  const extFreeze = floodExterior(terrain, freeze);
  const depthFreeze = depthFromExterior(extFreeze);
  const painted = [];
  for (const st of film.steps || []) {
    if (st.stage !== "ramparts") continue;
    const cells = st.cells || [];
    const cap = (st.label || "").replace(/\s+\d+\/\d+$/, "");
    for (let i = 0; i < cells.length; i += 3) painted.push({ x: cells[i], y: cells[i + 1], caption: cap });
  }
  const disagrees = [];
  for (const t of painted) {
    const k = KT(t.x, t.y);
    const want = classifyRampart(plan, k, depthFreeze, extFreeze);
    if (t.caption !== want.caption) disagrees.push({ k, film: t.caption, board: want.caption, facet: want.facet });
  }
  const ramp = new Set((plan.structures?.rampart || []).map(K));
  const paintedSet = new Set(painted.map((t) => KT(t.x, t.y)));
  const unpainted = [...ramp].filter((k) => !paintedSet.has(k));
  const extra = [...paintedSet].filter((k) => !ramp.has(k));
  const facetCounts = {};
  for (const t of painted) {
    const want = classifyRampart(plan, KT(t.x, t.y), depthFreeze, extFreeze);
    facetCounts[want.facet] = (facetCounts[want.facet] || 0) + 1;
  }
  return {
    planHash: film.planHash,
    census: film.rampartCensus,
    painted: painted.length,
    disagrees,
    unpainted,
    extra,
    facetCounts,
    notes: film.notes || null,
  };
}

function pageBits(room) {
  const fp = path.join(PAGES, `${room}.html`);
  if (!fs.existsSync(fp)) return { missing: true };
  const html = fs.readFileSync(fp, "utf8");
  const sub = (html.match(/<p class="sub">([\s\S]*?)<\/p>/) || [])[1] || "";
  const counts = (sub.match(/<b class="ok">([^<]+)<\/b>/) || [])[1] || "";
  const mobSub = [...html.matchAll(/class="mob-sub"[^>]*>([\s\S]*?)<\//g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
  const notesMap = (html.match(/const NOTES\s*=\s*(\{[\s\S]*?\});/) || [])[1];
  let notes = null;
  if (notesMap) {
    try { notes = Function(`return (${notesMap})`)(); } catch { notes = { parseFail: true }; }
  }
  return { counts, mobSub: mobSub.slice(0, 6), notes };
}

function ascii(plan, terrain, pad = 1) {
  const occ = structMap(plan);
  const glyphs = {
    extension: "E", spawn: "S", tower: "T", lab: "L", storage: "O", terminal: "M",
    link: "K", nuker: "N", observer: "V", container: "C", extractor: "X", road: "=", rampart: "#",
  };
  const pts = [];
  for (const t of Object.keys(plan.structures || {})) for (const p of plan.structures[t] || []) pts.push(p);
  if (plan.controller) pts.push(plan.controller);
  if (plan.mineral) pts.push(plan.mineral);
  for (const s of plan.sources || []) pts.push(s);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.max(0, Math.min(...xs) - pad), x1 = Math.min(49, Math.max(...xs) + pad);
  const y0 = Math.max(0, Math.min(...ys) - pad), y1 = Math.min(49, Math.max(...ys) + pad);
  const lines = [];
  for (let y = y0; y <= y1; y++) {
    let row = "";
    for (let x = x0; x <= x1; x++) {
      const k = KT(x, y);
      let g = ".";
      if (isWall(terrain, x, y)) g = "W";
      else if ((tileAt(terrain, x, y) & 2) > 0) g = "~";
      const types = occ.get(k) || [];
      const prio = ["spawn", "storage", "terminal", "nuker", "lab", "tower", "link", "observer", "extractor", "container", "extension", "road", "rampart"];
      for (const t of prio) {
        if (types.includes(t)) { g = glyphs[t]; break; }
      }
      if (plan.controller && plan.controller.x === x && plan.controller.y === y) g = "@";
      if (plan.mineral && plan.mineral.x === x && plan.mineral.y === y) g = "*";
      if ((plan.sources || []).some((s) => s.x === x && s.y === y)) g = "$";
      if (plan.sitter && plan.sitter.x === x && plan.sitter.y === y) g = "+";
      row += g;
    }
    lines.push(row);
  }
  return { x0, y0, x1, y1, lines };
}

const out = [];
for (const name of names) {
  const plan = plans.find((p) => p.room === name);
  const d = byRoom.get(name);
  if (!plan || !d) {
    out.push({ room: name, missing: !plan ? "plan" : "terrain" });
    continue;
  }
  const seat = mineralSeat(plan);
  const vis = visual(plan);
  const enc = enclosure(plan, d.terrain);
  const film = filmVsBoard(plan, d.terrain);
  const page = pageBits(name);
  const approach = seat
    ? D8.some(([dx, dy]) => walkable(d.terrain, seat.x + dx, seat.y + dy))
    : false;
  const notesFilm = [];
  const htmlNotes = page.notes || {};
  if (htmlNotes.seed && plan.seed) {
    const want = `seed (${plan.seed.x},${plan.seed.y}) → hub (${plan.hub.x},${plan.hub.y})`;
    if (htmlNotes.seed !== want) notesFilm.push({ ch: "seed", page: htmlNotes.seed, want });
  }
  out.push({
    room: name,
    hashed: sample.includes(name),
    sitter: plan.sitter,
    hub: plan.hub,
    seed: plan.seed,
    seedScore: plan.meta?.seedScore,
    protectRadius: plan.meta?.shell?.protectRadius,
    baseCut: plan.meta?.shell?.baseCut,
    vis,
    enc,
    mineral: {
      mineral: plan.mineral,
      seat,
      pubSeat: plan.meta?.mineralSeat,
      approach,
      off: plan.meta?.misc?.mineralOffNetwork,
      bubble: plan.meta?.misc?.mineralBubble,
    },
    film: {
      missing: film.missing || false,
      disagrees: film.disagrees || [],
      unpainted: film.unpainted || [],
      extra: film.extra || [],
      facetCounts: film.facetCounts || {},
      census: film.census,
    },
    page: { counts: page.counts, mobSub: page.mobSub, notesFilm },
    ascii: ascii(plan, d.terrain, 1),
    shortfalls: (plan.meta?.shortfalls || []).map((s) => ({ gate: s.gate, kind: s.kind })),
    notes: (plan.meta?.noteRecords || []).map((n) => n.cls),
    drift: (plan.meta?.shell?.cutDrift || []).map((e) => `${e.op} ${K(e)} ${e.pass}`),
  });
}

fs.writeFileSync(path.join(DIR, "sample.json"), JSON.stringify(out, null, 2));
const brief = out.map((r) => ({
  room: r.room,
  hashed: r.hashed,
  cut: r.enc?.cutN,
  freeze: r.enc?.freezeN,
  ramp: r.enc?.rampN,
  roads: r.vis?.roads,
  ext: r.vis?.ext,
  leak: r.enc?.sitterLeaks,
  leakedLive: r.enc?.leakedLive,
  shallow: r.enc?.shallowExt?.length,
  pubShallow: r.enc?.pubShallow,
  redundant: r.enc?.redundant?.length,
  noD4: r.vis?.noD4,
  bricks2: r.vis?.bricks2,
  roadOnRamp: r.vis?.roadOnRamp,
  clump: r.vis?.clump,
  haul: r.vis?.labs?.haul,
  holes: r.vis?.labs?.holes,
  hubOk: r.vis?.hub?.ok,
  filmDis: (r.film?.disagrees || []).length,
  unpainted: (r.film?.unpainted || []).length,
  extra: (r.film?.extra || []).length,
  facets: r.film?.facetCounts,
  page: r.page?.counts,
  notesFilm: r.page?.notesFilm,
  mineralOn: r.mineral?.off === false,
  shortfalls: r.shortfalls,
  notes: r.notes,
  seed: r.seed,
  hub: r.hub,
  baseCut: r.baseCut,
  protect: r.protectRadius,
}));
console.log(JSON.stringify({ sample, rooms: brief }, null, 2));
