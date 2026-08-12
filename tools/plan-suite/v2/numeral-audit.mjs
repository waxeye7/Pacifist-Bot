/**
 * ===========================================================================
 * THE NUMERAL-ROT HARNESS (Mm5, round 22 — the systemic fix the class earned).
 * ===========================================================================
 *
 * WHAT THIS IS FOR. Six consecutive review rounds have found the same defect:
 * a CURRENT-TENSE FLEET NUMERAL typed into a comment or a published string,
 * true on the build it was typed against, false on the build that ships. The
 * roster is long and the shape never varies — "this fleet ships 60 such tiles"
 * (62), "60 tiles across 53 shipped rooms" (62/55), "the largest (E12S6, 123
 * roads)" (124), "reproduces the fleet's 1994 in 172 of 172" (1997), "35 tiles
 * in E16S1, 53 in E12S9, 45 in E9S2 — median 39, max 85" (all five wrong),
 * "220 RCL2 containers across 145 rooms" (218/143), "the fleet's 145 bridge
 * repairs" (a third of the truth). Each round the fix has been to re-type the
 * number, and each round it has rotted again, because a figure quoted in prose
 * is a figure nothing re-derives.
 *
 * The one durable answer is the one this repository already applies to its
 * METRICS: do not trust a claim, re-derive it. `push-plan.mjs --census` prints
 * the numbers its own headers quote; `validate.mjs` re-derives every published
 * quantity off the board; `mutate.mjs` proves the derivations bite. Prose was
 * the one channel with no such gate. This is that gate.
 *
 * WHAT IT DOES. It reads every .mjs of the suite plus tools/server/push-plan.mjs,
 * finds the numerals that sit inside COMMENTS AND STRING LITERALS (a numeral in
 * code is a constant, not a claim), matches them against a PATTERN LIBRARY of
 * the shapes fleet claims actually take, and for each hit:
 *
 *   RESOLVED — a registry extractor can measure the same quantity off the
 *              shipped artifact. The two are compared. A mismatch EXITS 1.
 *   WAIVED   — the line carries an inline `[r22-waived: reason]` tag. Printed,
 *              with its reason, so the waivers are a visible list rather than
 *              a silence.
 *   OPEN     — matched, not resolvable, not waived. EXITS 1, because the whole
 *              point is that an unowned numeral is exactly the thing that rots.
 *
 * The contract is deliberately binary: there is no tense heuristic. A claim
 * about a past build is not "detected", it is TAGGED — attribution is a thing
 * the author knows and a regex is guessing at. `[r22-waived: ...]` on the same
 * line or on the line above is the whole mechanism, and the reason is printed
 * every run so a waiver has to keep justifying itself in front of a reader.
 *
 * WHAT IT IS NOT. It is not a general numeral checker. It matches claim SHAPES
 * ("this fleet ships N X", "N tiles across M rooms", "N of the 172", "(E12S6,
 * 124 roads)") and it is honest about the ones it cannot read: the pattern
 * library and the registry are both small and both listed below, so a reader
 * knows exactly how much of the prose this gate covers. Widening it is adding
 * a row to one of two tables.
 *
 *   node tools/plan-suite/v2/numeral-audit.mjs            # gate: exits 1 on rot
 *   node tools/plan-suite/v2/numeral-audit.mjs --list     # every hit, resolved or not
 *
 * plan.mjs runs it as the last step of a full `--all-claimable` build, on the
 * artifact that build just wrote.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const PLANS = path.join(REPO, "tools", "plan-suite", "out-v2", "plans-hub.json");

/**
 * FILES NOT YET SWEPT. Every file is READ and every hit is reported; a hit in a
 * file on this list is counted as PENDING and does not fail the build, because
 * the sweep that would clear it is somebody else's edit and a gate that fails on
 * work nobody has been asked to do yet is a gate that gets disabled.
 *
 * The list is the contract, not a permanent exemption: round 22 split the suite
 * between two clusters, validate.mjs and mutate.mjs belonged to the other one,
 * and it carried them ("the fleet's 1994", "the fleet's one crossing", "all 159
 * rooms", two 159/159s and the 7275-cut-tile roster — fixed or tagged). Both
 * files are clean under this gate now and the list is EMPTY, which is the state
 * it is supposed to end every round in: a numeral that rots in any audited file
 * fails the build, with no roster of places where it does not.
 */
export const PENDING_FILES = [];
/** the files this gate reads — the suite, plus the one server tool with a prose header */
export function auditFiles() {
  const suite = path.join(REPO, "tools", "plan-suite", "v2");
  const out = fs
    .readdirSync(suite)
    .filter((f) => f.endsWith(".mjs") && f !== "numeral-audit.mjs")
    .sort()
    .map((f) => path.join(suite, f));
  out.push(path.join(REPO, "tools", "server", "push-plan.mjs"));
  return out.filter((f) => fs.existsSync(f));
}

// ---------------------------------------------------------------------------
// (1) WHERE A CLAIM CAN LIVE — comments and string literals, nothing else.
// ---------------------------------------------------------------------------
/**
 * A single left-to-right scan producing the [start,end) ranges of every line
 * comment, block comment and string literal. Deliberately a scanner and not a
 * regex: `"//"` inside a string and `'` inside a comment are both common in
 * this codebase, and a regex that gets either one wrong silently changes what
 * this gate reads.
 */
export function proseRanges(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const j = src.indexOf("\n", i);
      const end = j < 0 ? n : j;
      out.push({ start: i, end, kind: "line" });
      i = end;
      continue;
    }
    if (c === "/" && d === "*") {
      const j = src.indexOf("*/", i + 2);
      const end = j < 0 ? n : j + 2;
      out.push({ start: i, end, kind: "block" });
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        // a template literal can contain anything including newlines; a quoted
        // string that runs off its line is a syntax error the parser would have
        // caught, so stopping at the newline keeps a stray apostrophe from
        // eating the rest of the file
        if (c !== "`" && src[j] === "\n") break;
        j++;
      }
      const end = Math.min(n, j + 1);
      out.push({ start: i, end, kind: "string" });
      i = end;
      continue;
    }
    // a regex literal can contain quotes and slashes; skip it crudely but
    // safely by only recognising it after a token that cannot end an expression
    if (c === "/" && /[=(,:[!&|?{};\n]\s*$/.test(src.slice(Math.max(0, i - 12), i))) {
      let j = i + 1;
      let cls = false;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") cls = true;
        else if (src[j] === "]") cls = false;
        else if (src[j] === "/" && !cls) break;
        else if (src[j] === "\n") break;
        j++;
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// (2) THE REGISTRY — quantities this gate can measure off the shipped artifact.
// ---------------------------------------------------------------------------
const sum = (P, f) => P.reduce((s, p) => s + (f(p) || 0), 0);
const countRooms = (P, f) => P.filter((p) => f(p)).length;
const structs = (t) => (P) => sum(P, (p) => (p.structures?.[t] || []).length);
const structRooms = (t) => (P) => countRooms(P, (p) => (p.structures?.[t] || []).length);

/**
 * Each entry: how to measure the fleet TOTAL, how to measure the number of
 * ROOMS it lands in (for the "N across M rooms" shape), and the noun phrases a
 * claim may use for it. Aliases are matched longest-first and case-insensitively
 * against the words immediately after the numeral.
 */
export const QUANTITIES = {
  room: {
    aliases: ["rooms", "shipped rooms", "claimable rooms", "planned rooms", "room"],
    total: (P) => P.length,
    rooms: (P) => P.length,
  },
  rampart: { aliases: ["ramparts", "rampart tiles", "rampart"], total: structs("rampart"), rooms: structRooms("rampart") },
  road: { aliases: ["roads", "road tiles", "shipped roads", "road"], total: structs("road"), rooms: structRooms("road") },
  extension: { aliases: ["extensions", "extension"], total: structs("extension"), rooms: structRooms("extension") },
  container: { aliases: ["containers", "container"], total: structs("container"), rooms: structRooms("container") },
  tower: { aliases: ["towers", "tower"], total: structs("tower"), rooms: structRooms("tower") },
  lab: { aliases: ["labs", "lab"], total: structs("lab"), rooms: structRooms("lab") },
  link: { aliases: ["links", "link"], total: structs("link"), rooms: structRooms("link") },
  spawn: { aliases: ["spawns", "spawn"], total: structs("spawn"), rooms: structRooms("spawn") },
  observer: { aliases: ["observers", "observer"], total: structs("observer"), rooms: structRooms("observer") },
  extractor: { aliases: ["extractors", "extractor"], total: structs("extractor"), rooms: structRooms("extractor") },
  nuker: { aliases: ["nukers", "nuker"], total: structs("nuker"), rooms: structRooms("nuker") },
  shallowExt: {
    aliases: ["shallow extensions", "shallow extension"],
    total: (P) => sum(P, (p) => p.meta?.extensions?.shallow || 0),
    rooms: (P) => countRooms(P, (p) => (p.meta?.extensions?.shallow || 0) > 0),
  },
  note: {
    aliases: ["planner notes", "notes", "note"],
    total: (P) => sum(P, (p) => (p.meta?.notes || []).length),
    rooms: (P) => countRooms(P, (p) => (p.meta?.notes || []).length),
  },
  declaration: {
    aliases: ["declared shortfalls", "declarations", "shortfalls", "declaration"],
    total: (P) => sum(P, (p) => (p.meta?.shortfalls || []).length),
    rooms: (P) => countRooms(P, (p) => (p.meta?.shortfalls || []).length),
  },
  roadContainerTile: {
    // the quantity two file headers kept re-typing — see push-plan --census.
    // NOT aliased to "such tiles": that phrase's meaning is whatever the
    // sentence before it said, and a registry that guesses at an antecedent is
    // a registry that will confidently check the wrong number.
    aliases: ["road+container tiles"],
    total: (P) =>
      sum(P, (p) => {
        const r = new Set((p.structures?.road || []).map((t) => `${t.x},${t.y}`));
        return (p.structures?.container || []).filter((c) => r.has(`${c.x},${c.y}`)).length;
      }),
    rooms: (P) =>
      countRooms(P, (p) => {
        const r = new Set((p.structures?.road || []).map((t) => `${t.x},${t.y}`));
        return (p.structures?.container || []).some((c) => r.has(`${c.x},${c.y}`));
      }),
  },
};
/** aliases, longest first, so "shallow extensions" wins over "extensions" */
const ALIASES = Object.entries(QUANTITIES)
  .flatMap(([k, q]) => q.aliases.map((a) => [a, k]))
  .sort((a, b) => b[0].length - a[0].length);
function quantityFor(tail, only = null) {
  const t = tail.toLowerCase().replace(/\s+/g, " ").trimStart();
  for (const [alias, key] of ALIASES) {
    if (only && !only.includes(key)) continue;
    if (t.startsWith(alias)) return key;
  }
  return null;
}
/**
 * "N <noun> across M rooms" IS ALMOST ALWAYS A SUBSET CLAIM, and reading it as
 * a fleet total is how a checker ends up confidently wrong. "40 roads across 37
 * rooms" is a count of tower spurs, not of the fleet's 14,100 roads. So this
 * shape resolves ONLY for the quantities whose whole definition is fleet-wide
 * and whose noun phrase cannot mean anything else; every other noun is reported
 * OPEN and has to be given an extractor, deleted, or waived by a human who
 * knows what the sentence is about.
 */
const ROSTER_KEYS = ["shallowExt", "note", "declaration", "roadContainerTile"];

/**
 * EVERY FLEET-LEVEL TOTAL THIS ARTIFACT CAN BE ASKED FOR, label -> value.
 *
 * A "completeness" numeral — the N in "all N rooms", "172/172", "in 158 of 172"
 * — is a DENOMINATOR: the size of some set the whole fleet has. It is not
 * always the room count ("344/344" is the fleet's source works; "133 rooms" is
 * the rooms that file a mineral off-network declaration), and a gate that
 * assumed it was would fail the build on two sentences that are correct.
 *
 * So the test is: IS THIS NUMBER A TOTAL THIS FLEET ACTUALLY HAS? That is what
 * makes 159 wrong — the fleet had 159 rooms two worlds ago and has no set of
 * that size now — while leaving every honest denominator alone. It is a weaker
 * check than naming the quantity, and it is the strongest one available without
 * the prose telling us which set it means; where the prose DOES say (the three
 * patterns above), the quantity is named and compared exactly.
 */
export function fleetTotals(P) {
  const t = new Map();
  const put = (label, v) => {
    if (typeof v === "number" && Number.isFinite(v) && !t.has(String(v))) t.set(String(v), label);
    else if (typeof v === "number" && Number.isFinite(v)) t.set(String(v), `${t.get(String(v))} / ${label}`);
  };
  put("rooms in the fleet", P.length);
  for (const [k, q] of Object.entries(QUANTITIES)) {
    if (k === "room") continue;
    put(`${k} shipped fleet-wide`, q.total(P));
    put(`rooms shipping ${k}`, q.rooms(P));
  }
  put("source works", sum(P, (p) => (p.sources || []).length));
  put("controllers", countRooms(P, (p) => p.controller));
  put("minerals", countRooms(P, (p) => p.mineral));
  put("cut tiles", sum(P, (p) => (p.shell?.cut || []).length));
  put("sealed tiles", sum(P, (p) => p.meta?.sealedFloor?.tiles || 0));
  put("planner notes", sum(P, (p) => (p.meta?.notes || []).length));
  // every declaration class the fleet files, by gate/kind: the count and the
  // rooms — "the 133 rooms it applies to" is one of these
  const byKind = new Map();
  for (const p of P) {
    const seen = new Set();
    for (const sf of p.meta?.shortfalls || []) {
      const k = `${sf.gate}${sf.kind ? `/${sf.kind}` : ``}`;
      const e = byKind.get(k) || { n: 0, rooms: 0 };
      e.n++;
      if (!seen.has(k)) {
        e.rooms++;
        seen.add(k);
      }
      byKind.set(k, e);
    }
  }
  for (const [k, e] of byKind) {
    put(`${k} declarations`, e.n);
    put(`rooms declaring ${k}`, e.rooms);
  }
  return t;
}

// ---------------------------------------------------------------------------
// (3) THE PATTERN LIBRARY — the shapes a fleet claim takes in this codebase.
// ---------------------------------------------------------------------------
const num = (s) => Number(String(s).replace(/,/g, ""));
/**
 * Every pattern returns zero or more CLAIMS: `{ what, value, resolve }`, where
 * `resolve(P)` gives the measured value or null when this gate cannot read it.
 * `what` is the human-readable subject printed in the report.
 */
export const PATTERNS = [
  {
    id: "fleet-ships",
    // "this fleet ships 62 such tiles" · "the fleet ships 8208 ramparts"
    re: /\b(?:this|the)\s+fleet\s+ships\s+([\d,]+)\s+([A-Za-z+][A-Za-z+ -]{0,30})/g,
    claims: (m) => {
      const k = quantityFor(m[2]);
      return [
        {
          what: `fleet total of ${k || `"${m[2].trim()}"`}`,
          value: num(m[1]),
          resolve: (P) => (k ? QUANTITIES[k].total(P) : null),
        },
      ];
    },
  },
  {
    id: "fleet-possessive",
    // "the fleet's 14100 roads"
    re: /\bthe\s+fleet(?:'s|s')\s+([\d,]+)\s+([A-Za-z+][A-Za-z+ -]{0,30})/g,
    claims: (m) => {
      const k = quantityFor(m[2]);
      return [
        {
          what: `fleet total of ${k || `"${m[2].trim()}"`}`,
          value: num(m[1]),
          resolve: (P) => (k ? QUANTITIES[k].total(P) : null),
        },
      ];
    },
  },
  {
    id: "n-across-m-rooms",
    // "62 tiles across 55 shipped rooms" · "25 shallow extensions across 3 rooms"
    re: /\b([\d,]+)\s+([A-Za-z+][A-Za-z+ -]{0,30}?)\s+across\s+([\d,]+)\s+(?:shipped\s+|planned\s+)?rooms?\b/g,
    claims: (m) => {
      const k = quantityFor(m[2], ROSTER_KEYS);
      return [
        {
          what: `total of ${k || `"${m[2].trim()}"`} across the fleet`,
          value: num(m[1]),
          resolve: (P) => (k ? QUANTITIES[k].total(P) : null),
        },
        {
          what: `rooms carrying ${k || `"${m[2].trim()}"`}`,
          value: num(m[3]),
          resolve: (P) => (k ? QUANTITIES[k].rooms(P) : null),
        },
      ];
    },
  },
  {
    id: "fleet-size",
    // THE NUMBER THAT ROTTED WHEN THE FLEET GREW FROM 159 ROOMS TO 172, and it
    // is still sitting in this codebase in the places nobody re-read.
    //
    // Only three shapes, all unambiguous, all meaning "every room there is":
    //   "all 172 rooms" · "of the 172 rooms" / "of 172 rooms" · "172/172"
    // The last one uses a BACKREFERENCE — the two numbers must be equal — so
    // "174/318" and "12/60", which are not fleet claims at all, do not match.
    //
    // DELIBERATELY NOT MATCHED: "the 159-room fleet" and "a 159-room world".
    // That is an attributive naming of a PAST build, which this codebase uses
    // exactly where it should (a figure quoted with the world it was measured
    // on), and reading it as a claim about the shipping fleet would fail the
    // build on the one construction that is doing the right thing. A bare
    // "in 171 rooms" is not matched either: it is a subset count, and the
    // fleet's own size is never written that way here.
    re: /\b(?:all\s+([\d,]{3})\s+rooms?\b|of\s+(?:the\s+)?([\d,]{3})\s+rooms?\b|([\d,]{3})\s*\/\s*\3(?!\d))/g,
    claims: (m) => {
      const v = num(m[1] ?? m[2] ?? m[3]);
      if (!Number.isFinite(v)) return [];
      return [
        {
          what: `a fleet-wide completeness denominator`,
          value: v,
          // "correct" here means: the fleet HAS a set of this size. The label of
          // the set it matched is carried through to the report so a reader can
          // see what the gate accepted it as.
          resolve: (P) => (fleetTotals(P).has(String(v)) ? v : -1),
          label: (P) => fleetTotals(P).get(String(v)) || null,
        },
      ];
    },
  },
  {
    id: "room-road-count",
    // "(E12S6, 124 roads)"
    re: /\(([EW]\d+[NS]\d+),\s*([\d,]+)\s+roads?\)/g,
    claims: (m) => [
      {
        what: `roads shipped by ${m[1]}`,
        value: num(m[2]),
        resolve: (P) => {
          const p = P.find((q) => q.room === m[1]);
          return p ? (p.structures?.road || []).length : null;
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// (4) THE WAIVER — the only way a matched claim may go unresolved.
// ---------------------------------------------------------------------------
export const WAIVER_RE = /\[r22-waived:\s*([^\]]+)\]/;
const COMMENTISH = /^\s*(?:\/\/|\*|\/\*)/;
/**
 * THE UNIT OF A WAIVER IS THE PARAGRAPH, not the line.
 *
 * These comments run to eighty lines and a reason worth reading does not fit on
 * the line the numeral is on. So the waiver is looked for across the whole
 * contiguous comment block the claim sits in — walk up and down while the lines
 * still look like comment, join, and search that. A block comment is searched
 * whole for the same reason. One tag waives the paragraph it is written in,
 * which is the scope a human reading it would assume.
 */
function waiverFor(src, lines, lineIdx, range, at, lineStart) {
  let text;
  let base;
  if (range && range.kind === "block") {
    text = src.slice(range.start, range.end);
    base = range.start;
  } else {
    let a = lineIdx;
    let b = lineIdx;
    while (a > 0 && COMMENTISH.test(lines[a - 1])) a--;
    while (b < lines.length - 1 && COMMENTISH.test(lines[b + 1])) b++;
    // offset of the first line of the paragraph, derived from the claim's own
    // line start so the distances below are in real file offsets
    base = lineStart;
    for (let i = a; i < lineIdx; i++) base -= lines[i].length + 1;
    text = lines.slice(a, b + 1).join("\n");
  }
  // THE NEAREST TAG WINS. A file header can be one comment block eighty lines
  // long carrying three different waivers; handing every claim in it the FIRST
  // one prints a reason that is about a different sentence, which is its own
  // little piece of prose rot.
  const re = new RegExp(WAIVER_RE.source, "g");
  let m;
  let best = null;
  while ((m = re.exec(text))) {
    const d = Math.abs(base + m.index - at);
    if (!best || d < best.d) best = { d, why: m[1] };
  }
  return best ? best.why.replace(/\s*\n\s*(?:\/\/|\*)?\s*/g, " ").trim() : null;
}

// ---------------------------------------------------------------------------
// (5) THE RUN.
// ---------------------------------------------------------------------------
export function audit(plans) {
  const hits = [];
  for (const file of auditFiles()) {
    const src = fs.readFileSync(file, "utf8");
    const ranges = proseRanges(src);
    const lines = src.split(/\r?\n/);
    // line index of every offset, computed once
    const lineStarts = [0];
    for (let i = 0; i < lines.length; i++) lineStarts.push(lineStarts[i] + lines[i].length + 1);
    const lineOf = (off) => {
      let lo = 0;
      let hi = lines.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= off) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    for (const r of ranges) {
      const text = src.slice(r.start, r.end);
      for (const pat of PATTERNS) {
        pat.re.lastIndex = 0;
        let m;
        while ((m = pat.re.exec(text))) {
          const at = r.start + m.index;
          const li = lineOf(at);
          const ctx = text.slice(Math.max(0, m.index - 120), m.index + m[0].length + 120);
          for (const c of pat.claims(m, ctx)) {
            hits.push({
              file: path.relative(REPO, file).replace(/\\/g, "/"),
              line: li + 1,
              pattern: pat.id,
              quote: m[0].replace(/\s+/g, " ").trim(),
              waiver: waiverFor(src, lines, li, r, at, lineStarts[li]),
              ...c,
            });
          }
        }
      }
    }
  }
  const resolved = [];
  const waived = [];
  const open = [];
  const bad = [];
  const pending = [];
  for (const h of hits) {
    const measured = h.resolve(plans);
    h.measured = measured;
    const ok = measured !== null && measured !== undefined && measured === h.value;
    if (ok) {
      resolved.push(h);
      continue;
    }
    if (h.waiver) {
      waived.push(h);
      continue;
    }
    if (PENDING_FILES.includes(h.file)) {
      pending.push(h);
      continue;
    }
    if (measured === null || measured === undefined) open.push(h);
    else bad.push(h);
  }
  return { hits, resolved, waived, open, bad, pending };
}

export function report(res, { list = false } = {}) {
  const where = (h) => `${h.file}:${h.line}`;
  const out = [];
  out.push(
    `numeral audit — ${res.hits.length} fleet-numeral claim(s) matched · ` +
      `${res.resolved.length} re-derived and correct · ${res.waived.length} waived · ` +
      `${res.open.length} unowned · ${res.bad.length} WRONG · ${res.pending.length} in files not yet swept`,
  );
  if (list) {
    for (const h of res.resolved) out.push(`  ok    ${where(h)} — ${h.what} = ${h.value}   "${h.quote}"`);
  }
  for (const h of res.pending) {
    out.push(
      `  pending ${where(h)} — "${h.quote}" — ${h.what}` +
        (h.measured === null || h.measured === undefined ? ` is not in this gate's registry` : ` claims ${h.value}, the artifact ships ${h.measured}`) +
        ` (file not yet swept; see PENDING_FILES)`,
    );
  }
  for (const h of res.waived) {
    out.push(`  waived ${where(h)} — "${h.quote}" — ${h.waiver}`);
  }
  for (const h of res.open) {
    out.push(
      `  OPEN  ${where(h)} — "${h.quote}" — ${h.what} is not in this gate's registry. Add an ` +
        `extractor for it, delete the numeral, or tag the line [r22-waived: why].`,
    );
  }
  for (const h of res.bad) {
    out.push(
      `  WRONG ${where(h)} — "${h.quote}" — ` +
        (h.measured === -1
          ? `${h.value} is not the size of ANY set this fleet has — no total in the registry matches it`
          : `${h.what} claims ${h.value}, the artifact ships ${h.measured}`) +
        `.`,
    );
  }
  return out.join("\n");
}

export function runAudit({ list = false, log = console.log } = {}) {
  if (!fs.existsSync(PLANS)) {
    log(`numeral audit: no artifact at ${PLANS} — nothing to check against (skipped).`);
    return 0;
  }
  const plans = JSON.parse(fs.readFileSync(PLANS, "utf8")).filter((p) => p && p.structures);
  const res = audit(plans);
  log(report(res, { list }));
  return res.bad.length || res.open.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(runAudit({ list: process.argv.includes("--list") }));
}
