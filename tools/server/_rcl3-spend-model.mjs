#!/usr/bin/env node
/**
 * Offline RCL3 energy-spend model. No server, no docker, no src/.
 *
 * 2 sources × 10 e/t harvested. 16 e/t is the assumed room delivery after
 * miner/hauler tax. Spawn tax is a parameter (default 2×550 + 2×~400 per
 * 1500-tick life ≈ 1.3 e/t) so net to upgrade+build is ~14.7 e/t.
 *
 * Clock starts at RCL3 (spawn + 5 ext already up). Constant net; no walk,
 * site cadence, HOL, or body unlocks.
 */
const GROSS = 20; // 2 × 10
const ROOM = 16; // to the room after miner/hauler tax

const LIFE = 1500;
const DEFAULT_TAX = {
  miners: 2,
  minerCost: 550,
  haulers: 2,
  haulerCost: 400,
  life: LIFE,
};

/** Spawn-energy tax in e/t. Override any field. */
export function spawnTax(p = {}) {
  const x = { ...DEFAULT_TAX, ...p };
  return (x.miners * x.minerCost + x.haulers * x.haulerCost) / x.life;
}

const RCL3 = 135_000;
const EXT5 = 15_000;
const DEPOT = 5_000;
const TOWER = 3_000;
const HALF = 67_500;
const STORAGE = 30_000;
const EXT10 = 30_000;

const POLICIES = [
  {
    id: "A",
    name: "instant",
    blurb: "15k ext first, then depot 5k, tower 3k, rest controller",
    rcl3: [
      ["ext", EXT5],
      ["depot", DEPOT],
      ["tower", TOWER],
      ["ctrl", RCL3],
    ],
    leftoverAfter: 0,
  },
  {
    id: "B",
    name: "depot+tower then ext",
    blurb: "depot 5k, tower 3k, leftover 15k, rest controller",
    rcl3: [
      ["depot", DEPOT],
      ["tower", TOWER],
      ["ext", EXT5],
      ["ctrl", RCL3],
    ],
    leftoverAfter: 0,
  },
  {
    id: "C",
    name: "hold-to-RCL4",
    blurb: "depot 5k, tower 3k, ALL rest controller (leftover 15k after RCL4 — does not delay RCL4)",
    rcl3: [
      ["depot", DEPOT],
      ["tower", TOWER],
      ["ctrl", RCL3],
    ],
    leftoverAfter: EXT5,
  },
  {
    id: "D",
    name: "depot then ext then tower",
    blurb: "depot 5k, leftover 15k, tower 3k, rest controller",
    rcl3: [
      ["depot", DEPOT],
      ["ext", EXT5],
      ["tower", TOWER],
      ["ctrl", RCL3],
    ],
    leftoverAfter: 0,
  },
  {
    id: "F",
    name: "half-progress",
    blurb: "depot 5k, tower 3k, upgrade to 67500, then 15k ext, then rest",
    rcl3: [
      ["depot", DEPOT],
      ["tower", TOWER],
      ["ctrl", HALF],
      ["ext", EXT5],
      ["ctrl", HALF],
    ],
    leftoverAfter: 0,
  },
];

const DEFAULT_NETS = [12, 14.7, 16];

function eToRcl3(p) {
  return p.rcl3.reduce((s, [, e]) => s + e, 0);
}

/** Storage is first after RCL4. Leftover-if-C does not delay it. */
function eToStorage(p) {
  return eToRcl3(p) + STORAGE;
}

/** storage 30k + leftover if C + 10 new ext 30k */
function rcl4Remain(p) {
  return STORAGE + p.leftoverAfter + EXT10;
}

function ticks(energy, net) {
  return Math.ceil(energy / net);
}

function pad(s, n, right = false) {
  s = String(s);
  return s.length >= n ? s : right ? s + " ".repeat(n - s.length) : " ".repeat(n - s.length) + s;
}

function fmtNet(n) {
  return Number.isInteger(n) ? String(n) : String(n);
}

function parseNets(argv) {
  const i = argv.indexOf("--nets");
  if (i < 0 || !argv[i + 1]) return DEFAULT_NETS;
  return argv[i + 1].split(",").map(Number);
}

function parseTax(argv) {
  const out = { ...DEFAULT_TAX };
  const flag = (name, key) => {
    const i = argv.indexOf(name);
    if (i >= 0 && argv[i + 1]) out[key] = Number(argv[i + 1]);
  };
  flag("--miners", "miners");
  flag("--miner-cost", "minerCost");
  flag("--haulers", "haulers");
  flag("--hauler-cost", "haulerCost");
  flag("--life", "life");
  const i = argv.indexOf("--tax");
  if (i >= 0 && argv[i + 1]) return { override: Number(argv[i + 1]), parts: out };
  return { override: null, parts: out };
}

export function model(nets = DEFAULT_NETS) {
  return POLICIES.map((p) => ({
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    leftoverAfter: p.leftoverAfter,
    eRcl3: eToRcl3(p),
    eStor: eToStorage(p),
    remain: rcl4Remain(p),
    byNet: Object.fromEntries(
      nets.map((n) => [
        n,
        { rcl3: ticks(eToRcl3(p), n), stor: ticks(eToStorage(p), n) },
      ]),
    ),
  }));
}

function render(argv = process.argv.slice(2)) {
  const nets = parseNets(argv);
  const { override, parts } = parseTax(argv);
  const tax = override == null ? spawnTax(parts) : override;
  const defaultNet = ROOM - tax;
  const rows = model(nets);

  const lines = [];
  const out = (s = "") => lines.push(s);

  out("# RCL3 spend model");
  out("");
  out("Offline constant-rate tick model. No live server, no docker.");
  out("`node tools/server/_rcl3-spend-model.mjs`");
  out("");
  out("## Income");
  out("");
  out(`- 2 sources saturated at ${GROSS / 2} e/t each = **${GROSS} e/t** harvested.`);
  out(`- **${ROOM} e/t** to the room after miner/hauler tax (assumed, not derived).`);
  out(
    `- Spawn tax (parameter): ${parts.miners} miners × ${parts.minerCost}e/${parts.life}t + ${parts.haulers} haulers × ~${parts.haulerCost}e/${parts.life}t = **${tax.toFixed(3)} e/t**${override == null ? "" : " (--tax)"}.`,
  );
  out(`- Default net to upgrade+build: ${ROOM} − ${tax.toFixed(3)} ≈ **${defaultNet.toFixed(1)} e/t**.`);
  out(`- Sweep: ${nets.map((n) => fmtNet(n) + " e/t").join(" / ")}.`);
  out("");
  out("## Costs");
  out("");
  out(`- RCL3 controller: **${RCL3}**.`);
  out(`- Leftover 5 ext: ${EXT5}. Depot (container): ${DEPOT}. Tower: ${TOWER}.`);
  out("- RCL4 remaining build after (storage first, then leftover-if-C, then 10 new ext):");
  for (const p of rows) {
    const bits = [`storage ${STORAGE}`];
    if (p.leftoverAfter) bits.push(`leftover ${p.leftoverAfter}`);
    bits.push(`10 ext ${EXT10}`);
    out(`  - **${p.id}** ${p.name}: ${bits.join(" + ")} = **${p.remain}**`);
  }
  out("");
  out("## Policies");
  out("");
  for (const p of POLICIES) {
    out(`- **${p.id} ${p.name}:** ${p.blurb}`);
  }
  out("");
  out("## Energy (rate-independent)");
  out("");
  out("| policy | e → RCL3 | e → storage | RCL4 remaining |");
  out("| --- | ---: | ---: | ---: |");
  for (const p of rows) {
    out(`| ${p.id} ${p.name} | ${p.eRcl3} | ${p.eStor} | ${p.remain} |`);
  }
  out("");
  out("Storage is first after RCL4, so leftover-if-C does **not** delay storage-up.");
  out("A = B = D = F on both clocks: leftover 15k is still paid on the 135k climb.");
  out("Only **C** drops 15k off the RCL3 clock (and the storage clock).");
  out("");
  out("## Ticks (ceil(energy / net))");
  out("");
  const head = ["policy", ...nets.flatMap((n) => [`${fmtNet(n)} RCL3`, `${fmtNet(n)} storage`])];
  out(`| ${head.join(" | ")} |`);
  out(`| ${head.map((h) => (h === "policy" ? "---" : "---:")).join(" | ")} |`);
  for (const p of rows) {
    const cells = [`${p.id} ${p.name}`];
    for (const n of nets) {
      cells.push(p.byNet[n].rcl3, p.byNet[n].stor);
    }
    out(`| ${cells.join(" | ")} |`);
  }
  out("");
  out("## Ignores");
  out("");
  out("- **Walk** — travel time to sites / controller / sources.");
  out("- **Site cadence** — 15-tick recycle, `maxSitesFor`, unused road slots.");
  out("- **HOL** — spawn queue blocking the parked 4W / next miner.");
  out("- **Body unlocks** — 800-cap 6W miner, `[4W,2C,2M]`, bigger haulers. Net is constant.");
  out("- Repair, decay, tower shots, remotes, swamp, first-RCL3 bootstrap (this clock starts already at RCL3 with 5 ext).");
  out("");

  return lines.join("\n");
}

const running = process.argv[1] && /_rcl3-spend-model\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));
if (running) process.stdout.write(render() + "\n");
