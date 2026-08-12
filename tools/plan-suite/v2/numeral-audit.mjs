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
    // THE ALIAS HAS TO END WHERE THE WORD DOES. A bare `startsWith` made "the
    // fleet's 16 road-axis offers" a claim about the fleet's 14,100 ROADS and
    // failed the build on a sentence that is about something else entirely; the
    // same shape would read "12 container-face pairs" as a container count. The
    // noun a claim is about is the whole word, so the character after the alias
    // may not continue it.
    if (t.startsWith(alias) && !/[a-z-]/.test(t.slice(alias.length, alias.length + 1))) return key;
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
/**
 * THE FLEET-LEVEL EXTRACTORS, AS A TABLE, BECAUSE A TABLE CAN BE SELF-TESTED.
 *
 * These used to be a run of `put(...)` calls inline in `fleetTotals`, and one of
 * them was DEAD: `put("cut tiles", sum(P, (p) => (p.shell?.cut || []).length))`
 * read a TOP-LEVEL `shell` that this artifact does not have — the cut lives at
 * `meta.shell.cut` — so the extractor measured 0 on all 172 rooms, registered
 * the label "cut tiles" against the string "0", and quietly contributed nothing
 * to a gate whose entire job is to notice numbers that are not what they claim.
 * It shipped that way for a whole round because nothing asked the registry
 * whether its own readings were plausible.
 *
 * So the entries carry the NOUNS a claim would use for them, and
 * `registrySelfTest` below asks the question the dead entry would have failed:
 * if an extractor reads 0 (or nothing) on the shipped artifact while the audited
 * prose contains a positive claim about that very noun, the registry is
 * misconfigured, and that is a build failure and not a silent zero.
 */
export const FLEET_EXTRACTORS = [
  { label: "rooms in the fleet", nouns: ["rooms"], fn: (P) => P.length },
  { label: "source works", nouns: ["source works", "sources"], fn: (P) => sum(P, (p) => (p.sources || []).length) },
  { label: "controllers", nouns: ["controllers"], fn: (P) => countRooms(P, (p) => p.controller) },
  { label: "minerals", nouns: ["minerals"], fn: (P) => countRooms(P, (p) => p.mineral) },
  { label: "cut tiles", nouns: ["cut tiles"], fn: (P) => sum(P, (p) => (p.meta?.shell?.cut || []).length) },
  {
    label: "sealed tiles",
    nouns: ["sealed tiles"],
    fn: (P) => sum(P, (p) => p.meta?.sealedFloor?.tiles || 0),
  },
  { label: "planner notes", nouns: ["planner notes"], fn: (P) => sum(P, (p) => (p.meta?.notes || []).length) },
];

export function fleetTotals(P) {
  const t = new Map();
  const put = (label, v) => {
    if (typeof v === "number" && Number.isFinite(v) && !t.has(String(v))) t.set(String(v), label);
    else if (typeof v === "number" && Number.isFinite(v)) t.set(String(v), `${t.get(String(v))} / ${label}`);
  };
  // "rooms in the fleet" leads, so that the label a completeness denominator is
  // reported under is the one a reader means by it
  put(FLEET_EXTRACTORS[0].label, FLEET_EXTRACTORS[0].fn(P));
  for (const [k, q] of Object.entries(QUANTITIES)) {
    if (k === "room") continue;
    put(`${k} shipped fleet-wide`, q.total(P));
    put(`rooms shipping ${k}`, q.rooms(P));
  }
  for (const e of FLEET_EXTRACTORS.slice(1)) put(e.label, e.fn(P));
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
 * A LINE WITH NOTHING ON IT ONCE THE COMMENT FURNITURE IS OFF — `//`, ` *`,
 * `/**`, ` *​/`. That is where one paragraph of these comments ends and the next
 * begins, and it is the boundary a human reading the file sees.
 */
export function proseOfLine(l) {
  return String(l)
    .replace(/^\s*\/\*+/, "")
    .replace(/^\s*\/\/+/, "")
    .replace(/^\s*\*+(?!\/)/, "")
    .replace(/\*+\/\s*$/, "")
    .trim();
}
const isParagraphBreak = (l) => proseOfLine(l) === "";
/**
 * A WAIVER COVERS THE NUMERAL IT IS WRITTEN BESIDE. NOT THE COMMENT IT IS IN.
 *
 * The scope used to be the whole contiguous comment — a block comment end to
 * end, a run of `//` lines end to end. These comments run to a hundred and
 * twenty lines and carry four or five unrelated arguments, so "one tag waives
 * the comment it is written in" meant ONE tag written about ONE dated figure
 * silently absolved every other numeral in a screenful of prose, including
 * current-tense claims about the SHIPPING fleet that the gate had otherwise
 * re-derived and would have failed on. Eight such claims were shielded across
 * the suite, and the damage is not hypothetical: it is exactly the shape this
 * whole harness exists to stop — a numeral nothing re-derives — reintroduced by
 * the harness's own escape hatch. Worse, it is invisible: the report prints the
 * waiver's reason, which is about a different sentence, and a reader skims a
 * plausible excuse.
 *
 * The scope is now two rules, and both are the ones a reader already assumes:
 *
 *   (a) THE PARAGRAPH. The search never leaves the nearest blank-line-delimited
 *       paragraph — walk up and down from the numeral's line while the lines
 *       still have prose on them and stop at the first empty comment line in
 *       each direction. A tag cannot reach an argument forty lines up the same
 *       block. (The containing comment is still found first, so a numeral in a
 *       STRING LITERAL can be waived by the tail paragraph of the comment that
 *       introduces it — that is the same paragraph to a reader.)
 *
 *   (b) ONE TAG, ONE NUMERAL. Rule (a) alone leaves three sites where a dated
 *       figure and a live 172-claim sit in the SAME SENTENCE — "at stage <= 3
 *       over all 172 rooms, 57 arterial road tiles across 18 rooms sit
 *       [waived: ...] behind a 1-2 tile gap" — and a paragraph-wide tag shields
 *       the 172 as collateral. So a tag is assigned to the MATCHED CLAIM
 *       NEAREST TO IT within its own paragraph and to no other. This is how
 *       every tag in the tree is already written (they are all inserted
 *       immediately after the numeral they excuse); it just makes the placement
 *       load-bearing instead of decorative. Two dated numerals in one paragraph
 *       need two tags, which is also what a reader auditing them would want.
 *
 * A tag that ends up next to no matched claim at all is DEAD and is reported as
 * such — an excuse for a numeral that no longer exists is prose rot of its own.
 */
/** the [firstLine,lastLine] of the paragraph containing `lineIdx` */
function paragraphLines(lines, lineIdx, range, lineOf) {
  let a = lineIdx;
  let b = lineIdx;
  if (range && range.kind === "block") {
    a = lineOf(range.start);
    b = lineOf(Math.max(range.start, range.end - 1));
  } else {
    while (a > 0 && COMMENTISH.test(lines[a - 1])) a--;
    while (b < lines.length - 1 && COMMENTISH.test(lines[b + 1])) b++;
  }
  let pa = lineIdx;
  let pb = lineIdx;
  while (pa > a && !isParagraphBreak(lines[pa - 1])) pa--;
  while (pb < b && !isParagraphBreak(lines[pb + 1])) pb++;
  return [pa, pb];
}
/**
 * every `[r22-waived: ...]` tag in the file, with its offset and its reason.
 *
 * `[r22-waived: why]` is the PLACEHOLDER this gate's own failure message tells
 * an author to type, and plan.mjs quotes that message back at the console when
 * the audit fails a build. It is an instruction, not a waiver, and counting it
 * as one gives every numeral near it a free pass whose stated reason is the word
 * "why" — so the placeholder is the one string that is never a tag.
 */
export function waiverTags(src) {
  const re = new RegExp(WAIVER_RE.source, "g");
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const why = m[1].replace(/\s*\n\s*(?:\/\/|\*)?\s*/g, " ").trim();
    if (/^why$/i.test(why)) continue;
    // the tag's own SPAN, not just where it starts: a three-line reason is two
    // hundred characters wide, and measuring "how close is this tag to that
    // numeral" from its opening bracket makes every numeral AFTER the tag look
    // two hundred characters further away than it is — which is backwards,
    // because the tag is written immediately before the numeral it excuses at
    // least as often as immediately after it.
    out.push({ at: m.index, end: m.index + m[0].length, why });
  }
  return out;
}

// ---------------------------------------------------------------------------
// (5) THE RUN.
// ---------------------------------------------------------------------------
/** "<2+ digits> <up to three words>" — the raw shape of a quantity claim */
const NUMNOUN = /\b(\d[\d,]+)\s+([A-Za-z][A-Za-z+-]*(?:\s+[a-z][A-Za-z+-]*){0,2})/g;
/** words that make the match a sentence rather than a quantity */
const STOPWORDS = new Set(
  ("of and to the in on at by or for from per is are was were with a an it its this that these those " +
    "e t ms tick ticks more less other others than then so but as if when where which who whose over under " +
    "into onto out up down after before because while each every all any no not now here there they them")
    .split(" ")
    .filter(Boolean),
);
export function audit(plans) {
  const hits = [];
  /** every numeral+noun occurrence in audited prose, parsed or not — see OM4 */
  const numerals = { all: [], get seen() { return this.all.length; }, get parsed() { return this.all.filter((u) => u.parsed).length; }, get unparsed() { return this.all.filter((u) => !u.parsed); } };
  /** waiver tags that ended up next to no matched claim */
  const deadWaivers = [];
  for (const file of auditFiles()) {
    const rel = path.relative(REPO, file).replace(/\\/g, "/");
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
    // (a) every match, with the paragraph it lives in, and the hits it produced
    const matches = [];
    for (const r of ranges) {
      const text = src.slice(r.start, r.end);
      for (const pat of PATTERNS) {
        pat.re.lastIndex = 0;
        let m;
        while ((m = pat.re.exec(text))) {
          const at = r.start + m.index;
          const li = lineOf(at);
          const ctx = text.slice(Math.max(0, m.index - 120), m.index + m[0].length + 120);
          const [pa, pb] = paragraphLines(lines, li, r, lineOf);
          const mine = [];
          for (const c of pat.claims(m, ctx)) {
            const h = {
              file: rel,
              line: li + 1,
              pattern: pat.id,
              quote: m[0].replace(/\s+/g, " ").trim(),
              waiver: null,
              ...c,
            };
            hits.push(h);
            mine.push(h);
          }
          if (mine.length)
            matches.push({
              at,
              end: at + m[0].length,
              hits: mine,
              pStart: lineStarts[pa],
              pEnd: lineStarts[pb] + lines[pb].length,
            });
        }
      }
      // (a2) THE SCOPE CENSUS. Every "<number> <noun>" in this prose, so the
      // report can say how much of it the pattern library actually reads. A
      // single digit is almost always a size, a coordinate or an ordinal, so the
      // census starts at two digits — the shape a fleet claim takes — and a
      // numeral followed by a FUNCTION WORD ("14 of", "20 and", "1200 to") is a
      // number in a sentence, not a claim about a quantity, so it is not one.
      let n;
      NUMNOUN.lastIndex = 0;
      while ((n = NUMNOUN.exec(text))) {
        const w = n[2].replace(/\s+/g, " ").trim().toLowerCase().split(" ");
        while (w.length > 1 && STOPWORDS.has(w[w.length - 1])) w.pop();
        const noun = w.join(" ");
        if (STOPWORDS.has(w[0])) continue;
        const at = r.start + n.index;
        numerals.all.push({
          file: rel,
          line: lineOf(at) + 1,
          quote: n[0].replace(/\s+/g, " ").trim(),
          value: num(n[1]),
          noun,
          parsed: matches.some((mm) => at >= mm.at && at < mm.end),
        });
      }
    }
    // (b) ONE TAG, ONE NUMERAL — see the block above waiverTags()
    for (const g of waiverTags(src)) {
      let best = null;
      for (const mm of matches) {
        if (g.end < mm.pStart || g.at > mm.pEnd) continue;
        // gap between the two spans, zero if they touch or overlap
        const dist = Math.max(0, mm.at - g.end, g.at - mm.end);
        if (!best || dist < best.dist) best = { dist, mm };
      }
      if (!best) {
        deadWaivers.push({ file: rel, line: lineOf(g.at) + 1, why: g.why });
        continue;
      }
      for (const h of best.mm.hits) {
        if (h.waiver === null || best.dist < h.waiverDist) {
          h.waiver = g.why;
          h.waiverDist = best.dist;
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
  return { hits, resolved, waived, open, bad, pending, numerals, deadWaivers, registry: registrySelfTest(plans, numerals) };
}

/**
 * THE REGISTRY IS ASKED WHETHER IT BELIEVES ITSELF (MF4).
 *
 * `cut tiles` read `p.shell?.cut` for a whole round. There is no top-level
 * `shell` on this artifact — the cut is at `meta.shell.cut`, 7,234 tiles — so the
 * extractor measured 0 on all 172 rooms and registered the fleet's cut against
 * the string "0". Nothing noticed, because a registry entry that returns a
 * NUMBER is indistinguishable from a registry entry that returns the right
 * number, and this gate only ever compared extractors to prose, never to
 * plausibility.
 *
 * So: an extractor that reads 0 (or nothing) off a shipped artifact WHILE the
 * audited prose contains a positive claim about that very noun is a CONFIGURATION
 * ERROR, not a fleet that ships none of them, and it exits 1. The prose is the
 * witness — "7275 cut tiles across 172 rooms" and "the room's 50 cut tiles" are
 * both in the tree, so a cut-tile extractor reading 0 is refuted by the files it
 * is auditing. A quantity the fleet genuinely ships none of stays silent because
 * nobody wrote a sentence claiming otherwise.
 */
export function registrySelfTest(plans, numerals) {
  const entries = [
    ...Object.entries(QUANTITIES)
      .filter(([k]) => k !== "room")
      .map(([k, q]) => ({ label: `${k} shipped fleet-wide`, nouns: q.aliases, fn: q.total })),
    ...FLEET_EXTRACTORS,
  ];
  const out = [];
  for (const e of entries) {
    let measured;
    try {
      measured = e.fn(plans);
    } catch (err) {
      measured = undefined;
    }
    if (measured !== 0 && measured !== null && measured !== undefined) continue;
    // the prose's own positive claims about this noun, from the census above
    const nouns = e.nouns.map((a) => a.toLowerCase());
    const witnesses = (numerals?.all || [])
      .filter((u) => nouns.some((a) => ` ${u.noun} `.includes(` ${a} `)))
      .filter((u) => u.value > 0);
    if (!witnesses.length) continue;
    out.push({
      label: e.label,
      measured,
      witnesses: witnesses.slice(0, 3).map((w) => `${w.file}:${w.line} "${w.quote}"`),
      count: witnesses.length,
    });
  }
  return out;
}

export function report(res, { list = false } = {}) {
  const where = (h) => `${h.file}:${h.line}`;
  const out = [];
  // WAIVERS ARE COUNTED TWICE AND READ ONCE (OL5). "45 waived" was 27 SITES: an
  // "N X across M rooms" match yields two claims (the count and the room count)
  // and the waived line printed neither `what` nor `value`, so the two came out
  // as the same sentence twice and a reader counting sites got 45. The census
  // states both numbers and the list below prints one line per site with every
  // claim it carries named.
  const waivedSites = new Map();
  for (const h of res.waived) {
    const k = `${where(h)}|${h.quote}`;
    if (!waivedSites.has(k)) waivedSites.set(k, { h, claims: [] });
    waivedSites.get(k).claims.push(h);
  }
  out.push(
    `numeral audit — ${res.hits.length} fleet-numeral claim(s) matched over ${PATTERNS.length} recognised ` +
      `claim shape(s) · ${res.resolved.length} re-derived and correct · ${res.waived.length} waived ` +
      `at ${waivedSites.size} site(s) · ${res.open.length} unowned · ${res.bad.length} WRONG · ` +
      `${res.pending.length} in files not yet swept`,
  );
  // ...AND THE SCOPE OF THAT "0 WRONG" IS STATED, BECAUSE IT IS NOT THE PROSE
  // (OM4). The gate reads five claim shapes. Every other numeral-and-noun in the
  // audited comments — "40 extra personal ramparts", "120 personal ramparts,
  // forever" — is UNSEEN, not clean, and a report that prints "0 WRONG" with no
  // denominator for what it could not parse invites exactly the reading it does
  // not support.
  const un = res.numerals?.unparsed || [];
  if (res.numerals) {
    const byNoun = new Map();
    for (const u of un) byNoun.set(u.noun, (byNoun.get(u.noun) || 0) + 1);
    const top = [...byNoun.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
    out.push(
      `  scope — "${res.bad.length} WRONG" is a statement about those ${res.hits.length} claims and nothing ` +
        `else. ${res.numerals.seen} numeral+noun occurrence(s) sit in the audited prose; ${res.numerals.parsed} ` +
        `are read by the pattern library and ${un.length} are NOT PARSED by it, so they are unchecked rather ` +
        `than clean.` +
        (top.length
          ? ` Most frequent unparsed nouns: ${top.map(([nn, c]) => `${nn} (${c})`).join(" · ")}` +
            `${list ? `` : ` — --list prints all ${un.length}`}.`
          : ``),
    );
  }
  for (const p of res.registry || []) {
    out.push(
      `  REGISTRY ${p.label} measures ${p.measured === undefined ? "nothing" : p.measured} on this artifact ` +
        `while the audited prose makes ${p.count} positive claim(s) about it (${p.witnesses.join(" · ")}) — ` +
        `the extractor is reading the wrong field. Fix the registry; this is a config error, not a fleet ` +
        `that ships none of them.`,
    );
  }
  for (const d of res.deadWaivers || []) {
    out.push(`  DEAD-WAIVER ${d.file}:${d.line} — no matched claim sits beside this tag — "${d.why}"`);
  }
  if (list) {
    for (const h of res.resolved) out.push(`  ok    ${where(h)} — ${h.what} = ${h.value}   "${h.quote}"`);
    for (const u of un) out.push(`  unparsed ${u.file}:${u.line} — "${u.quote}"`);
  }
  for (const h of res.pending) {
    out.push(
      `  pending ${where(h)} — "${h.quote}" — ${h.what}` +
        (h.measured === null || h.measured === undefined ? ` is not in this gate's registry` : ` claims ${h.value}, the artifact ships ${h.measured}`) +
        ` (file not yet swept; see PENDING_FILES)`,
    );
  }
  for (const { h, claims } of waivedSites.values()) {
    out.push(
      `  waived ${where(h)} — "${h.quote}" — ` +
        `${claims.map((c) => `${c.what} = ${c.value}`).join(" + ")} — ${h.waiver}`,
    );
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
  return res.bad.length || res.open.length || res.registry.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(runAudit({ list: process.argv.includes("--list") }));
}
