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
 *
 * ROUND 24 — FOUR WAYS THIS GATE WAS BELIEVING ITSELF, each written up in full
 * above the code that fixes it:
 *
 *   THE WRAP-JOIN (MB, `scanRanges`/`joinedText`). A claim that hit the eighty-
 *   column margin was split across two prose ranges and matched by nothing. Two
 *   live wrong figures were sitting in that blind spot. Wrapped comment lines
 *   are now joined into one offset-preserving prose range before matching.
 *
 *   THE TWIN TEST (MC, `registryTwinTest`). The registry was only asked whether
 *   an extractor read ZERO. Every extractor with a second derivation available
 *   is now measured twice down two different paths and has to agree; the ones
 *   with no second path are printed as SINGLE-SOURCED rather than assumed fine.
 *
 *   LINE ENDINGS (MD, `normalizeEol`/`scannerSelfTest`). Every rule here is a
 *   distance in characters, so a CRLF checkout moved them all and could flip the
 *   gate with no numeral changed. Normalised, with a fixture read in three
 *   endings every run.
 *
 *   WAIVER SCOPE (MF, `waiverRefers`/`isParagraphBreak`). A tag now binds only
 *   to a claim it REFERS to — quoting its numeral or noun, or sitting nearer to
 *   it than to any other numeral in the prose — and a `// ----` divider ends a
 *   paragraph the way a blank line does.
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
 * LINE ENDINGS ARE NOT PART OF A CLAIM (MD, round 24).
 *
 * Everything below measures in OFFSETS: the scanner returns [start,end) pairs,
 * `lineOf` bisects a table of line starts, and the waiver scope is "how many
 * characters lie between this tag and that numeral". A CRLF checkout adds one
 * character per line, which moves every one of those distances — and the tag
 * scope is a distance comparison, so a tag that binds to the claim beside it on
 * an LF tree can bind to a different claim on a CRLF tree with not one numeral
 * changed. `git config core.autocrlf true` is the Windows default, so that is a
 * FRESH CLONE failing a build over a file-format setting, which is the least
 * defensible way for a gate to fail.
 *
 * So the source is normalised to LF before anything looks at it. Lone `\r`
 * (classic-Mac endings, and what a botched merge tool leaves behind) collapses
 * too, because a lone `\r` is a line break to a human reader and to `lines`
 * below it would be nothing at all. `crlfSelfTest` runs the whole scan path over
 * a CRLF copy of a fixture every run and asserts it reads identically.
 */
export function normalizeEol(src) {
  return String(src).replace(/\r\n?/g, "\n");
}
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

/**
 * THE WRAP-JOIN — A CLAIM THAT WRAPPED WAS A CLAIM THIS GATE COULD NOT SEE (MB).
 *
 * `proseRanges` is a LEXER: it returns one range per `//` line and one range per
 * `/* … *​/` block, which is the right answer to "where does the source say this
 * is prose" and the wrong unit to match a SENTENCE against. These comments are
 * hard-wrapped at eighty columns, so a claim longer than the tail of a line is
 * split across two ranges (a `//` run) or across a ` * ` continuation marker
 * (a block), and the pattern library — whose shapes are all "numeral, then a
 * noun phrase, then maybe `across N rooms`" — matched neither half.
 *
 * That was not a theoretical hole. It hid LIVE WRONG FIGURES: `validate.mjs`
 * wrote "They share one in 60 tiles / across 53 shipped rooms" over a line break
 * and `layer-walls.mjs` wrote "1774 of the / fleet's 14288 road tiles" over one,
 * and both sat in the audited tree reporting "0 WRONG" for as long as the gate
 * has existed. The gate's whole claim is that a numeral in these files is
 * re-derived; a numeral that wrapped was exempt from it by typography.
 *
 * THE JOIN IS OFFSET-PRESERVING, which is the only property that matters here.
 * Every consumer downstream — `lineOf`, the paragraph walk, the waiver distance
 * — indexes the ORIGINAL source, so the joined text is built as a same-length
 * rewrite of the slice: comment furniture (`//`, ` * `, `/**`) is blanked to
 * spaces and the newline between two wrapped lines becomes a space. Nothing
 * moves; `r.start + m.index` still points at the real character.
 *
 * TWO THINGS DELIBERATELY DO NOT JOIN.
 *
 *   A PARAGRAPH BREAK. A blank comment line, or a `// -----` divider, is where
 *   one argument ends and the next begins, and no claim wraps across one. Those
 *   lines are filled with NUL instead of spaces — NUL is matched by none of the
 *   pattern library's character classes (`\s`, `[A-Za-z+ -]`, `[\d,]`), so it is
 *   a wall a regex cannot step over, where a newline is not: `\s+` crosses a
 *   newline happily and would have stitched the last word of one paragraph to
 *   the first numeral of the next.
 *
 *   A `//` COMMENT THAT FOLLOWS CODE. Two `//` ranges merge only when the second
 *   one OWNS ITS LINE — nothing but whitespace before it — and exactly one
 *   newline separates them. `foo(); // seven` above `// tiles` is two comments
 *   about two statements to every reader of this file, and joining them would
 *   invent a claim nobody wrote.
 *
 * STRING LITERALS ARE LEFT EXACTLY AS THEY ARE. A template literal has no
 * comment furniture to strip and no paragraph convention to respect, and the
 * published strings this gate reads are built by concatenation, so the wrap in a
 * string is a `+` between two separate ranges rather than a line break inside
 * one. Rewriting them would only add ways to be wrong.
 */
/** a run of one punctuation character, three or more long: `-----`, `=====` */
const DIVIDER_RE = /^([-=*_~#+])\1{2,}$/;
/** the comment furniture at the head of a line, as it appears after the indent */
const FURNITURE_RE = /^[ \t]*(?:\/\/+|\/\*+|\*+(?!\/))[ \t]?/;
/** NUL, the one character no pattern in the library can match across */
const WALL = "\0";
export function joinedText(src, range) {
  const raw = src.slice(range.start, range.end);
  if (range.kind === "string") {
    // MM5 — a run of literals joined by `+` is ONE string, and the seams between
    // them are blanked in place so the sentence reads through them. Same length,
    // same offsets; see the header over `scanRanges`.
    if (!range.seams || !range.seams.length) return raw;
    const cells = raw.split("");
    for (const s of range.seams) {
      for (let k = s.from; k <= s.to && k - range.start < cells.length; k++) {
        if (k >= range.start) cells[k - range.start] = " ";
      }
    }
    return cells.join("");
  }
  const lines = raw.split("\n");
  const cells = raw.split("");
  let at = 0;
  const spans = [];
  for (const line of lines) {
    spans.push({ at, len: line.length, barrier: isParagraphBreak(line) });
    at += line.length + 1;
  }
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s.barrier) {
      // the break itself, plus the newline on either side of it, so no match can
      // reach through a blank line or a divider in either direction
      for (let k = s.at; k < s.at + s.len && k < cells.length; k++) cells[k] = WALL;
      if (s.at + s.len < cells.length) cells[s.at + s.len] = WALL;
      if (s.at > 0) cells[s.at - 1] = WALL;
      continue;
    }
    const f = FURNITURE_RE.exec(lines[i]);
    if (f) for (let k = s.at; k < s.at + f[0].length; k++) cells[k] = " ";
    // the newline that ends this line joins it to the next, unless the next line
    // is a barrier (handled above, which overwrites this)
    if (s.at + s.len < cells.length && cells[s.at + s.len] === "\n") cells[s.at + s.len] = " ";
  }
  return cells.join("");
}
/** true when `off` starts a comment that owns its line (only whitespace before) */
function ownsItsLine(src, off) {
  const nl = src.lastIndexOf("\n", off - 1);
  return /^[ \t]*$/.test(src.slice(nl + 1, off));
}
/**
 * the ranges the pattern library actually scans: `proseRanges` with adjacent
 * own-line `//` comments merged into one, each carrying its offset-preserving
 * joined `text`.
 */
/** the gap between two string literals that are ONE string at runtime: `+` and space */
const CONCAT_GAP_RE = /^\s*\+\s*$/;
/**
 * MM5 (round 25) — THE OTHER HALF OF THE WRAP-JOIN, WHICH WAS ARGUED AWAY.
 *
 * The header over `joinedText` says string literals are left exactly as they are
 * because "a template literal has no comment furniture to strip", which is true,
 * and then draws the wrong conclusion from it: that there is nothing to join.
 * There is. Every published sentence in this suite is built by CONCATENATION —
 * eighty-column source, so a paragraph is twenty backticked segments joined by
 * `+` — and the pattern library matched each segment on its own. A claim whose
 * numeral is at the end of one segment and whose noun is at the start of the
 * next was invisible to this gate for exactly the same reason a claim that
 * wrapped across two `//` lines was, and the earlier fix closed one and reasoned
 * itself out of the other.
 *
 * That blind spot has exactly one occupant on this build — validate.mjs's
 * PRINTED failure message quoting a census as `"27 refusals = 16 breaks-network
 * + 7 ` + `no-parallel + 4 seat"`, a figure carried wrong for three rounds
 * inside a sentence a reviewer reads when the gate fires. One is enough: a
 * gate's coverage is not "how many things it has caught", it is "what shape of
 * thing can hide from it", and this shape could.
 *
 * TWO STRING RANGES MERGE WHEN THE ONLY THING BETWEEN THEM IS `+` AND
 * WHITESPACE, which is the source form of "these are one string". The join is
 * offset-preserving like the other one: the closing quote, the `+`, the newline
 * and the indent are blanked to spaces in place, so `r.start + m.index` still
 * points at the real character and every waiver distance is unchanged. Nothing
 * merges across an interpolation, a function call or an operator that is not
 * `+` — `a + b` where either side is not a literal is not a range this scanner
 * produced in the first place.
 */
export function scanRanges(src) {
  const merged = [];
  for (const r of proseRanges(src)) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.kind === "line" &&
      r.kind === "line" &&
      ownsItsLine(src, r.start) &&
      /^\n[ \t]*$/.test(src.slice(prev.end, r.start))
    ) {
      prev.end = r.end;
      continue;
    }
    if (prev && prev.kind === "string" && r.kind === "string" && CONCAT_GAP_RE.test(src.slice(prev.end, r.start))) {
      // the seam: everything from this segment's closing quote through the next
      // segment's opening quote, blanked so the two bodies read as one sentence
      (prev.seams ||= []).push({ from: prev.end - 1, to: r.start });
      prev.end = r.end;
      continue;
    }
    merged.push({ start: r.start, end: r.end, kind: r.kind });
  }
  for (const r of merged) r.text = maskWaiverText(joinedText(src, r));
  return merged;
}
/**
 * A WAIVER'S OWN TEXT IS NOT A CLAIM (MB, and the rule MF then leans on).
 *
 * Almost every tag in this tree QUOTES the figure it excuses — that is what makes
 * a waiver auditable, and MF below makes the quoting mandatory. The wrap-join
 * made those quotes visible to the pattern library for the first time, and the
 * effect was perverse: `push-plan.mjs`'s tag says `the sentence below QUOTES the
 * rotted figure — "(E12S6, 123 roads)"`, so the tag became the NEAREST matched
 * claim to itself, waived its own quotation, and left the real sentence three
 * lines below it unwaived and WRONG.
 *
 * The excuse is prose ABOUT a numeral, not a statement OF one. So the tag spans
 * are masked out of the scanned text — same length, so every offset downstream
 * still lands on the real character — and a numeral inside `[r22-waived: … ]` is
 * neither a claim nor a census occurrence. The numeral it is talking about is
 * still right there in the sentence beside it, still matched, still checked.
 */
const WAIVER_SPAN_RE = /\[r22-waived:[^\]]*\]/g;
export function maskWaiverText(text) {
  return text.replace(WAIVER_SPAN_RE, (s) => WALL.repeat(s.length));
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

/**
 * EVERY DECLARATION THE FLEET FILES, PARTITIONED BY ITS CLASS.
 *
 * `${gate}/${kind}` -> `{ n, rooms }`. This is the census every completeness
 * denominator in `fleetTotals` is built out of ("the 133 rooms it applies to"),
 * and MM6 (round 25) is why it is a function instead of a loop inside that one:
 * the registry twin for the declaration total CLAIMED to be "the (gate/kind)
 * partition of fleetTotals, added back up" and was a second `for` loop over
 * `meta.shortfalls` counting entries with a gate. Two walks of one array under
 * two names is one derivation, and the `via` string was the part that made it
 * look like two.
 */
export function declarationPartition(P) {
  const byKind = new Map();
  for (const p of P) {
    const seen = new Set();
    for (const sf of p.meta?.shortfalls || []) {
      const k = `${sf?.gate}${sf?.kind ? `/${sf.kind}` : ``}`;
      const e = byKind.get(k) || { n: 0, rooms: 0 };
      e.n++;
      if (!seen.has(k)) {
        e.rooms++;
        seen.add(k);
      }
      byKind.set(k, e);
    }
  }
  return byKind;
}
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
  const byKind = declarationPartition(P);
  for (const [k, e] of byKind) {
    put(`${k} declarations`, e.n);
    put(`rooms declaring ${k}`, e.rooms);
  }
  return t;
}

// ---------------------------------------------------------------------------
// (3) THE PATTERN LIBRARY — the shapes a fleet claim takes in this codebase.
// ---------------------------------------------------------------------------
/**
 * ---------------------------------------------------------------------------
 * MM4 (round 26) — A NUMERAL SPELLED OUT IS STILL A NUMERAL, AND THIS GATE
 * COULD NOT SEE ONE.
 * ---------------------------------------------------------------------------
 * All five claim shapes below required DIGITS, so "layer 7 moves that cut in
 * seven of this fleet's rooms" was invisible to a gate whose whole job is to
 * stop a typed fleet figure from rotting. It was wrong — the answer is 29 — and
 * it was wrong in THREE files at once, published correct as digits by the same
 * round's own criticism. A blind spot that has one instance has one instance; a
 * blind spot that has the same instance copied three times is a class.
 *
 * So a numeral here is "digits OR a spelled-out number this gate knows", and
 * `num()` reads both. The vocabulary is deliberately small and closed —
 * zero..twenty and the dozen forms — because those are the counts English
 * actually spells out in technical prose; "a hundred and seventy-two" is not a
 * shape this codebase writes, and guessing at compound numerals would buy
 * matches at the price of false ones.
 *
 * WHERE IT IS NOT APPLIED, AND WHY, because an unstated exclusion is how the
 * first blind spot got in:
 *   `fleet-size` — its three shapes are 3-DIGIT room counts ("all 172 rooms",
 *     "172/172", the last with a backreference). No word form of 172 exists in
 *     this vocabulary and adding alternatives would renumber the backreference.
 *   `room-road-count` — "(E12S6, 124 roads)" is a generated-looking parenthetical
 *     that is never written in words.
 * The CENSUS, which is the report's honest denominator for what the library
 * cannot read, counts word numerals either way — that is where the size of this
 * blind spot is stated per run rather than argued about here.
 */
const WORD_NUMBERS = new Map([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
  ["half a dozen", 6],
  ["a dozen", 12],
  ["one dozen", 12],
  ["two dozen", 24],
  ["three dozen", 36],
]);
/** the alternation, longest first so "one dozen" wins over "one", first letter either case */
const wordAlt = (words) =>
  words
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`.replace(/ /g, "\\s+"))
    .join("|");
const WORD_NUM_SRC = wordAlt([...WORD_NUMBERS.keys()]);
/**
 * THE CENSUS TAKES THE SAME THRESHOLD IT ALREADY TOOK, IN THE OTHER SCRIPT.
 *
 * The digit census starts at TWO DIGITS on a stated argument: "a single digit is
 * almost always a size, a coordinate or an ordinal, so the census starts at two
 * digits — the shape a fleet claim takes". The word script has the identical
 * problem in a louder form — English writes "one grep", "one place", "one
 * answer" where it would never write "1 grep", and counting those as quantity
 * claims the library cannot read would triple the denominator with prose that
 * makes no claim at all (measured: 3092 occurrences against 245 for the
 * ten-and-over vocabulary). So the census's word branch is the words for values
 * a digit census would see, ten and up, and nothing is silently dropped: the
 * CLAIM SHAPES take the whole vocabulary, because "the fleet ships seven X" is a
 * quantity claim whatever the value is, and it is context and not size that
 * makes it one.
 */
const WORD_NUM_CENSUS_SRC = wordAlt([...WORD_NUMBERS].filter(([, v]) => v >= 10).map(([w]) => w));
/** a numeral in either script — digits, or a spelled-out number this gate knows */
const NUMERAL_SRC = `(?:[\\d,]+|(?:${WORD_NUM_SRC})(?![\\w-]))`;
const num = (s) => {
  const t = String(s).replace(/\s+/g, " ").trim().toLowerCase();
  if (WORD_NUMBERS.has(t)) return WORD_NUMBERS.get(t);
  return Number(t.replace(/,/g, ""));
};
/** was this occurrence spelled out rather than written in digits? */
const isWordNumeral = (s) => WORD_NUMBERS.has(String(s).replace(/\s+/g, " ").trim().toLowerCase());
/**
 * ONE SPACE BETWEEN WORDS. The wrap-join blanks comment furniture to spaces to
 * keep every offset where it was, so a noun phrase that crossed a line break
 * arrives here as `of              them` — fourteen spaces of blanked ` * `.
 * That is right for the offsets and wrong for every string a human reads or
 * that gets matched against an alias, so the noun and the report text are
 * collapsed the same way the quote already was.
 */
const tidy = (s) => String(s).replace(/\s+/g, " ").trim();
/**
 * MM4 — A SPELLED-OUT MATCH ONLY BECOMES A CLAIM WHEN ITS NOUN IS ONE THIS GATE
 * CAN MEASURE, AND THAT RESTRICTION IS THE PRICE OF THE SCRIPT.
 *
 * "the fleet's 14100 roads" is a typed figure and nothing else; the digits are
 * what make it one, which is why an unresolvable digit claim is reported OPEN
 * and has to be waived by a human — the shape is unmistakable, so a numeral in
 * it that nobody can measure deserves the argument. English does not behave that
 * way. "the fleet's four WORST rooms", "the fleet's one honest disagreement",
 * "the fleet ships one today" are ordinary sentences, not typed quantities, and
 * the same pattern reads them as claims about "WORST rooms", "honest
 * disagreement" and "today". Measured across this tree that is twenty-five
 * unowned claims manufactured out of prose that asserts no fleet total, against
 * a handful of real ones.
 *
 * So: a spelled-out match produces a claim when the noun resolves to a registry
 * quantity — where the gate can actually check it, which is the whole point of
 * seeing it — and produces NOTHING when it does not, rather than an OPEN nobody
 * can close except with a waiver. Digit matches are untouched and still open.
 * What this restriction costs is stated rather than hidden: a wrong spelled-out
 * figure about a noun with no extractor is still invisible to this gate, and the
 * census below is where its size is published every run.
 */
const wordClaimIsMeasurable = (raw, k) => !!k || !isWordNumeral(raw);
/**
 * Every pattern returns zero or more CLAIMS: `{ what, value, resolve }`, where
 * `resolve(P)` gives the measured value or null when this gate cannot read it.
 * `what` is the human-readable subject printed in the report.
 */
export const PATTERNS = [
  {
    id: "fleet-ships",
    // "this fleet ships 62 such tiles" · "the fleet ships 8208 ramparts"
    // · "this fleet ships seven such rooms" (MM4 — spelled out is still a claim)
    re: new RegExp(
      `\\b(?:this|the)\\s+fleet\\s+ships\\s+(${NUMERAL_SRC})\\s+([A-Za-z+][A-Za-z+ -]{0,30})`,
      "g",
    ),
    claims: (m) => {
      const k = quantityFor(m[2]);
      if (!wordClaimIsMeasurable(m[1], k)) return [];
      return [
        {
          what: `fleet total of ${k || `"${tidy(m[2])}"`}`,
          noun: tidy(m[2]),
          value: num(m[1]),
          resolve: (P) => (k ? QUANTITIES[k].total(P) : null),
        },
      ];
    },
  },
  {
    id: "fleet-possessive",
    // "the fleet's 14100 roads" · "the fleet's seven rooms" (MM4)
    re: new RegExp(
      `\\bthe\\s+fleet(?:'s|s')\\s+(${NUMERAL_SRC})\\s+([A-Za-z+][A-Za-z+ -]{0,30})`,
      "g",
    ),
    claims: (m) => {
      const k = quantityFor(m[2]);
      if (!wordClaimIsMeasurable(m[1], k)) return [];
      return [
        {
          what: `fleet total of ${k || `"${tidy(m[2])}"`}`,
          noun: tidy(m[2]),
          value: num(m[1]),
          resolve: (P) => (k ? QUANTITIES[k].total(P) : null),
        },
      ];
    },
  },
  {
    id: "n-across-m-rooms",
    // "62 tiles across 55 shipped rooms" · "25 shallow extensions across 3 rooms"
    //
    // THE LEADING NUMERAL MAY NOT BE THE TAIL OF A HYPHENATED WORD. `\b` fires
    // between the hyphen and the digit of "stage-3", so push-plan's "Fleet-wide
    // 57 stage-3 tiles across 18 rooms" was read as the claim "3 tiles across
    // 18 rooms" — a figure that sentence does not make, reported OPEN against a
    // quantity nobody had typed. The wrap-join above is what let this pattern
    // see whole sentences, so it is what surfaced it, and the guard belongs to
    // the same fix: a digit glued to a preceding word character or hyphen is
    // part of that word — a stage number, a range, an RCL level — and not the
    // head of a claim.
    re: new RegExp(
      `(?<![\\w-])(${NUMERAL_SRC})\\s+([A-Za-z+][A-Za-z+ -]{0,30}?)\\s+across\\s+(${NUMERAL_SRC})\\s+(?:shipped\\s+|planned\\s+)?rooms?\\b`,
      "g",
    ),
    claims: (m) => {
      const k = quantityFor(m[2], ROSTER_KEYS);
      // both numerals have to be readable for either claim to mean anything
      if (!wordClaimIsMeasurable(m[1], k) || !wordClaimIsMeasurable(m[3], k)) return [];
      return [
        {
          what: `total of ${k || `"${tidy(m[2])}"`} across the fleet`,
          noun: tidy(m[2]),
          value: num(m[1]),
          resolve: (P) => (k ? QUANTITIES[k].total(P) : null),
        },
        {
          what: `rooms carrying ${k || `"${tidy(m[2])}"`}`,
          noun: `rooms`,
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
          noun: `rooms`,
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
        noun: `roads`,
        room: m[1],
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
/**
 * A DIVIDER IS A PARAGRAPH BREAK, AND PRETENDING OTHERWISE GAVE TAGS A DOOR (MF).
 *
 * This codebase separates the sections of a long comment with a rule — `// ----`,
 * ` * ====` — far more often than with a blank line, because the rule is what a
 * reader's eye stops at. The paragraph walk only recognised BLANK, so a `// ----`
 * was just another line of prose to it and the "nearest paragraph" a waiver could
 * search ran straight through the section heading into the section above or below.
 * Nine of the twenty-seven shipped tags reached eleven to twenty lines that way,
 * which is not a paragraph by anyone's reading and is exactly the over-reach the
 * paragraph rule was introduced to end.
 *
 * A line of three or more of the same punctuation character, once the comment
 * furniture is off, is a rule and nothing else — there is no sentence it can be
 * confused with, and requiring the character to REPEAT ITSELF keeps "..." and an
 * em-dash line from being read as one.
 */
export const isParagraphBreak = (l) => {
  const p = proseOfLine(l);
  return p === "" || DIVIDER_RE.test(p);
};
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
 *   (c) THE TAG HAS TO REFER TO THE CLAIM (MF, round 24). Rules (a) and (b)
 *       together still say "nearest wins", and "nearest" is a fact about
 *       typography rather than about meaning. The great majority of the numerals
 *       in this prose are NOT PARSED by the pattern library — the report prints
 *       that denominator every run — and a tag is written beside the numeral its
 *       author was excusing, which is very often one of the unparsed ones.
 *       Nearest-wins then hands the excuse to the nearest PARSED claim
 *       instead, which is a different sentence, and prints its reason beside it
 *       so the report reads plausible. That is the same failure as (a) with a
 *       smaller radius, and it is worse to read, because the excuse now looks
 *       precisely placed.
 *
 *       So a tag binds only where it REFERS to the claim, and there are exactly
 *       two ways a tag can do that:
 *
 *         QUOTED — the tag's own text contains the claim's numeral (bare or
 *           comma-grouped) or the claim's noun. This is the strong form and the
 *           one to write: "[r22-waived: the 60/53 reading is pre-fix …]" says
 *           what it excuses out loud, and stays right when the prose around it
 *           is re-flowed. The report names the mode every tag bound by, so the
 *           waiver list states how many of its own entries are the strong kind.
 *
 *         ADJACENT — nothing numeric lies BETWEEN the tag and the claim: no
 *           other matched claim and no other numeral+noun occurrence from the
 *           census. "Written immediately beside it" is a reference by position,
 *           and it is how every other tag in this tree is placed. What it no
 *           longer permits is REACHING PAST a numeral: a tag beside an unparsed
 *           "40 extra personal ramparts" cannot skip over it to waive the
 *           "all 172 rooms" further down the paragraph, because the numeral it
 *           was actually written about is in the way. (The census starts at two
 *           digits, so a tag written beside a one-digit figure is still only
 *           held by rule (b); the report prints the measured value beside every
 *           waiver now, which is the reader's check on that.)
 *
 * A tag that ends up next to no matched claim at all is DEAD and is reported as
 * such — an excuse for a numeral that no longer exists is prose rot of its own.
 */
/** the numeral as prose writes it: bare, and comma-grouped for the thousands */
function numeralForms(v) {
  const bare = String(v);
  const grouped = Number.isFinite(v) ? Number(v).toLocaleString("en-US") : bare;
  return grouped === bare ? [bare] : [bare, grouped];
}
/** `why` states this number, not merely a longer number containing its digits */
function quotesNumber(why, form) {
  const esc = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\d,.])${esc}(?![\\d,.]*\\d)`).test(why);
}
/**
 * the strings a claim may be NAMED by in an excuse: its noun phrase, the last
 * word of it, and the room it is about. Words shorter than four letters are
 * dropped — "of", "in", "the" appear in every reason ever written and matching
 * on them would make the quoting test a formality.
 */
export function claimNouns(h) {
  const out = new Set();
  const raw = tidy(h.noun || "").toLowerCase();
  if (raw) {
    out.add(raw);
    const w = raw.split(" ").filter(Boolean);
    for (const one of w) out.add(one);
  }
  if (h.room) out.add(String(h.room).toLowerCase());
  return [...out].filter((s) => s.length >= 4);
}
/**
 * does `g` refer to `mm` — by quoting it, or by sitting beside it? Returns HOW,
 * because the report prints it: "quoted" is a tag that will still be right after
 * the paragraph is re-flowed, "adjacent" is a tag held up by where it sits, and a
 * reader auditing the waiver list wants to know which of the two he is reading.
 */
function waiverRefers(g, mm, censusHere, matches) {
  const why = g.why.toLowerCase();
  for (const h of mm.hits) {
    for (const form of numeralForms(h.value)) if (quotesNumber(why, form)) return "quoted";
    for (const nn of claimNouns(h)) if (why.includes(nn)) return "quoted";
  }
  // ADJACENCY IS MEASURED AGAINST EVERY NUMERAL, NOT ONLY THE MATCHED ONES.
  // "Nearest matched claim wins" is what let a tag written about an unparsed
  // figure drift: the figure it was about is invisible to the comparison, so the
  // matched claim thirty characters further on wins by default. The tag's
  // referent is the numeral CLOSEST TO IT in the prose, whether this gate can
  // parse that numeral or not — so a claim only counts as adjacent when no other
  // numeral occurrence sits nearer to the tag than it does.
  const gap = (x, y) => Math.max(0, y.at - x.end, x.at - y.end);
  const d = gap(g, mm);
  for (const u of censusHere) {
    // one of this claim's own numerals. Membership is decided by where the
    // occurrence STARTS, exactly as the `parsed` flag decides it: the census
    // grabs up to three words after a numeral, so "23 rooms and the" begins
    // inside "65 such tiles shipped across 23 rooms" and ends four words past
    // it, and an end-inclusive test would count a claim's own room-count as a
    // rival numeral sitting four characters from the tag.
    if (u.at >= mm.at && u.at < mm.end) continue;
    if (gap(g, u) < d) return null;
  }
  for (const o of matches) {
    if (o === mm) continue;
    if (gap(g, o) < d) return null;
  }
  return "adjacent";
}
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
/**
 * "<2+ digits, or a spelled-out number> <up to three words>" — the raw shape of
 * a quantity claim. The word branch is MM4's: the census is where this report
 * states how much prose the pattern library cannot read, so a whole script of
 * numerals being absent from it made that denominator flattering rather than
 * honest. The digit branch is untouched, deliberately — changing both at once
 * would have moved the scope figures for two reasons at the same time.
 */
const NUMNOUN = new RegExp(
  `(\\b\\d[\\d,]+|(?<![\\w-])(?:${WORD_NUM_CENSUS_SRC})(?![\\w-]))\\s+([A-Za-z][A-Za-z+-]*(?:\\s+[a-z][A-Za-z+-]*){0,2})`,
  "g",
);
/** words that make the match a sentence rather than a quantity */
const STOPWORDS = new Set(
  ("of and to the in on at by or for from per is are was were with a an it its this that these those " +
    "e t ms tick ticks more less other others than then so but as if when where which who whose over under " +
    "into onto out up down after before because while each every all any no not now here there they them")
    .split(" ")
    .filter(Boolean),
);
/**
 * ONE FILE'S WHOLE READING, AS A FUNCTION OF ITS TEXT.
 *
 * This used to be the body of a `for (const file of auditFiles())` loop, which
 * meant the only way to ask what this gate does with a given piece of prose was
 * to write that prose into a file in the tree and run the whole build. Every
 * rule that has ever gone wrong here — the waiver scope, the paragraph walk, the
 * wrap-join, the line endings — is a rule about ONE STRING, so it takes a string
 * and returns everything it read, and `scannerSelfTest` below drives it over
 * fixtures that carry the failures on purpose.
 */
export function scanSource(rel, rawSrc) {
  const hits = [];
  /** every numeral+noun occurrence in this file's prose, parsed or not — see OM4 */
  const census = [];
  /** waiver tags that ended up next to no matched claim */
  const deadWaivers = [];
  {
    // LF first (MD), then the wrap-join (MB): every offset below — the paragraph
    // table, `lineOf`, the tag-to-claim distance — is an index into THIS string,
    // and `scanRanges` guarantees its `text` is the same length as the slice it
    // rewrites, so a match index in the joined prose is a real source offset.
    const src = normalizeEol(rawSrc);
    const ranges = scanRanges(src);
    const lines = src.split("\n");
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
      const text = r.text;
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
        census.push({
          file: rel,
          // the OFFSET as well as the line: the waiver-binding rule below asks
          // "does another numeral sit between this tag and that claim", and that
          // is a question about character positions, not about lines
          at,
          end: at + n[0].length,
          line: lineOf(at) + 1,
          quote: n[0].replace(/\s+/g, " ").trim(),
          value: num(n[1]),
          noun,
          word: isWordNumeral(n[1]),
          parsed: matches.some((mm) => at >= mm.at && at < mm.end),
        });
      }
    }
    // (b) ONE TAG, ONE NUMERAL and (c) THE TAG HAS TO REFER TO THE CLAIM — see
    // the block above waiverTags()
    const censusHere = census;
    for (const g of waiverTags(src)) {
      let best = null;
      for (const mm of matches) {
        if (g.end < mm.pStart || g.at > mm.pEnd) continue;
        const via = waiverRefers(g, mm, censusHere, matches);
        if (!via) continue;
        // gap between the two spans, zero if they touch or overlap
        const dist = Math.max(0, mm.at - g.end, g.at - mm.end);
        if (!best || dist < best.dist) best = { dist, mm, via };
      }
      if (!best) {
        deadWaivers.push({ file: rel, line: lineOf(g.at) + 1, why: g.why });
        continue;
      }
      for (const h of best.mm.hits) {
        if (h.waiver === null || best.dist < h.waiverDist) {
          h.waiver = g.why;
          h.waiverDist = best.dist;
          h.waiverVia = best.via;
        }
      }
    }
  }
  return { hits, census, deadWaivers };
}

export function audit(plans) {
  const hits = [];
  /** every numeral+noun occurrence in audited prose, parsed or not — see OM4 */
  const numerals = { all: [], get seen() { return this.all.length; }, get parsed() { return this.all.filter((u) => u.parsed).length; }, get unparsed() { return this.all.filter((u) => !u.parsed); } };
  /** waiver tags that ended up next to no matched claim */
  const deadWaivers = [];
  for (const file of auditFiles()) {
    const rel = path.relative(REPO, file).replace(/\\/g, "/");
    const one = scanSource(rel, fs.readFileSync(file, "utf8"));
    hits.push(...one.hits);
    numerals.all.push(...one.census);
    deadWaivers.push(...one.deadWaivers);
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
  return {
    hits,
    resolved,
    waived,
    open,
    bad,
    pending,
    numerals,
    deadWaivers,
    registry: registrySelfTest(plans, numerals),
    twins: registryTwinTest(plans),
    selfTest: scannerSelfTest(),
  };
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

/**
 * THE SCANNER IS RUN TWICE OVER THE SAME PROSE IN TWO LINE ENDINGS (MD).
 *
 * "Normalise the line endings at read time" is a one-line fix and it is the kind
 * of one-line fix that silently stops being true: somebody adds a second reader,
 * or a helper that takes a path instead of a string, and the CRLF path is live
 * again with nothing to say so. There is no CRLF file in this tree to notice it
 * on, because the tree is checked out LF here — which is exactly why the failure
 * would land on somebody else's fresh clone and not on the author's.
 *
 * So the test carries its own fixture and asserts the WHOLE scan path — the
 * ranges, the wrap-join, the paragraph breaks, the waiver spans, the matched
 * claims and the line numbers they report — reads identically on `\n`, on
 * `\r\n` and on a lone `\r`. The fixture is deliberately made of the shapes that
 * broke: a claim wrapped across two `//` lines, a claim wrapped across a ` * `
 * continuation, a divider, and a waiver tag whose reason wraps.
 *
 * Its own numerals are FICTIONAL and stated as such, and it lives in a string
 * this gate does not audit (numeral-audit.mjs is excluded from `auditFiles`), so
 * nothing here is a claim about the fleet that could rot.
 */
export const CRLF_FIXTURE = [
  "// a header",
  "// the fleet's 4242 roads and a wrapped clause that carries 99 tiles",
  "// across 77 rooms, which is the shape that used to vanish at the margin.",
  "// ----------------------------------------------------------------",
  "// after a divider, all 172 rooms [r22-waived: a fixture reason that",
  "// itself wraps over two lines and quotes 172]",
  "const x = 1;",
  "/**",
  " * a block header that says the fleet ships 8208 ramparts and then wraps a",
  " * second claim of 62 road+container tiles across 55 rooms over the star.",
  " */",
  // MM5 — and the OTHER seam a claim can hide in: a published sentence built by
  // concatenation, with the numeral in one segment and the noun in the next.
  "const s =",
  "  `a published sentence saying the fleet ships 4242 ` +",
  "  `roads, split across a concatenation seam` +",
  "  ` and joined back into one claim`;",
  // MM4 — and the script a claim can hide in: the same shape, spelled out. The
  // noun is a registry quantity on purpose — see wordClaimIsMeasurable, which is
  // the rule this fixture is here to hold in place.
  "// this fleet ships seven ramparts, spelled out, which is the shape that was",
  "// exempt from this gate by orthography until round 26.",
  "",
].join("\n");
/** the scan path's whole visible output for one source string, as a flat list */
function scanFingerprint(src) {
  const s = normalizeEol(src);
  const lines = s.split("\n");
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
  const out = [];
  for (const r of scanRanges(s)) {
    out.push(`range ${r.kind} @${lineOf(r.start) + 1}-${lineOf(Math.max(r.start, r.end - 1)) + 1}`);
    for (const pat of PATTERNS) {
      pat.re.lastIndex = 0;
      let m;
      while ((m = pat.re.exec(r.text))) {
        const at = r.start + m.index;
        for (const c of pat.claims(m, r.text))
          out.push(`${pat.id} @${lineOf(at) + 1} ${c.what} = ${c.value} "${tidy(m[0])}"`);
      }
    }
  }
  for (const g of waiverTags(s)) out.push(`waiver @${lineOf(g.at) + 1} "${g.why}"`);
  return out;
}
export function scannerSelfTest() {
  const fails = [];
  const lf = scanFingerprint(CRLF_FIXTURE);
  for (const [name, variant] of [
    ["CRLF", CRLF_FIXTURE.replace(/\n/g, "\r\n")],
    ["lone CR", CRLF_FIXTURE.replace(/\n/g, "\r")],
  ]) {
    const got = scanFingerprint(variant);
    if (JSON.stringify(got) !== JSON.stringify(lf))
      fails.push(
        `the scanner reads a ${name} checkout differently from an LF one — ` +
          `LF ${JSON.stringify(lf)} vs ${name} ${JSON.stringify(got)}`,
      );
  }
  // and the fixture has to actually exercise the wrap-join, or the comparison
  // above is two identical readings of nothing
  const wrapped = lf.filter((l) => /n-across-m-rooms|fleet-possessive|fleet-ships/.test(l));
  if (wrapped.length < 6)
    fails.push(`the CRLF fixture stopped matching wrapped claims (${wrapped.length} of the 6 it carries)`);
  if (!lf.some((l) => /fleet-size @5/.test(l)))
    fails.push(`the CRLF fixture's post-divider claim is no longer read on the line it sits on`);
  // MM5 — the concatenation seam. The fixture's last claim has its numeral in one
  // string literal and its noun in the next, which is the shape that was exempt
  // from this gate by typography until round 25.
  if (!lf.some((l) => /fleet-ships .* = 4242/.test(l)))
    fails.push(
      `the CRLF fixture's concatenated claim is not matched — a claim split across a \`+\` seam is ` +
        `invisible again, which is the blind spot MM5 closed`,
    );
  // MM4 — the spelled-out claim, and the value it has to READ (7, not NaN)
  if (!lf.some((l) => /fleet-ships .* = 7\b/.test(l)))
    fails.push(
      `the CRLF fixture's spelled-out claim ("this fleet ships seven imaginary widgets") is not matched ` +
        `as the value 7 — a numeral written in words is invisible again, which is the blind spot MM4 closed`,
    );
  fails.push(...waiverScopeSelfTest());
  return fails;
}
/**
 * THE WAIVER SCOPE IS TESTED ON PROSE THAT IS SUPPOSED TO DEFEAT IT (MF).
 *
 * Every one of these three fixtures is a shape the old rule got wrong, written
 * out so the rule cannot quietly go back to getting it wrong. They are the whole
 * argument of rule (c) in executable form: a tag reaches the numeral it is about
 * and no further, a divider is a wall, and quoting the figure beats both.
 *
 * The numerals in them are FICTIONAL and this file is not audited, so none of
 * them is a claim about the fleet.
 */
export function waiverScopeSelfTest() {
  const fails = [];
  const check = (name, src, want) => {
    const one = scanSource("fixture.mjs", src);
    const claim = one.hits.find((h) => h.pattern === "fleet-ships");
    if (!claim) {
      fails.push(`waiver fixture "${name}" no longer produces the claim it is built around`);
      return;
    }
    const got = claim.waiver ? claim.waiverVia : "unwaived";
    if (got !== want) fails.push(`waiver fixture "${name}" expected ${want}, got ${got}`);
    if (want === "unwaived" && one.deadWaivers.length !== 1)
      fails.push(`waiver fixture "${name}" should report its unbound tag DEAD (${one.deadWaivers.length} reported)`);
  };
  // (1) a tag written beside an unparsed numeral may not reach past it
  check(
    "reaches past the numeral it was written about",
    ["// the pass moved 40 extra widgets [r22-waived: a fixture reason with no figure in it]", "// and this fleet ships 8208 rampart tiles."].join("\n"),
    "unwaived",
  );
  // (2) a divider ends the paragraph, so a tag on the far side of one is out of scope
  check(
    "reaches across a divider",
    [
      "// this fleet ships 8208 rampart tiles.",
      "// ------------------------------------------------------------------",
      "// [r22-waived: a fixture reason that quotes 8208 and still may not reach]",
    ].join("\n"),
    "unwaived",
  );
  // (3) quoting the figure binds even where something else sits nearer
  check(
    "quotes the figure over a nearer numeral",
    ["// this fleet ships 8208 rampart tiles, then 40 unrelated widgets, then", "// [r22-waived: a fixture reason that quotes 8208]"].join("\n"),
    "quoted",
  );
  return fails;
}

/**
 * THE TWIN TEST — AN EXTRACTOR IS CHECKED AGAINST A SECOND DERIVATION (MC).
 *
 * `registrySelfTest` above only catches an extractor that reads NOTHING. That is
 * the failure the dead `p.shell?.cut` entry had, and it is the least interesting
 * one: an extractor that returns a plausible number off the WRONG FIELD passes it
 * untouched. Point `cut tiles` at `meta.shell.battlements` and it reads 5,823
 * instead of 7,234; point the road total at `structures.rampart` and it reads
 * 8,208 instead of 14,100. Both are positive, both are stable, and the gate would
 * have gone on marking prose "re-derived and correct" against a quantity that is
 * not the one the sentence is about. That is worse than no gate, because the
 * report says the number was checked.
 *
 * So each extractor is asked for its answer TWICE, down two different paths
 * through the artifact, and a disagreement exits 1. What makes a path a second
 * path rather than a copy is that it reads DIFFERENT FIELDS or aggregates them
 * DIFFERENTLY, so that a mis-pointed extractor and its twin cannot move together:
 *
 *   meta.counts.*        the per-room structure census the composer publishes
 *                        beside the tile arrays. Repointing a structure total at
 *                        another structure moves the array sum and leaves the
 *                        census where it was.
 *   the rampart upkeep   `meta.shell.upkeepPerTick` is an ECONOMIC figure — energy
 *                        per tick to hold the shell — computed by the shell layer
 *                        from the decay rule (300 hits per 100 ticks, 100 hits
 *                        repaired per energy = 0.03 e/tick each). Divide it back
 *                        out and it counts ramparts, through arithmetic that
 *                        never touches a tile array at all.
 *   the cut's ramparts   the cut curve is what the fleet puts ramparts ON, so
 *                        walking `structures.rampart` and asking which tiles the
 *                        declared cut contains counts the same set from the other
 *                        end. A cut extractor repointed at the battlements reads
 *                        5,823 while this still reads 7,234.
 *   the partition sum    declarations counted by (gate/kind) bucket and the
 *                        buckets added up — the census `fleetTotals` builds for
 *                        its denominators — rather than by array length, with
 *                        each bucket's own room count held against its entry
 *                        count. (Round 25: this entry SAID that and did not do
 *                        it. See MM6 on the twin itself, including what a
 *                        partition of one array can and cannot catch.)
 *   the record twin      `meta.notes` is prose and `meta.noteRecords` is the
 *                        machine-readable record behind it; every note has one.
 *   distinctness         172 entries is not the same statement as 172 distinct
 *                        room names, and a duplicated room would separate them.
 *
 * AN EXTRACTOR WITH NO SECOND PATH IS NOT SILENTLY FINE, IT IS SINGLE-SOURCED,
 * and the report names it as such every run. That roster is the honest statement
 * of how much of the registry this test actually covers, and it is the list to
 * shorten — not a thing to leave implicit and let a reader assume away.
 */
const RAMPART_UPKEEP_PER_TICK = 0.03;
export const REGISTRY_TWINS = {
  "rooms in the fleet": {
    via: "distinct room names, not array length",
    fn: (P) => new Set(P.map((p) => p.room)).size,
  },
  "road shipped fleet-wide": { via: "meta.counts.road", fn: (P) => sum(P, (p) => p.meta?.counts?.road) },
  "rampart shipped fleet-wide": {
    via: `meta.shell.upkeepPerTick / ${RAMPART_UPKEEP_PER_TICK} e per rampart per tick`,
    fn: (P) => Math.round(sum(P, (p) => p.meta?.shell?.upkeepPerTick) / RAMPART_UPKEEP_PER_TICK),
  },
  "extension shipped fleet-wide": { via: "meta.counts.extension", fn: (P) => sum(P, (p) => p.meta?.counts?.extension) },
  "container shipped fleet-wide": { via: "meta.counts.container", fn: (P) => sum(P, (p) => p.meta?.counts?.container) },
  "tower shipped fleet-wide": { via: "meta.counts.tower", fn: (P) => sum(P, (p) => p.meta?.counts?.tower) },
  "lab shipped fleet-wide": { via: "meta.counts.lab", fn: (P) => sum(P, (p) => p.meta?.counts?.lab) },
  "link shipped fleet-wide": { via: "meta.counts.link", fn: (P) => sum(P, (p) => p.meta?.counts?.link) },
  "spawn shipped fleet-wide": { via: "meta.counts.spawn", fn: (P) => sum(P, (p) => p.meta?.counts?.spawn) },
  "observer shipped fleet-wide": { via: "meta.counts.observer", fn: (P) => sum(P, (p) => p.meta?.counts?.observer) },
  "extractor shipped fleet-wide": { via: "meta.counts.extractor", fn: (P) => sum(P, (p) => p.meta?.counts?.extractor) },
  "nuker shipped fleet-wide": { via: "meta.counts.nuker", fn: (P) => sum(P, (p) => p.meta?.counts?.nuker) },
  "cut tiles": {
    via: "the ramparts standing on the declared cut curve",
    fn: (P) =>
      sum(P, (p) => {
        const cut = new Set((p.meta?.shell?.cut || []).map((t) => `${t.x},${t.y}`));
        return (p.structures?.rampart || []).filter((r) => cut.has(`${r.x},${r.y}`)).length;
      }),
  },
  // MM6 (round 25) — THIS ONE USED TO BE A COPY WEARING A SECOND PATH'S NAME.
  //
  // The `via` said "the (gate/kind) partition of fleetTotals, added back up" and
  // the function was `for (room) for (shortfall) if (sf.gate) n++` — the same
  // walk of the same array as the primary, with a filter on it. Whatever the
  // primary read wrong, this read wrong beside it; the only mutation it could
  // ever have caught is one that removes a `gate`.
  //
  // It goes through the partition now, and the partition is where the second
  // reading comes from: the entries are bucketed by CLASS first and the buckets
  // are added back up, so the sum has to survive two properties the flat count
  // does not have. A bucket that does not name a class — a `null`/`undefined`
  // gate — is not a declaration class and poisons the total rather than being
  // silently dropped the way the old filter dropped it. And each bucket carries
  // its own room count, which cannot exceed its entry count or fall below one:
  // an entry laundered into the census through a fabricated class breaks that
  // lattice as soon as the two counters stop describing the same set.
  //
  // STATED HONESTLY, BECAUSE THIS IS THE FILE THAT NAMES ITS OWN COVERAGE: a
  // fabricated entry carrying a WELL-FORMED class still moves both readings
  // together, because `meta.shortfalls` is the only channel that carries the
  // declarations at all and no second path out of one array can be more
  // independent than the array. What this catches is a fabricated or corrupted
  // CLASS — which is what a planted declaration looks like — and what the
  // registry's `single` roster exists to admit is exactly this kind of limit.
  "declaration shipped fleet-wide": {
    via: "the gate/kind partition, bucketed by class and added back up, with each bucket's room count held to its entry count",
    fn: (P) => {
      const part = declarationPartition(P);
      let n = 0;
      for (const [k, e] of part) {
        if (!k || /^(?:null|undefined)/.test(k)) return NaN;
        if (!(e.rooms >= 1 && e.rooms <= e.n)) return NaN;
        n += e.n;
      }
      return n;
    },
  },
  "note shipped fleet-wide": {
    via: "meta.noteRecords, the machine-readable twin of every note",
    fn: (P) => sum(P, (p) => (p.meta?.noteRecords || []).length),
  },
  "planner notes": {
    via: "meta.noteRecords, the machine-readable twin of every note",
    fn: (P) => sum(P, (p) => (p.meta?.noteRecords || []).length),
  },
  "shallowExt shipped fleet-wide": {
    via: "meta.noteRecords[cls=shallowExt].rec.shallowNow, the note's own reading",
    fn: (P) =>
      sum(P, (p) =>
        (p.meta?.noteRecords || [])
          .filter((e) => e && e.cls === "shallowExt")
          .reduce((s, e) => s + (e.rec?.shallowNow || 0), 0),
      ),
  },
  "source works": {
    via: "meta.shell.srcEnclosed, one verdict per source work",
    fn: (P) => sum(P, (p) => (p.meta?.shell?.srcEnclosed || []).length),
  },
  controllers: {
    via: "rooms with a meta.pathController route",
    fn: (P) => countRooms(P, (p) => p.meta?.pathController != null),
  },
  minerals: { via: "rooms with a meta.mineralSeat", fn: (P) => countRooms(P, (p) => p.meta?.mineralSeat) },
  "sealed tiles": {
    via: "meta.sealedFloor.pockets, the partition the tile count is of",
    fn: (P) => sum(P, (p) => (p.meta?.sealedFloor?.pockets || []).reduce((s, q) => s + (q.tiles || 0), 0)),
  },
};
/** every registry entry, with the label the twin table keys on */
export function registryEntries() {
  return [
    ...Object.entries(QUANTITIES)
      .filter(([k]) => k !== "room")
      .map(([k, q]) => ({ label: `${k} shipped fleet-wide`, nouns: q.aliases, fn: q.total })),
    ...FLEET_EXTRACTORS,
  ];
}
export function registryTwinTest(plans) {
  const agree = [];
  const disagree = [];
  const single = [];
  for (const e of registryEntries()) {
    const twin = REGISTRY_TWINS[e.label];
    let measured;
    try {
      measured = e.fn(plans);
    } catch (err) {
      measured = undefined;
    }
    if (!twin) {
      single.push({ label: e.label, measured });
      continue;
    }
    let second;
    try {
      second = twin.fn(plans);
    } catch (err) {
      second = undefined;
    }
    const row = { label: e.label, measured, second, via: twin.via };
    if (measured === second) agree.push(row);
    else disagree.push(row);
  }
  return { agree, disagree, single };
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
    // MM4 — the spelled-out script, counted separately, because "how big was the
    // blind spot we just opened our eyes on" is a figure this report should
    // publish every run rather than a sentence somebody measured once.
    const wordAll = (res.numerals.all || []).filter((u) => u.word);
    const wordParsed = wordAll.filter((u) => u.parsed).length;
    out.push(
      `  scope — "${res.bad.length} WRONG" is a statement about those ${res.hits.length} claims and nothing ` +
        `else. ${res.numerals.seen} numeral+noun occurrence(s) sit in the audited prose; ${res.numerals.parsed} ` +
        `are read by the pattern library and ${un.length} are NOT PARSED by it, so they are unchecked rather ` +
        `than clean. ${wordAll.length} of the occurrence(s) are SPELLED OUT rather than written in digits ` +
        `(${wordParsed} of those read by a claim shape) — a script this gate could not see at all before ` +
        `round 26, counted here at the census's own ten-and-over threshold while the claim shapes read the ` +
        `whole vocabulary.` +
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
  // THE TWIN ROSTER (MC). Printed every run, agreements included, because "which
  // extractors are checked against a second derivation and which are taken on
  // trust" is the honest scope of the sentence "re-derived and correct" above it.
  const tw = res.twins;
  if (tw) {
    out.push(
      `  registry — ${tw.agree.length + tw.disagree.length} of ${tw.agree.length + tw.disagree.length + tw.single.length} ` +
        `extractor(s) carry an independent second derivation, ${tw.disagree.length} DISAGREEING. ` +
        `Twinned: ${tw.agree.map((r) => `${r.label} = ${r.measured} (${r.via})`).join(" · ") || "none"}.` +
        (tw.single.length
          ? ` SINGLE-SOURCED, nothing to check them against: ${tw.single
              .map((r) => `${r.label} = ${r.measured === undefined ? "nothing" : r.measured}`)
              .join(" · ")}.`
          : ``),
    );
    for (const r of tw.disagree) {
      out.push(
        `  REGISTRY-TWIN ${r.label} measures ${r.measured === undefined ? "nothing" : r.measured} while its ` +
          `independent second derivation (${r.via}) measures ${r.second === undefined ? "nothing" : r.second}. ` +
          `One of the two is reading the wrong field, and until they agree no claim checked against this ` +
          `extractor means anything.`,
      );
    }
  }
  for (const f of res.selfTest || []) out.push(`  SELF-TEST ${f}`);
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
  // A WAIVED LINE PRINTS WHAT THE ARTIFACT ACTUALLY SAYS (OL7). The measured
  // value was already computed for every hit — that is how the gate decided the
  // claim was not correct in the first place — and then thrown away on exactly
  // the lines where a reader most needs it. A waiver is an argument that a
  // number is HISTORY, and the only thing that makes that argument checkable on
  // sight is the number standing next to it: "60 tiles across 53 rooms" beside
  // "the artifact ships 62/55" reads as a dated figure the moment you see it,
  // and beside nothing at all it reads as whatever the reason says it is. Where
  // no extractor resolves, it says so, which is its own useful admission: the
  // waiver is the only thing holding that numeral up.
  const measuredOf = (c) =>
    c.measured === null || c.measured === undefined
      ? `no extractor`
      : c.measured === -1
        ? `no set of this size in the registry`
        : `artifact ships ${c.measured}`;
  for (const { h, claims } of waivedSites.values()) {
    out.push(
      `  waived(${h.waiverVia}) ${where(h)} — "${h.quote}" — ` +
        `${claims.map((c) => `${c.what} = ${c.value} [${measuredOf(c)}]`).join(" + ")} — ${h.waiver}`,
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
  return res.bad.length || res.open.length || res.registry.length || res.twins.disagree.length || res.selfTest.length
    ? 1
    : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(runAudit({ list: process.argv.includes("--list") }));
}
