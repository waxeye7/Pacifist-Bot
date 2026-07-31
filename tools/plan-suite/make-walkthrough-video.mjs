/**
 * Proper Screeps-icon walkthrough video + happy music.
 *
 *   node tools/plan-suite/legacy/plan-offline.mjs --all-claimable   # needs plans-full.json
 *   node tools/plan-suite/make-walkthrough-video.mjs
 *
 * Output: tools/plan-suite/out/planner-walkthrough.mp4
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";
import { renderRoomSvg } from "./legacy/plan-offline.mjs";

const require = createRequire(import.meta.url);
// package lands on repo root when installed from tools/plan-suite
const rootRequire = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"),
);
const { Resvg } = (() => {
  try {
    return rootRequire("@resvg/resvg-js");
  } catch {
    return require("@resvg/resvg-js");
  }
})();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "out");
const FRAMES = path.join(OUT, "video-frames-v2");
const FULL = path.join(OUT, "plans-full.json");
const VIDEO = path.join(OUT, "planner-walkthrough.mp4");
const AUDIO = path.join(OUT, "happy-bed.wav");

const W = 1280;
const H = 720;
const MAP_CELL = 11; // 550px map
const MAP = 50 * MAP_CELL;

function layerPlan(plan, layers) {
  const p = structuredClone(plan);
  p.structures = p.structures || {};
  const st = p.structures;
  if (!layers.roads) st.road = [];
  if (!layers.extensions) st.extension = [];
  if (!layers.core) {
    for (const t of [
      "storage",
      "spawn",
      "terminal",
      "lab",
      "link",
      "factory",
      "observer",
      "nuker",
      "container",
      "extractor",
    ])
      st[t] = [];
  }
  if (!layers.towers) st.tower = [];
  if (!layers.walls) {
    p.perimeterFull = [];
    p.perimeter = [];
  }
  if (!layers.ramps) {
    p.rampsFull = [];
    p.ramps = [];
  }
  if (!layers.hub) p.hub = null;
  if (!layers.anchors) {
    p.sources = [];
    p.controller = null;
    p.mineral = null;
  }
  return p;
}

function frameSvg(roomSvg, title, step, blurb, stats = "") {
  // roomSvg is full <svg ...>...</svg> — embed via foreign or just place as nested
  // Strip outer svg tag attributes and nest with transform
  const inner = roomSvg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
  const mapX = 40;
  const mapY = 88;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0e18"/>
      <stop offset="50%" stop-color="#101828"/>
      <stop offset="100%" stop-color="#0c1220"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#122033"/>
      <stop offset="100%" stop-color="#1a3048"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- top bar -->
  <rect width="${W}" height="72" fill="url(#bar)"/>
  <text x="28" y="32" fill="#7dd3fc" font-family="Segoe UI, system-ui, sans-serif" font-size="15" font-weight="600">${escapeXml(step)}</text>
  <text x="28" y="56" fill="#f1f5f9" font-family="Segoe UI, system-ui, sans-serif" font-size="24" font-weight="700">${escapeXml(title)}</text>
  <!-- map card -->
  <rect x="${mapX - 12}" y="${mapY - 12}" width="${MAP + 24}" height="${MAP + 24}" rx="14" fill="#0b1018" stroke="#243044" stroke-width="2"/>
  <g transform="translate(${mapX},${mapY})">
    <svg width="${MAP}" height="${MAP}" viewBox="0 0 ${MAP} ${MAP}">
      ${inner}
    </svg>
  </g>
  <!-- side panel -->
  <rect x="${mapX + MAP + 36}" y="88" width="${W - mapX - MAP - 60}" height="${H - 160}" rx="14" fill="#0f1624" stroke="#2a3a52" stroke-width="1.5"/>
  <text x="${mapX + MAP + 56}" y="128" fill="#94a3b8" font-family="Segoe UI, system-ui, sans-serif" font-size="13" font-weight="600">WHAT'S HAPPENING</text>
  ${wrapText(blurb, mapX + MAP + 56, 160, W - mapX - MAP - 100, 18)
    .map(
      (line, i) =>
        `<text x="${mapX + MAP + 56}" y="${160 + i * 26}" fill="#e2e8f0" font-family="Segoe UI, system-ui, sans-serif" font-size="16">${escapeXml(line)}</text>`,
    )
    .join("\n  ")}
  ${
    stats
      ? `<text x="${mapX + MAP + 56}" y="${H - 100}" fill="#38bdf8" font-family="Consolas, monospace" font-size="14">${escapeXml(stats)}</text>`
      : ""
  }
  <!-- bottom -->
  <rect y="${H - 44}" width="${W}" height="44" fill="#0d1420"/>
  <text x="28" y="${H - 16}" fill="#64748b" font-family="Segoe UI, system-ui, sans-serif" font-size="13">Pacifist offline base planner · real structure icons · min-cut shell · auto-expand ready</text>
</svg>`;
}

function titleCardSvg(lines, accent = "#38bdf8") {
  const texts = lines
    .map((line, i) => {
      const size = i === 0 ? 40 : 22;
      const y = 260 + i * (i === 0 ? 56 : 40);
      const fill = i === 0 ? accent : "#e2e8f0";
      const weight = i === 0 ? 800 : 500;
      return `<text x="${W / 2}" y="${y}" text-anchor="middle" fill="${fill}" font-family="Segoe UI, system-ui, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`;
    })
    .join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#071018"/>
      <stop offset="100%" stop-color="#122038"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="200" cy="120" r="180" fill="#1d4ed8" opacity="0.15"/>
  <circle cx="1100" cy="600" r="220" fill="#0891b2" opacity="0.12"/>
  <circle cx="900" cy="100" r="100" fill="#22c55e" opacity="0.1"/>
  ${texts}
</svg>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text, _x, _y, maxW, approxCharPx) {
  const maxChars = Math.floor(maxW / (approxCharPx * 0.55));
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 12);
}

function writeSvgPng(svg, baseName, frameFiles, hold = 28) {
  const svgPath = path.join(FRAMES, baseName + ".svg");
  const pngPath = path.join(FRAMES, baseName + ".png");
  fs.writeFileSync(svgPath, svg);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    background: "rgba(10,14,24,1)",
  });
  const pngData = resvg.render().asPng();
  fs.writeFileSync(pngPath, pngData);
  for (let i = 0; i < hold; i++) frameFiles.push(pngPath);
}

function makeHappyMusic(seconds) {
  // Cheerful C-major arpeggio loop via ffmpeg sine notes
  const notes = [
    523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, // C E G C G E
    587.33, 698.46, 880.0, 1174.66, 880.0, 698.46, // D F A D A F
    523.25, 659.25, 783.99, 1046.5, 1318.5, 1046.5, // up
    783.99, 659.25, 523.25, 392.0, 523.25, 659.25,
  ];
  const beat = 0.22;
  const parts = [];
  let t = 0;
  const total = Math.ceil(seconds / (notes.length * beat)) * notes.length;
  for (let i = 0; i < total; i++) {
    const f = notes[i % notes.length];
    parts.push(`sine=f=${f}:d=${beat}:sample_rate=44100`);
    t += beat;
    if (t >= seconds + 1) break;
  }
  // Build filter: generate each sine and concat
  // Simpler approach: one aevalsrc with a formula is hard; use concat demuxer of sines
  const listFile = path.join(FRAMES, "audio_parts.txt");
  const wavs = [];
  fs.mkdirSync(FRAMES, { recursive: true });
  parts.slice(0, Math.ceil(seconds / beat) + 4).forEach((spec, i) => {
    const w = path.join(FRAMES, `n${i}.wav`);
    const f = notes[i % notes.length];
    spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=${f}:duration=${beat}:sample_rate=44100`,
        "-af",
        `afade=t=in:st=0:d=0.01,afade=t=out:st=${beat - 0.04}:d=0.04,volume=0.22`,
        w,
      ],
      { encoding: "utf8", stdio: "ignore" },
    );
    wavs.push(w);
  });
  fs.writeFileSync(
    listFile,
    wavs.map((w) => `file '${w.replace(/\\/g, "/")}'`).join("\n"),
  );
  spawnSync(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", AUDIO],
    { encoding: "utf8", stdio: "ignore" },
  );
  // soft pad under melody
  const padded = path.join(FRAMES, "happy-pad.wav");
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      AUDIO,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=130.81:duration=${seconds}:sample_rate=44100`,
      "-filter_complex",
      "[1]volume=0.04,afade=t=in:st=0:d=1,afade=t=out:st=" +
        (seconds - 1.5) +
        ":d=1.5[pad];[0][pad]amix=inputs=2:duration=first:dropout_transition=0,volume=0.9",
      padded,
    ],
    { encoding: "utf8", stdio: "ignore" },
  );
  if (fs.existsSync(padded)) {
    fs.copyFileSync(padded, AUDIO);
  }
}

function main() {
  if (!fs.existsSync(FULL)) {
    console.error("Run legacy/plan-offline.mjs --all-claimable first (needs plans-full.json)");
    process.exit(1);
  }
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const plans = JSON.parse(fs.readFileSync(FULL, "utf8")).filter((p) => p.terrain);
  plans.sort((a, b) => (b.ratingFull?.overall || 0) - (a.ratingFull?.overall || 0));
  const force = ["E2S7", "E5S1", "E5S7", "E1S4", "E7S8", "E9S8", "E8S5", "E3S2"];
  const by = Object.fromEntries(plans.map((p) => [p.room, p]));
  const ordered = [];
  for (const r of force) if (by[r]) ordered.push(by[r]);
  for (const p of plans) {
    if (!ordered.find((x) => x.room === p.room)) ordered.push(p);
    if (ordered.length >= 12) break;
  }

  const frameFiles = [];
  let seq = 0;
  const pushTitle = (lines, hold = 40) => {
    const svg = titleCardSvg(lines);
    writeSvgPng(svg, `t${String(seq++).padStart(4, "0")}`, frameFiles, hold);
  };
  const pushRoom = (plan, layers, title, step, blurb, hold = 30) => {
    const lp = layerPlan(plan, layers);
    // if hub hidden, renderRoomSvg may skip hub icon — ok
    const roomSvg = renderRoomSvg(lp, 8, MAP_CELL, "full");
    const rf = plan.ratingFull || {};
    const stats = `ext ${rf.extensions}/60 · walls ${rf.wallTiles} · towers ${rf.towers} · cover ${rf.towerCoverPct}%`;
    const svg = frameSvg(roomSvg, title, step, blurb, stats);
    writeSvgPng(svg, `f${String(seq++).padStart(4, "0")}`, frameFiles, hold);
  };

  console.log("Rendering title cards +", ordered.length, "rooms with real icons…");

  pushTitle(
    ["PACIFIST BASE PLANNER", "How offline planning builds a base", "Real Screeps icons · min-cut · many rooms"],
    50,
  );
  pushTitle(
    [
      "PIPELINE",
      "Terrain → Anchors → Hub → Core",
      "Roads → Extensions → Min-cut → Defense",
      "Then: first spawn / adapt if spawn is bad",
    ],
    55,
  );

  const steps = [
    [
      { anchors: false, hub: false, core: false, roads: false, extensions: false, walls: false, ramps: false, towers: false },
      "Bare terrain",
      "01  TERRAIN",
      "Walls, plains, swamp. The blank canvas before any plan.",
    ],
    [
      { anchors: true, hub: false, core: false, roads: false, extensions: false, walls: false, ramps: false, towers: false },
      "Anchors in the room",
      "02  ANCHORS",
      "Sources, controller, mineral. Everything scored against these.",
    ],
    [
      { anchors: true, hub: true, core: false, roads: false, extensions: false, walls: false, ramps: false, towers: false },
      "Hub selection",
      "03  HUB",
      "Best open tile: short paths to anchors, not glued to the edge.",
    ],
    [
      { anchors: true, hub: true, core: true, roads: false, extensions: false, walls: false, ramps: false, towers: false },
      "Core stamp",
      "04  CORE",
      "Storage, spawns, terminal, labs (your strip), links, factory. No powerSpawn.",
    ],
    [
      { anchors: true, hub: true, core: true, roads: true, extensions: false, walls: false, ramps: false, towers: false },
      "Useful roads",
      "05  ROADS",
      "Hub ring, source/controller paths, thin corridors. Keep roads that do work — no dead spam.",
    ],
    [
      { anchors: true, hub: true, core: true, roads: true, extensions: true, walls: false, ramps: false, towers: false },
      "Dense extensions",
      "06  EXTENSIONS",
      "Pack to 60 at RCL8. Full eco: every extension lives inside the future seal.",
    ],
    [
      { anchors: true, hub: true, core: true, roads: true, extensions: true, walls: true, ramps: false, towers: false },
      "Min-cut ramparts",
      "07  MIN-CUT",
      "Dilate eco by 3 (Chebyshev — diagonal same as orthogonal) so RA range-3 outside cannot shoot in.",
    ],
    [
      { anchors: true, hub: true, core: true, roads: true, extensions: true, walls: true, ramps: true, towers: true },
      "Ramps + towers",
      "08  DEFENSE",
      "Ramp openings, wall access roads, towers covering the shell, still refillable from storage.",
    ],
  ];

  for (let ri = 0; ri < ordered.length; ri++) {
    const plan = ordered[ri];
    pushTitle(
      [`ROOM ${ri + 1} / ${ordered.length}`, plan.room, `score ${plan.ratingFull?.overall ?? "?"}`],
      26,
    );
    for (const [layers, title, step, blurb] of steps) {
      pushRoom(plan, layers, `${plan.room} · ${title}`, step, blurb, 28);
    }
    // spawn callout on final layer
    pushRoom(
      plan,
      {
        anchors: true,
        hub: true,
        core: true,
        roads: true,
        extensions: true,
        walls: true,
        ramps: true,
        towers: true,
      },
      `${plan.room} · first spawn`,
      "09  RESPAWN PICK",
      "You choose the spawn tile on respawn. Best: planned spawn/hub. Bad pick? Adapt — or later relocate with a 2nd spawn at RCL7.",
      36,
    );
  }

  pushTitle(
    [
      "BAD SPAWN? OPTIONS",
      "1) Adapt plan around the spawn you placed",
      "2) RCL7: second spawn in a better spot",
      "3) Stock ~15k energy, dismantle bad spawn, rebuild (risky)",
    ],
    70,
  );
  pushTitle(
    ["ROADS POLICY", "Trim only dead spurs", "Keep useful network: paths, corridors, wall access"],
    45,
  );
  pushTitle(["That's the offline planner", "Gallery + this video", "Next: live placeFromPlan for auto-expand"], 45);

  // Build concat list with durations via duplicate frames already
  // frameFiles is list of png paths (with duplicates for hold)
  const listPath = path.join(FRAMES, "frames.txt");
  // ffmpeg image2 from numbered sequence is easier — copy to sequential
  const seqDir = path.join(FRAMES, "seq");
  fs.mkdirSync(seqDir, { recursive: true });
  frameFiles.forEach((f, i) => {
    fs.copyFileSync(f, path.join(seqDir, `img${String(i).padStart(5, "0")}.png`));
  });

  const durationSec = frameFiles.length / 12;
  console.log("Frames:", frameFiles.length, "duration ~", durationSec.toFixed(1), "s");
  console.log("Generating happy music…");
  makeHappyMusic(durationSec + 2);

  console.log("Encoding video…");
  const args = [
    "-y",
    "-framerate",
    "12",
    "-i",
    path.join(seqDir, "img%05d.png"),
  ];
  if (fs.existsSync(AUDIO)) {
    args.push("-i", AUDIO, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
  }
  args.push("-crf", "18", VIDEO);
  const enc = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (enc.status !== 0) {
    console.error(enc.stderr?.slice(-800));
    process.exit(1);
  }
  console.log("Wrote", VIDEO);
}

main();
