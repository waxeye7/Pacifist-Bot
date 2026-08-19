/**
 * _test-eco-bill.mjs — a harness for THE ECO BILL and its ledger (layer-shell.mjs).
 *
 * Part 1: synthetic rooms with hand-carved terrain, where the wall cost of every
 * enclosure is an exact, countable number of corridor tiles, so the bid arithmetic
 * (bill = |cut ∪ bubbles| + mineral dues + uncoverable works) can be asserted to
 * the tile instead of eyeballed.
 *
 * Part 2 (optional): the same ledger invariants over the shipped fleet artifact
 * tools/plan-suite/out-v2/plans-hub.json, with terrain from $ROOMS_FILE.
 *
 * Run:  fnm exec --using 22 node tools/plan-suite/v2/_test-eco-bill.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planShell, depthFromExterior } from "./layer-shell.mjs";
import { key, walkable, chebyshev, exteriorFlood, borderLegal, D8 } from "./shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// mirrors of layer-shell.mjs constants — this file may not import private ones
const DEPTH_SAFE = 4;
const ECO_TIE_MAX_STRETCH = 4; // a tie is taken only while the wall grows by <= this
const OLD_CTRL_BUDGET = 4; // the fixed extra-cut budget the bill replaced

// ---------------------------------------------------------------------------
// terrain / plan construction
// ---------------------------------------------------------------------------
const ix = (x, y) => y * 50 + x;
const blank = () => new Uint8Array(2500).fill(1);
const open = (t, x0, y0, x1, y1) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t[ix(x, y)] = 0;
};
const seal = (t, x, y) => {
  t[ix(x, y)] = 1;
};
const asTerrain = (t) => Array.from(t).join("");

/** the hall every synthetic room is built around: hub basin + one north exit */
function hall(t) {
  open(t, 10, 10, 28, 30); // the hall
  open(t, 19, 0, 19, 9); // its single exit corridor to the north edge
  return t;
}

const HUB = {
  storage: { x: 20, y: 20 },
  terminal: { x: 21, y: 20 },
  hubLink: { x: 19, y: 20 },
  spawns: [
    { x: 19, y: 19 },
    { x: 20, y: 19 },
    { x: 21, y: 19 },
  ],
  sitter: { x: 20, y: 21 },
};

/** the layer-1 plan shape planShell reads (see planHub's return) */
function buildPlan(terrain, o) {
  const containers = [...(o.seats || [])];
  if (o.ctrlContainer) containers.push(o.ctrlContainer);
  const links = [HUB.hubLink, ...(o.srcLinks || []), o.ctrlLink];
  const basin = [];
  for (let y = 10; y <= 30; y++) {
    for (let x = 10; x <= 28; x++) {
      if (!walkable(terrain, x, y)) continue;
      basin.push({ x, y, d: chebyshev({ x, y }, HUB.storage) });
    }
  }
  basin.sort((a, b) => a.d - b.d);
  const objectTiles = new Set([
    ...o.sources.map((s) => key(s.x, s.y)),
    key(o.controller.x, o.controller.y),
  ]);
  if (o.mineral) objectTiles.add(key(o.mineral.x, o.mineral.y));
  return {
    room: o.room || "SYN",
    terrain,
    structures: {
      storage: [HUB.storage],
      terminal: [HUB.terminal],
      link: links,
      container: containers,
      spawn: HUB.spawns,
      road: [],
    },
    sitter: HUB.sitter,
    basin,
    sources: o.sources,
    controller: o.controller,
    mineral: o.mineral || null,
    mineralSeat: o.mineralSeat || null,
    objectTiles,
    meta: { pathController: o.pathController ?? 8, shortfalls: [] },
  };
}

// ---------------------------------------------------------------------------
// assertions / reporting
// ---------------------------------------------------------------------------
let scenariosRun = 0;
let scenariosFailed = 0;
const discrepancies = [];

function fmtTiles(list) {
  return (list || []).map((p) => `${p.x},${p.y}`).join(" ");
}
function fmtRow(row) {
  const cands = row.candidates
    .map(
      (c) =>
        `${c.label}:${c.verdict}${c.reason ? "/" + c.reason : ""}` +
        `(cut=${c.cut} bill=${c.bill}${c.after !== undefined ? " after=" + c.after : ""}` +
        `${c.deep !== undefined ? " deep=" + c.deep : ""}${c.credit ? " credit=" + c.credit : ""}` +
        `${c.reach !== undefined ? " reach=" + c.reach : ""}` +
        `${c.mobility !== undefined ? " mob=" + c.mobility : ""})`,
    )
    .join(" | ");
  return (
    `    ${row.site} [${row.kind}] vs cut=${row.cut} bill=${row.bill} ` +
    `before=${row.before} after=${row.after} accepted=${row.accepted}\n` +
    (cands ? `        ${cands}\n` : "")
  );
}
function dumpLedger(res) {
  const s = res.shell;
  let out = `    ecoBill base=${s.ecoBill.base} traded=${s.ecoBill.traded} shipped=${s.ecoBill.shipped} ramparts=${s.ecoBill.ramparts}\n`;
  out += `    cut(${s.cut.length}) = ${fmtTiles(s.cut)}\n`;
  out += `    bubble(${s.bubble.length}) = ${fmtTiles(s.bubble)}\n`;
  out += `    mineralDue = ${fmtTiles(s.ecoBill.mineralDue)}  uncoverable = ${fmtTiles(s.ecoBill.uncoverable)}\n`;
  out += `    standDenial(${s.standDenial.length}) = ${fmtTiles(s.standDenial)}\n`;
  for (const row of s.ecoLedger) out += fmtRow(row);
  return out;
}

/** run one scenario; `fn` returns { line, errs } */
function scenario(name, fn) {
  scenariosRun++;
  let out;
  try {
    out = fn();
  } catch (e) {
    scenariosFailed++;
    console.log(`FAIL ${name}\n    threw: ${e.stack}`);
    discrepancies.push({ name, errs: [`threw: ${e.message}`] });
    return;
  }
  const errs = out.errs || [];
  if (errs.length) {
    scenariosFailed++;
    console.log(`FAIL ${name}  ${out.line}`);
    for (const e of errs) console.log(`      - ${e}`);
    if (out.dump) console.log(out.dump);
    discrepancies.push({ name, errs, dump: out.dump, line: out.line });
  } else {
    console.log(`PASS ${name}  ${out.line}`);
  }
}

// ---------------------------------------------------------------------------
// the invariants every scenario (and every fleet room) must hold
// ---------------------------------------------------------------------------
/**
 * @param res    the planShell return
 * @param terrain the terrain string
 * @param plan   the plan handed to planShell
 */
function ledgerInvariants(res, terrain, plan) {
  const errs = [];
  const s = res.shell;
  const b = s.ecoBill;
  if (!(b.traded <= b.base)) errs.push(`ecoBill.traded ${b.traded} > base ${b.base}`);
  if (!(b.shipped <= b.traded)) errs.push(`ecoBill.shipped ${b.shipped} > traded ${b.traded}`);
  for (const row of s.ecoLedger) {
    if (!(row.after <= row.before)) errs.push(`${row.site}: after ${row.after} > before ${row.before}`);
    for (const c of row.candidates) {
      if (c.verdict === "accepted") {
        const credit = c.credit || 0;
        const premium = c.premium || 0;
        if (!(c.bill <= row.bill)) {
          if (credit > 0 && c.bill - credit <= row.bill) {
            // the DEEP_CREDIT rule: a starved room may pay a rampart for deep tiles
            creditedAccepts.push(`${row.site}/${c.label}: bill ${c.bill} > ${row.bill}, credit ${credit}`);
          } else if (premium > 0 && c.bill - credit - row.bill <= premium && typeof c.mobility === "number") {
            // the owner's MOBILITY PREMIUM: a room past the buy floor may pay
            // for a bid that shortens its gated lap (mobilityAllowance)
            premiumAccepts.push(`${row.site}/${c.label}: bill ${c.bill} > ${row.bill}, premium ${premium}, lap ${c.mobility}`);
          } else {
            errs.push(`${row.site}/${c.label}: accepted at bill ${c.bill} > row bill ${row.bill}`);
          }
        }
      }
      if (c.reason === "price") errs.push(...priceRefusalOk(`${row.site}/${c.label}`, row, c));
    }
  }
  // the literal rampart count is the deduped union of cut and bubbles
  const union = new Set([...s.cut, ...s.bubble].map((p) => key(p.x, p.y)));
  if (b.ramparts !== union.size) errs.push(`ecoBill.ramparts ${b.ramparts} != |cut ∪ bubble| ${union.size}`);
  if (b.ramparts !== res.rampart.length) {
    errs.push(`ecoBill.ramparts ${b.ramparts} != rampart.length ${res.rampart.length}`);
  }

  // --- what the shipped cut leaves exposed must carry a rampart ---
  const cutSet = new Set(s.cut.map((p) => key(p.x, p.y)));
  const ext = exteriorFlood(terrain, cutSet);
  const depth = depthFromExterior(ext);
  const rampSet = new Set(res.rampart.map((p) => key(p.x, p.y)));
  const exposed = (p) => !!ext[ix(p.x, p.y)] || depth[ix(p.x, p.y)] < DEPTH_SAFE;
  const links = plan.structures.link || [];
  const ctrlLink = links.length > 1 ? links[links.length - 1] : null;
  const srcLinks = links.slice(1, Math.max(1, links.length - 1));
  const works = [];
  for (const s0 of plan.sources) {
    for (const c of plan.structures.container || []) if (chebyshev(c, s0) <= 1) works.push(["seat", c]);
    for (const l of srcLinks) if (chebyshev(l, s0) <= 2) works.push(["srcLink", l]);
  }
  if (ctrlLink) works.push(["ctrlLink", ctrlLink]);
  for (const [what, p] of works) {
    if (!exposed(p)) continue;
    if (!borderLegal(terrain, p.x, p.y, "rampart")) continue; // border-illegal: declared, not shipped
    if (!rampSet.has(key(p.x, p.y))) {
      errs.push(
        `${what} at ${p.x},${p.y} is exposed under the shipped cut ` +
          `(ext=${!!ext[ix(p.x, p.y)]} depth=${depth[ix(p.x, p.y)]}) and carries no rampart`,
      );
    }
  }

  // --- enclosedController is exactly "link inside AND every walkable ring tile inside" ---
  const ring = [];
  for (const [dx, dy] of D8) {
    const x = plan.controller.x + dx,
      y = plan.controller.y + dy;
    if (walkable(terrain, x, y)) ring.push({ x, y });
  }
  const encl = (!ctrlLink || !ext[ix(ctrlLink.x, ctrlLink.y)]) && ring.every((p) => !ext[ix(p.x, p.y)]);
  if (encl !== s.enclosedController) {
    errs.push(`enclosedController ${s.enclosedController} but link+ring inside says ${encl}`);
  }
  // stand denial is the ring, and only when the controller is NOT enclosed
  if (s.enclosedController && s.standDenial.length) {
    errs.push(`enclosedController but standDenial has ${s.standDenial.length} tiles`);
  }
  if (!s.enclosedController && s.standDenial.length !== ring.length) {
    errs.push(`controller not enclosed: standDenial ${s.standDenial.length} != walkable ring ${ring.length}`);
  }
  // the mineral works are PRICED here and EMITTED by layer 5 — never bubbled here
  const bubbleSet = new Set(s.bubble.map((p) => key(p.x, p.y)));
  for (const p of [plan.mineral, plan.mineralSeat]) {
    if (p && bubbleSet.has(key(p.x, p.y))) errs.push(`mineral work ${p.x},${p.y} is in shell.bubble (layer 5 owns it)`);
  }
  return errs;
}
const creditedAccepts = [];
const creditedRooms = [];
const premiumAccepts = [];
const premiumRooms = [];
const tieRefusals = [];

/**
 * A "price" refusal is legitimate in exactly two cases: the bill (net of the
 * deep credit) is strictly higher than the one it was bid against, or it TIES
 * and the wall would grow by more than ECO_TIE_MAX_STRETCH tiles. A tie inside
 * the stretch cap, or a strictly CHEAPER bill, refused on price is a bug.
 */
function priceRefusalOk(where, row, c) {
  const credit = c.credit || 0;
  const net = c.bill - credit;
  if (net > row.bill) return [];
  if (net < row.bill) {
    return [`${where}: refused "price" at bill ${c.bill}${credit ? "-" + credit : ""} < row bill ${row.bill}`];
  }
  const stretch = c.cut - row.cut;
  if (stretch > ECO_TIE_MAX_STRETCH) {
    tieRefusals.push(`${where}: tie at bill ${row.bill}, stretch ${stretch} > ${ECO_TIE_MAX_STRETCH}`);
    return [];
  }
  return [
    `${where}: tie refused "price" at bill ${c.bill} == row bill ${row.bill} ` +
      `with stretch ${stretch} <= ECO_TIE_MAX_STRETCH ${ECO_TIE_MAX_STRETCH} (ties go to enclosure)`,
  ];
}

const rowFor = (res, pred) => res.shell.ecoLedger.find(pred);
const candFor = (row, label) => row && row.candidates.find((c) => c.label === label);

// ===========================================================================
// SCENARIO A — SOURCE TRADE. A source pocket behind a 1-wide corridor; K
// 1-wide corridors leave the pocket for the room edge. Base wall = 2 (the
// hall's north exit + the hall<->pocket corridor) and the seat and the link
// are outside, so base bill = 2 + 2 = 4. Enclosing the pocket costs
// 1 (north) + K. The bid must be taken while 1 + K <= 4 and refused after.
// ===========================================================================
function sourcePocketRoom(K, { connectToHall = true } = {}) {
  const t = blank();
  hall(t);
  seal(t, 14, 20); // the controller, a wall island inside the hall
  open(t, 33, 17, 37, 20); // the source pocket
  if (connectToHall) open(t, 29, 18, 32, 18); // hall <-> pocket, 1 wide
  const exits = [
    () => open(t, 38, 17, 49, 17),
    () => open(t, 38, 19, 49, 19),
    () => open(t, 33, 21, 33, 49),
    () => open(t, 37, 21, 37, 49),
    () => open(t, 33, 0, 33, 16),
  ];
  if (K > exits.length) throw new Error(`only ${exits.length} pocket exits are carved`);
  for (let i = 0; i < K; i++) exits[i]();
  seal(t, 35, 16); // the source itself sits on wall terrain, as in the real game
  const terrain = asTerrain(t);
  const plan = buildPlan(terrain, {
    room: `SRC-K${K}`,
    sources: [{ x: 35, y: 16 }],
    seats: [{ x: 35, y: 17 }],
    srcLinks: [{ x: 35, y: 18 }],
    controller: { x: 14, y: 20 },
    ctrlLink: { x: 16, y: 20 },
    ctrlContainer: { x: 13, y: 20 },
  });
  return { terrain, plan };
}

function runSourceTrade(K) {
  const { terrain, plan } = sourcePocketRoom(K);
  const res = planShell(terrain, plan, { needDeep: 10 });
  if (res.error) return { line: `planShell error: ${res.error}`, errs: [res.error] };
  const s = res.shell;
  const row = rowFor(res, (r) => r.kind === "source");
  const deep = candFor(row, "deep");
  const errs = ledgerInvariants(res, terrain, plan);
  const wantAccept = 1 + K <= 4;
  const line =
    `K=${K} base(cut=${s.baseCut} bill=${s.ecoBill.base}) ` +
    `deep(cut=${deep ? deep.cut : "-"} bill=${deep ? deep.bill : "-"}) ` +
    `-> accepted=${row ? row.accepted : "-"} before=${row ? row.before : "-"} after=${row ? row.after : "-"} ` +
    `srcEnclosed=${s.srcEnclosed[0]} shipped=${s.ecoBill.shipped}`;
  if (!row) errs.push("no source row in ecoLedger");
  if (s.baseCut !== 2) errs.push(`base cut ${s.baseCut} != 2 (north exit + hall<->pocket corridor)`);
  if (s.ecoBill.base !== 4) errs.push(`ecoBill.base ${s.ecoBill.base} != 4 (2 wall + seat + link)`);
  if (row) {
    if (row.bill !== 4) errs.push(`source row priced against bill ${row.bill} != 4`);
    if (row.before !== 2) errs.push(`source owes ${row.before} != 2 (seat + link) before the bid`);
  }
  if (!deep) errs.push('no "deep" candidate for the source');
  else {
    if (deep.cut !== 1 + K) errs.push(`deep cut ${deep.cut} != ${1 + K} (north exit + ${K} pocket exits)`);
    if (deep.bill !== 1 + K) errs.push(`deep bill ${deep.bill} != ${1 + K} (no bubbles once enclosed)`);
  }
  if (wantAccept) {
    if (!row || row.accepted === null) errs.push(`bid refused at bill ${1 + K} <= 4 — it must be taken`);
    if (row && row.after !== 0) errs.push(`source still owes ${row.after} after enclosure`);
    if (!s.srcEnclosed[0]) errs.push("source not strictly enclosed after an accepted bid");
    const bub = new Set(s.bubble.map((p) => key(p.x, p.y)));
    if (bub.has("35,17") || bub.has("35,18")) errs.push("seat/link still carry a bubble inside the wall");
    if (s.ecoBill.traded !== 1 + K) errs.push(`traded bill ${s.ecoBill.traded} != ${1 + K}`);
  } else {
    if (row && row.accepted !== null) errs.push(`bid accepted at bill ${1 + K} > 4`);
    if (row && row.after !== 2) errs.push(`source owes ${row.after} != 2 after a refusal`);
    if (s.srcEnclosed[0]) errs.push("source enclosed although every bid was refused");
    for (const c of row ? row.candidates : []) {
      if (c.verdict === "accepted") continue;
      if (c.reason !== "price") errs.push(`candidate ${c.label} refused "${c.reason}", expected "price"`);
    }
    const bub = new Set(s.bubble.map((p) => key(p.x, p.y)));
    if (!bub.has("35,17") || !bub.has("35,18")) errs.push("seat/link outside the wall but not bubbled");
    if (s.ecoBill.traded !== 4) errs.push(`traded bill ${s.ecoBill.traded} != 4 (nothing bought)`);
  }
  return { line, errs, dump: dumpLedger(res) };
}

// ===========================================================================
// SCENARIO A2 — TIE STRETCH. Ties go to the enclosure, but a tie may not
// RESHAPE the base: it is taken only while the wall grows by at most
// ECO_TIE_MAX_STRETCH tiles. A source carrying W works retires W bubbles, so
// the tie sits at K = W + 1 exits and the stretch is exactly W. W = 4 must be
// bought, W = 5 must be refused, and both are ties on the bill.
// ===========================================================================
function tieStretchRoom(works) {
  const K = works + 1;
  const t = blank();
  hall(t);
  seal(t, 14, 20);
  open(t, 33, 17, 37, 20); // the source pocket
  open(t, 29, 18, 32, 18); // hall <-> pocket
  const exits = [
    () => open(t, 38, 17, 49, 17),
    () => open(t, 38, 19, 49, 19),
    () => open(t, 33, 21, 33, 49),
    () => open(t, 37, 21, 37, 49),
    () => open(t, 33, 0, 33, 16),
    () => open(t, 35, 21, 35, 49),
  ];
  if (K > exits.length) throw new Error(`only ${exits.length} pocket exits are carved`);
  for (let i = 0; i < K; i++) exits[i]();
  seal(t, 35, 16); // the source, on wall terrain
  const terrain = asTerrain(t);
  // three seats (the source's whole walkable ring) and one or two links
  const srcLinks = works === 5 ? [{ x: 34, y: 18 }, { x: 36, y: 18 }] : [{ x: 35, y: 18 }];
  const plan = buildPlan(terrain, {
    room: `TIE-W${works}`,
    sources: [{ x: 35, y: 16 }],
    seats: [
      { x: 34, y: 17 },
      { x: 35, y: 17 },
      { x: 36, y: 17 },
    ],
    srcLinks,
    controller: { x: 14, y: 20 },
    ctrlLink: { x: 16, y: 20 },
    ctrlContainer: { x: 13, y: 20 },
  });
  return { terrain, plan, K };
}

function runTieStretch(works) {
  const { terrain, plan, K } = tieStretchRoom(works);
  const res = planShell(terrain, plan, { needDeep: 10 });
  if (res.error) return { line: `planShell error: ${res.error}`, errs: [res.error] };
  const s = res.shell;
  const row = rowFor(res, (r) => r.kind === "source");
  const deep = candFor(row, "deep");
  const errs = ledgerInvariants(res, terrain, plan);
  const stretch = deep ? deep.cut - (row ? row.cut : 0) : null;
  const wantAccept = works <= ECO_TIE_MAX_STRETCH;
  const line =
    `works=${works} K=${K} base(cut=${s.baseCut} bill=${s.ecoBill.base}) ` +
    `deep(cut=${deep ? deep.cut : "-"} bill=${deep ? deep.bill : "-"} stretch=${stretch}) ` +
    `-> accepted=${row ? row.accepted : "-"} before=${row ? row.before : "-"} after=${row ? row.after : "-"}`;
  if (!row) errs.push("no source row in ecoLedger");
  if (s.baseCut !== 2) errs.push(`base cut ${s.baseCut} != 2`);
  if (s.ecoBill.base !== 2 + works) errs.push(`ecoBill.base ${s.ecoBill.base} != ${2 + works}`);
  if (row && row.before !== works) errs.push(`source owes ${row.before} != ${works} before the bid`);
  if (!deep) errs.push('no "deep" candidate');
  else {
    if (deep.bill !== s.ecoBill.base) errs.push(`deep bill ${deep.bill} != base bill ${s.ecoBill.base} — not a tie`);
    if (stretch !== works) errs.push(`stretch ${stretch} != ${works}`);
  }
  if (wantAccept) {
    if (row && row.accepted === null) errs.push(`tie refused at stretch ${stretch} <= ${ECO_TIE_MAX_STRETCH}`);
    if (row && row.after !== 0) errs.push(`source still owes ${row.after} after enclosure`);
  } else {
    if (row && row.accepted !== null) errs.push(`tie accepted at stretch ${stretch} > ${ECO_TIE_MAX_STRETCH}`);
    if (row && row.after !== works) errs.push(`source owes ${row.after} != ${works} after a refusal`);
    if (deep && deep.reason !== "price") errs.push(`deep refused "${deep.reason}", expected "price"`);
  }
  return { line, errs, dump: dumpLedger(res) };
}

// ===========================================================================
// SCENARIO B — CONTROLLER. Its 8-tile walkable ring, its link and its
// container are all outside: 10 personal ramparts on top of a 2-tile wall.
// The bill lets the shell buy an enclosure worth EIGHT extra cut tiles, far
// past the fixed budget of 4 the old code had.
// ===========================================================================
function ctrlPocketRoom(K, { narrowRing = false } = {}) {
  const t = blank();
  hall(t);
  seal(t, 24, 14); // a source inside the hall (already covered, so it does not bid)
  open(t, 32, 18, 38, 22); // the controller chamber
  open(t, 29, 20, 31, 20); // hall <-> chamber, 1 wide
  const exits = narrowRing
    ? [
        () => open(t, 39, 18, 49, 18),
        () => open(t, 39, 20, 49, 20),
        () => open(t, 39, 22, 49, 22),
        () => open(t, 33, 23, 33, 49),
        () => open(t, 35, 23, 35, 49),
        () => open(t, 37, 23, 37, 49),
        () => open(t, 33, 0, 33, 17),
        () => open(t, 37, 0, 37, 17),
      ]
    : [
        () => open(t, 39, 18, 49, 18),
        () => open(t, 39, 20, 49, 20),
        () => open(t, 39, 22, 49, 22),
        () => open(t, 33, 0, 33, 17),
        () => open(t, 35, 0, 35, 17),
        () => open(t, 37, 0, 37, 17),
        () => open(t, 33, 23, 33, 49),
        () => open(t, 35, 23, 35, 49),
        () => open(t, 37, 23, 37, 49),
      ];
  if (K > exits.length) throw new Error(`only ${exits.length} chamber exits are carved`);
  for (let i = 0; i < K; i++) exits[i]();
  const ctrl = narrowRing ? { x: 35, y: 17 } : { x: 35, y: 20 };
  seal(t, ctrl.x, ctrl.y);
  const terrain = asTerrain(t);
  const plan = buildPlan(terrain, {
    room: `CTRL-K${K}${narrowRing ? "-narrow" : ""}`,
    sources: [{ x: 24, y: 14 }],
    seats: [{ x: 24, y: 15 }],
    srcLinks: [{ x: 25, y: 16 }],
    controller: ctrl,
    ctrlLink: narrowRing ? { x: 36, y: 19 } : { x: 37, y: 20 },
    ctrlContainer: narrowRing ? { x: 34, y: 19 } : { x: 33, y: 20 },
  });
  return { terrain, plan };
}

function runCtrlAccept(K) {
  const { terrain, plan } = ctrlPocketRoom(K);
  const res = planShell(terrain, plan, { needDeep: 10 });
  if (res.error) return { line: `planShell error: ${res.error}`, errs: [res.error] };
  const s = res.shell;
  const row = rowFor(res, (r) => r.kind === "controller");
  const acc = row && row.candidates.find((c) => c.verdict === "accepted");
  const errs = ledgerInvariants(res, terrain, plan);
  const line =
    `K=${K} base(cut=${s.baseCut} bill=${s.ecoBill.base}) ` +
    `accepted=${row ? row.accepted : "-"}(cut=${acc ? acc.cut : "-"} bill=${acc ? acc.bill : "-"}) ` +
    `before=${row ? row.before : "-"} after=${row ? row.after : "-"} ` +
    `enclosedController=${s.enclosedController} standDenial=${s.standDenial.length} ` +
    `extraCut=${acc ? acc.cut - s.baseCut : "-"} (old budget ${OLD_CTRL_BUDGET})`;
  if (!row) errs.push("no controller row in ecoLedger");
  if (s.baseCut !== 2) errs.push(`base cut ${s.baseCut} != 2`);
  if (s.ecoBill.base !== 12) errs.push(`ecoBill.base ${s.ecoBill.base} != 12 (2 wall + 8 ring + link + container)`);
  if (row) {
    if (row.before !== 10) errs.push(`controller owes ${row.before} != 10 before the bid`);
    if (row.accepted === null) errs.push(`controller enclosure refused at 1+K=${1 + K} <= 12`);
    if (row.after !== 0) errs.push(`controller still owes ${row.after} after enclosure`);
  }
  if (acc && acc.cut !== 1 + K) errs.push(`accepted cut ${acc.cut} != ${1 + K}`);
  if (acc && acc.bill !== 1 + K) errs.push(`accepted bill ${acc.bill} != ${1 + K}`);
  if (acc && acc.cut - s.baseCut <= OLD_CTRL_BUDGET) {
    errs.push(`extra cut ${acc.cut - s.baseCut} is inside the old fixed budget — scenario proves nothing`);
  }
  if (!s.enclosedController) errs.push("controller not enclosed after an accepted bid");
  if (s.standDenial.length !== 0) errs.push(`standDenial ${s.standDenial.length} != 0 when enclosed`);
  return { line, errs, dump: dumpLedger(res) };
}

function runCtrlRefuse(K) {
  const { terrain, plan } = ctrlPocketRoom(K, { narrowRing: true });
  const res = planShell(terrain, plan, { needDeep: 10 });
  if (res.error) return { line: `planShell error: ${res.error}`, errs: [res.error] };
  const s = res.shell;
  const row = rowFor(res, (r) => r.kind === "controller");
  const errs = ledgerInvariants(res, terrain, plan);
  const priced = row ? row.candidates.filter((c) => c.reason === "price") : [];
  const line =
    `K=${K} base(cut=${s.baseCut} bill=${s.ecoBill.base}) ` +
    `accepted=${row ? row.accepted : "-"} before=${row ? row.before : "-"} after=${row ? row.after : "-"} ` +
    `priceRefusals=${priced.map((c) => `${c.label}@${c.bill}`).join(",")} ` +
    `enclosedController=${s.enclosedController} standDenial=${s.standDenial.length}`;
  if (!row) errs.push("no controller row in ecoLedger");
  if (s.baseCut !== 2) errs.push(`base cut ${s.baseCut} != 2`);
  if (s.ecoBill.base !== 7) errs.push(`ecoBill.base ${s.ecoBill.base} != 7 (2 wall + 3 ring + link + container)`);
  if (row) {
    if (row.before !== 5) errs.push(`controller owes ${row.before} != 5 before the bid`);
    if (row.accepted !== null) errs.push(`controller enclosure accepted at 1+K=${1 + K} > 7`);
    if (row.after !== 5) errs.push(`controller owes ${row.after} != 5 after a refusal`);
    if (!priced.length) errs.push('no candidate refused with reason "price"');
  }
  if (s.enclosedController) errs.push("controller enclosed although every bid was refused");
  if (s.standDenial.length !== 3) errs.push(`standDenial ${s.standDenial.length} != 3 (the walkable ring)`);
  const rampSet = new Set(res.rampart.map((p) => key(p.x, p.y)));
  for (const k of ["34,18", "35,18", "36,18", "34,19", "36,19"]) {
    if (!rampSet.has(k)) errs.push(`stand-denial/work tile ${k} carries no rampart`);
  }
  return { line, errs, dump: dumpLedger(res) };
}

// ===========================================================================
// SCENARIO C — MINERAL. The mineral sits on wall terrain, so no rampart can
// ever cover it: exposed it is worth 1 mineral due (the seat, which layer 5
// will bubble) + 1 uncoverable (the extractor tile). Two bill points for an
// exposed mineral, and NEITHER tile may appear in shell.bubble.
// ===========================================================================
function mineralPocketRoom(K) {
  const t = blank();
  hall(t);
  seal(t, 14, 20); // controller island in the hall
  seal(t, 24, 14); // source island in the hall
  open(t, 33, 18, 37, 22); // the mineral chamber
  open(t, 29, 20, 32, 20); // hall <-> chamber, 1 wide
  const exits = [
    () => open(t, 38, 20, 49, 20),
    () => open(t, 33, 0, 33, 17),
    () => open(t, 33, 23, 33, 49),
    () => open(t, 37, 0, 37, 17),
  ];
  if (K > exits.length) throw new Error(`only ${exits.length} chamber exits are carved`);
  for (let i = 0; i < K; i++) exits[i]();
  seal(t, 35, 20); // the mineral, on wall terrain
  const terrain = asTerrain(t);
  const plan = buildPlan(terrain, {
    room: `MIN-K${K}`,
    sources: [{ x: 24, y: 14 }],
    seats: [{ x: 24, y: 15 }],
    srcLinks: [{ x: 25, y: 16 }],
    controller: { x: 14, y: 20 },
    ctrlLink: { x: 16, y: 20 },
    ctrlContainer: { x: 13, y: 20 },
    mineral: { x: 35, y: 20 },
    mineralSeat: { x: 35, y: 19 },
  });
  return { terrain, plan };
}

function runMineral(K) {
  const { terrain, plan } = mineralPocketRoom(K);
  const res = planShell(terrain, plan, { needDeep: 10 });
  if (res.error) return { line: `planShell error: ${res.error}`, errs: [res.error] };
  const s = res.shell;
  const row = rowFor(res, (r) => r.kind === "mineral");
  const deep = candFor(row, "deep");
  const errs = ledgerInvariants(res, terrain, plan);
  const wantAccept = 1 + K <= 4;
  const due = s.ecoBill.mineralDue.map((p) => key(p.x, p.y));
  const unc = s.ecoBill.uncoverable.map((p) => key(p.x, p.y));
  const line =
    `K=${K} base(cut=${s.baseCut} bill=${s.ecoBill.base}) ` +
    `deep(cut=${deep ? deep.cut : "-"} bill=${deep ? deep.bill : "-"}) ` +
    `-> accepted=${row ? row.accepted : "-"} before=${row ? row.before : "-"} after=${row ? row.after : "-"} ` +
    `mineralDue=[${due}] uncoverable=[${unc}]`;
  if (!row) errs.push("no mineral row in ecoLedger");
  if (s.baseCut !== 2) errs.push(`base cut ${s.baseCut} != 2`);
  if (s.ecoBill.base !== 4) errs.push(`ecoBill.base ${s.ecoBill.base} != 4 (2 wall + seat due + uncoverable mineral)`);
  if (row && row.before !== 2) errs.push(`mineral owes ${row.before} != 2 before the bid`);
  if (deep) {
    if (deep.cut !== 1 + K) errs.push(`deep cut ${deep.cut} != ${1 + K}`);
    if (deep.bill !== 1 + K) errs.push(`deep bill ${deep.bill} != ${1 + K}`);
  } else errs.push('no "deep" candidate for the mineral');
  const bub = new Set(s.bubble.map((p) => key(p.x, p.y)));
  if (bub.has("35,19") || bub.has("35,20")) errs.push("layer 2 emitted a bubble on a mineral work (layer 5 owns those)");
  if (wantAccept) {
    if (row && row.accepted === null) errs.push(`mineral bid refused at bill ${1 + K} <= 4`);
    if (row && row.after !== 0) errs.push(`mineral still owes ${row.after} after enclosure`);
    if (due.length) errs.push(`mineralDue not empty once enclosed: ${due}`);
    if (unc.length) errs.push(`uncoverable not empty once enclosed: ${unc}`);
  } else {
    if (row && row.accepted !== null) errs.push(`mineral bid accepted at bill ${1 + K} > 4`);
    if (row && row.after !== 2) errs.push(`mineral owes ${row.after} != 2 after a refusal`);
    if (due.length !== 1 || due[0] !== "35,19") errs.push(`mineralDue ${JSON.stringify(due)} != ["35,19"]`);
    if (!unc.includes("35,20")) errs.push(`uncoverable ${JSON.stringify(unc)} does not carry the mineral tile`);
    for (const c of row ? row.candidates : []) {
      if (c.verdict !== "accepted" && c.reason !== "price") {
        errs.push(`candidate ${c.label} refused "${c.reason}", expected "price"`);
      }
    }
  }
  return { line, errs, dump: dumpLedger(res) };
}

// ===========================================================================
// SCENARIO D — SECOND CASTLE. The same cheap source pocket, but with no walk
// connection to the hall at all. The min-cut is happy to ring it (the bill
// even falls), and the guard must refuse: a wall the garrison can only reach
// by leaving its own wall is not an enclosure.
// ===========================================================================
function runSecondCastle() {
  const { terrain, plan } = sourcePocketRoom(1, { connectToHall: false });
  const res = planShell(terrain, plan, { needDeep: 10 });
  if (res.error) return { line: `planShell error: ${res.error}`, errs: [res.error] };
  const s = res.shell;
  const row = rowFor(res, (r) => r.kind === "source");
  const errs = ledgerInvariants(res, terrain, plan);
  const reasons = row ? row.candidates.map((c) => `${c.label}:${c.reason || c.verdict}`).join(",") : "-";
  const line =
    `base(cut=${s.baseCut} bill=${s.ecoBill.base}) accepted=${row ? row.accepted : "-"} ` +
    `before=${row ? row.before : "-"} after=${row ? row.after : "-"} candidates=${reasons}`;
  if (!row) errs.push("no source row in ecoLedger");
  if (s.baseCut !== 1) errs.push(`base cut ${s.baseCut} != 1 (the hall's north exit only)`);
  if (s.ecoBill.base !== 3) errs.push(`ecoBill.base ${s.ecoBill.base} != 3 (1 wall + seat + link)`);
  if (row) {
    if (row.accepted !== null) errs.push("a walk-disconnected pocket was bought");
    if (row.after !== 2) errs.push(`source owes ${row.after} != 2 after the refusal`);
    if (!row.candidates.some((c) => c.reason === "second-castle")) {
      errs.push(`no candidate refused "second-castle" (got ${reasons})`);
    }
  }
  if (s.srcEnclosed[0]) errs.push("source reported enclosed");
  return { line, errs, dump: dumpLedger(res) };
}

// ===========================================================================
// SCENARIO E — PAIR. Two source pockets joined by a 2-wide passage, each
// reachable from the hall by its own 1-wide corridor and each leaking to the
// edge through two more. Alone, either costs 8 against a bill of 7; together
// they cost 5, because the passage and both hall corridors stop being wall.
// ===========================================================================
function pairRoom() {
  const t = blank();
  hall(t);
  seal(t, 14, 20); // controller island in the hall
  open(t, 33, 13, 37, 16); // pocket A
  open(t, 33, 22, 37, 25); // pocket B
  open(t, 34, 17, 35, 21); // the 2-wide passage A <-> B
  open(t, 29, 14, 32, 14); // hall <-> A
  open(t, 29, 24, 32, 24); // hall <-> B
  open(t, 33, 0, 33, 12); // A's exits
  open(t, 37, 0, 37, 12);
  open(t, 33, 26, 33, 49); // B's exits
  open(t, 37, 26, 37, 49);
  seal(t, 35, 12); // source A
  seal(t, 35, 26); // source B
  const terrain = asTerrain(t);
  const plan = buildPlan(terrain, {
    room: "PAIR",
    sources: [
      { x: 35, y: 12 },
      { x: 35, y: 26 },
    ],
    seats: [
      { x: 35, y: 13 },
      { x: 35, y: 25 },
    ],
    srcLinks: [
      { x: 35, y: 14 },
      { x: 35, y: 24 },
    ],
    controller: { x: 14, y: 20 },
    ctrlLink: { x: 16, y: 20 },
    ctrlContainer: { x: 13, y: 20 },
  });
  return { terrain, plan };
}

function runPair() {
  const { terrain, plan } = pairRoom();
  const res = planShell(terrain, plan, { needDeep: 10 });
  if (res.error) return { line: `planShell error: ${res.error}`, errs: [res.error] };
  const s = res.shell;
  const errs = ledgerInvariants(res, terrain, plan);
  const singles = s.ecoLedger.filter((r) => r.kind === "source");
  const pair = rowFor(res, (r) => r.kind === "pair");
  const pacc = pair && pair.candidates.find((c) => c.verdict === "accepted");
  const line =
    `base(cut=${s.baseCut} bill=${s.ecoBill.base}) ` +
    `singles=[${singles.map((r) => `${r.site}:${r.accepted}@${(r.candidates[0] || {}).bill}`).join(" ")}] ` +
    `pair=${pair ? pair.site : "-"} accepted=${pair ? pair.accepted : "-"} ` +
    `(cut=${pacc ? pacc.cut : "-"} bill=${pacc ? pacc.bill : "-"}) ` +
    `before=${pair ? pair.before : "-"} after=${pair ? pair.after : "-"} ` +
    `enclosedSources=${s.enclosedSources}`;
  if (s.baseCut !== 3) errs.push(`base cut ${s.baseCut} != 3 (north exit + both hall corridors)`);
  if (s.ecoBill.base !== 7) errs.push(`ecoBill.base ${s.ecoBill.base} != 7 (3 wall + 2 seats + 2 links)`);
  if (singles.length !== 2) errs.push(`expected 2 single-source rows, got ${singles.length}`);
  for (const r of singles) {
    if (r.accepted !== null) errs.push(`${r.site} was bought alone`);
    if (!r.candidates.some((c) => c.reason === "price")) {
      errs.push(`${r.site}: no candidate refused "price" (${r.candidates.map((c) => c.label + ":" + (c.reason || c.verdict)).join(",")})`);
    }
    const deep = candFor(r, "deep");
    if (deep && deep.bill !== 8) errs.push(`${r.site}: single "deep" bill ${deep.bill} != 8`);
  }
  if (!pair) errs.push("no pair row in ecoLedger");
  else {
    if (!pair.site.startsWith("pair:")) errs.push(`pair row is named ${pair.site}`);
    if (pair.accepted === null) errs.push("the pair was refused although it is strictly cheaper");
    if (pair.before !== 4) errs.push(`pair owes ${pair.before} != 4 before the bid`);
    if (pair.after !== 0) errs.push(`pair still owes ${pair.after} after enclosure`);
    if (pacc && pacc.cut !== 5) errs.push(`pair cut ${pacc.cut} != 5`);
    if (pacc && pacc.bill !== 5) errs.push(`pair bill ${pacc.bill} != 5`);
  }
  if (s.enclosedSources !== 2) errs.push(`enclosedSources ${s.enclosedSources} != 2`);
  if (s.bubble.length !== 0) errs.push(`${s.bubble.length} bubbles left after the pair was bought`);
  return { line, errs, dump: dumpLedger(res) };
}

// ===========================================================================
// FLEET — the same ledger invariants over the shipped artifact
// ===========================================================================
function fleet() {
  const plansPath = path.join(__dirname, "..", "out-v2", "plans-hub.json");
  let plans = null;
  if (!fs.existsSync(plansPath)) {
    console.log(`SKIP fleet — ${plansPath} does not exist`);
    return 0;
  }
  try {
    plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
  } catch (e) {
    console.log(`SKIP fleet — ${plansPath} is unparseable (a fleet run is probably rewriting it): ${e.message.slice(0, 80)}`);
    return 0;
  }
  if (!Array.isArray(plans)) {
    console.log(`SKIP fleet — ${plansPath} is not an array of plans`);
    return 0;
  }
  const terrains = new Map();
  const roomsFile = process.env.ROOMS_FILE;
  if (roomsFile && fs.existsSync(roomsFile)) {
    try {
      for (const r of JSON.parse(fs.readFileSync(roomsFile, "utf8"))) terrains.set(r.room, r.terrain);
    } catch (e) {
      console.log(`  (ROOMS_FILE unreadable: ${e.message.slice(0, 60)} — terrain checks skipped)`);
    }
  } else if (roomsFile) {
    console.log(`  (ROOMS_FILE ${roomsFile} not found — terrain checks skipped)`);
  } else {
    console.log("  (no ROOMS_FILE in the environment — terrain checks skipped)");
  }

  let rooms = 0;
  let rows = 0;
  let withTerrain = 0;
  const accepted = new Map();
  const refused = new Map();
  const errs = [];
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  for (const plan of plans) {
    const s = plan.meta && plan.meta.shell;
    if (!s || !s.ecoLedger || !s.ecoBill) continue;
    rooms++;
    const b = s.ecoBill;
    if (!(b.traded <= b.base)) {
      // ...unless the DEEP CREDIT paid for it: a room below needDeep may buy
      // interior with ramparts, and then the traded bill legitimately rises.
      let credit = 0;
      let premium = 0;
      for (const row of s.ecoLedger) {
        for (const c of row.candidates || []) {
          if (c.verdict !== "accepted" || row.accepted !== c.label) continue;
          credit += c.credit || 0;
          premium += c.premium || 0;
        }
      }
      if (credit + premium >= b.traded - b.base) {
        if (credit) creditedRooms.push(`${plan.room}: traded ${b.traded} > base ${b.base} (deep credit ${credit}, deepTiles ${s.deepTiles} < needDeep ${s.needDeep})`);
        if (premium) premiumRooms.push(`${plan.room}: traded ${b.traded} > base ${b.base} (mobility premium ${premium})`);
        // ...and ecoBill publishes both totals so a reader need not re-walk the ledger
        if ((b.credit || 0) !== credit) errs.push(`${plan.room}: ecoBill.credit ${b.credit} != ledger credit ${credit}`);
        if ((b.premium || 0) !== premium) errs.push(`${plan.room}: ecoBill.premium ${b.premium} != ledger premium ${premium}`);
      } else {
        errs.push(`${plan.room}: traded ${b.traded} > base ${b.base} (deep credit only ${credit}, premium ${premium})`);
      }
    }
    if (!(b.shipped <= b.traded)) errs.push(`${plan.room}: shipped ${b.shipped} > traded ${b.traded}`);
    for (const row of s.ecoLedger) {
      rows++;
      if (!(row.after <= row.before)) errs.push(`${plan.room}/${row.site}: after ${row.after} > before ${row.before}`);
      if (row.accepted) bump(accepted, `${row.kind}:${row.accepted}`);
      for (const c of row.candidates || []) {
        if (c.verdict === "accepted") {
          const credit = c.credit || 0;
          const premium = c.premium || 0;
          if (!(c.bill <= row.bill)) {
            if (credit > 0 && c.bill - credit <= row.bill) {
              creditedAccepts.push(`${plan.room}/${row.site}/${c.label}: bill ${c.bill} > ${row.bill}, credit ${credit}`);
            } else if (premium > 0 && c.bill - credit - row.bill <= premium && typeof c.mobility === "number") {
              premiumAccepts.push(`${plan.room}/${row.site}/${c.label}: bill ${c.bill} > ${row.bill}, premium ${premium}, lap ${c.mobility}`);
            } else {
              errs.push(`${plan.room}/${row.site}/${c.label}: accepted at bill ${c.bill} > row bill ${row.bill}`);
            }
          }
        } else {
          bump(refused, c.reason || c.verdict);
          if (c.reason === "price") errs.push(...priceRefusalOk(`${plan.room}/${row.site}/${c.label}`, row, c));
        }
      }
    }
    const terrain = terrains.get(plan.room);
    if (!terrain || !s.cut) continue;
    withTerrain++;
    // the SHIPPED wall: every rampart, not the min-cut ring alone. Layer 7's
    // inert prune deletes cut tiles whose seal another rampart already holds, so
    // after it `meta.shell.cut` on its own no longer closes every room (the
    // validator's `meta.shell.closures` is that record); the exposure a seat or
    // link suffers is measured against the wall the room stands on.
    const rampSet = new Set((plan.structures.rampart || []).map((p) => key(p.x, p.y)));
    const ext = exteriorFlood(terrain, rampSet);
    const depth = depthFromExterior(ext);
    const links = plan.structures.link || [];
    const srcLinks = links.slice(1, Math.max(1, links.length - 1));
    for (const src of plan.sources || []) {
      const mine = [
        ...(plan.structures.container || []).filter((c) => chebyshev(c, src) <= 1).map((c) => ["seat", c]),
        ...srcLinks.filter((l) => chebyshev(l, src) <= 2).map((l) => ["srcLink", l]),
      ];
      for (const [what, p] of mine) {
        const i = ix(p.x, p.y);
        if (!ext[i] && depth[i] >= DEPTH_SAFE) continue;
        if (!borderLegal(terrain, p.x, p.y, "rampart")) continue;
        if (!rampSet.has(key(p.x, p.y))) {
          errs.push(
            `${plan.room}: ${what} at ${p.x},${p.y} exposed under the shipped rampart union ` +
              `(ext=${!!ext[i]} depth=${depth[i]}) and carries no rampart`,
          );
        }
      }
    }
  }
  const top = (m) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" ") || "none";
  console.log(
    `FLEET rooms=${rooms} (terrain for ${withTerrain}) rows=${rows} | accepted: ${top(accepted)} | refused: ${top(refused)}`,
  );
  if (errs.length) {
    console.log(`FAIL fleet — ${errs.length} invariant violation(s):`);
    for (const e of errs.slice(0, 25)) console.log(`      - ${e}`);
    if (errs.length > 25) console.log(`      ... and ${errs.length - 25} more`);
    discrepancies.push({ name: "fleet", errs });
    return 1;
  }
  console.log(`PASS fleet — every ledger invariant holds over ${rooms} room(s)`);
  return 0;
}

// ===========================================================================
// main
// ===========================================================================
const shellStat = fs.statSync(path.join(__dirname, "layer-shell.mjs"));
console.log(
  `=== eco bill / eco ledger === (layer-shell.mjs ${shellStat.size}B @ ${shellStat.mtime.toISOString()})`,
);
for (const K of [1, 2, 3, 4, 5]) scenario(`SOURCE-TRADE K=${K}`, () => runSourceTrade(K));
scenario(`TIE-STRETCH accept (works=4, stretch=4)`, () => runTieStretch(4));
scenario(`TIE-STRETCH refuse (works=5, stretch=5)`, () => runTieStretch(5));
scenario("CONTROLLER accept (8-ring, 9 exits)", () => runCtrlAccept(9));
scenario("CONTROLLER refuse (3-ring, 8 exits)", () => runCtrlRefuse(8));
scenario("MINERAL accept (K=1)", () => runMineral(1));
scenario("MINERAL refuse (K=4)", () => runMineral(4));
scenario("SECOND-CASTLE", () => runSecondCastle());
scenario("PAIR", () => runPair());
console.log("");
const fleetFail = fleet();
if (creditedAccepts.length) {
  console.log(
    `\nNOTE ${creditedAccepts.length} accept(s) priced above the pre-bid bill under the deep credit ` +
      `(DEEP_CREDIT_TILES_PER_RAMPART), e.g. ${creditedAccepts[0]}`,
  );
}
if (premiumAccepts.length) {
  console.log(
    `
NOTE ${premiumAccepts.length} accept(s) priced above the pre-bid bill under the owner's mobility premium ` +
      `(mobilityAllowance: ramparts per 1.0 of gated lap reclaimed, only past MOBILITY_BUY_FLOOR), e.g. ${premiumAccepts[0]}`,
  );
}
if (premiumRooms.length) {
  console.log(`
NOTE ecoBill.traded > ecoBill.base in ${premiumRooms.length} fleet room(s) paid for by the mobility premium:`);
  for (const r of premiumRooms) console.log(`      - ${r}`);
}
if (creditedRooms.length) {
  console.log(
    `\nNOTE ecoBill.traded > ecoBill.base in ${creditedRooms.length} fleet room(s) — every one paid for by the ` +
      `deep credit, which the "traded <= base" invariant predates:`,
  );
  for (const r of creditedRooms) console.log(`      - ${r}`);
}
if (tieRefusals.length) {
  console.log(
    `\nNOTE ${tieRefusals.length} tie(s) refused on price for stretch > ECO_TIE_MAX_STRETCH ` +
      `(${ECO_TIE_MAX_STRETCH}), e.g. ${tieRefusals[0]}`,
  );
}
console.log(
  `\n${scenariosRun - scenariosFailed}/${scenariosRun} scenarios passed` +
    (fleetFail ? ", fleet invariants FAILED" : ""),
);
process.exit(scenariosFailed || fleetFail ? 1 : 0);
