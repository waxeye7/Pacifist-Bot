/**
 * Compact per-room dump for the owner sample.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(DIR, "probe-out.json"), "utf8"));

function brief(r) {
  if (!r || r.missingPlan || r.missingTerrain) return r;
  return {
    room: r.room,
    counts: r.counts,
    cut: r.enc.cutN,
    freeze: r.enc.freezeN,
    ramp: r.enc.rampN,
    leaks: r.enc.sitterLeaks,
    coreLive: r.enc.coreLeaksLive,
    coreFreeze: r.enc.coreLeaksFreeze,
    shallow: r.enc.shallowExt,
    pubShallow: r.enc.pubShallow,
    redundant: r.enc.redundant,
    loadBearing: r.enc.loadBearingN,
    enclosedCtrl: r.enc.enclosedCtrl,
    ctrlExt: { live: r.enc.ctrlExteriorLive, freeze: r.enc.ctrlExteriorFreeze },
    vis: r.vis,
    mineral: {
      tile: r.mineral.tile,
      seat: r.mineral.seat,
      pub: r.mineral.pub,
      off: r.mineral.off,
      approach: r.mineral.approach,
      whyHead: (r.mineral.why || "").slice(0, 220),
    },
    film: {
      painted: r.film.painted,
      disagrees: r.film.disagrees,
      unpainted: r.film.unpainted,
      extra: r.film.extra,
      census: r.film.census,
    },
    page: {
      counts: r.page.counts,
      mobSub: r.page.mobSub,
      topics: r.page.topics,
      gates: r.page.gates,
      noteSnips: r.page.noteSnips,
    },
    prune: r.prune,
    notes: r.notes,
    sf: r.sf,
    protectRadius: r.protectRadius,
    baseCut: r.baseCut,
    cutAdopted: r.cutAdopted,
    mobility: r.mobility,
    map: r.map,
  };
}

const out = {};
for (const [k, v] of Object.entries(raw.rooms)) out[k] = brief(v);
fs.writeFileSync(path.join(DIR, "rooms-brief.json"), JSON.stringify(out, null, 2));
const lines = [];
for (const [k, v] of Object.entries(out)) {
  lines.push(
    `${k} cut=${v.cut}/${v.freeze} ramp=${v.ramp} roads=${v.counts.road} ext=${v.counts.ext} ` +
      `shallow=${v.shallow.length} red=${v.redundant.length} d4=${v.vis.noD4} brick2=${v.vis.bricks2} ` +
      `clump=${v.vis.clump} rr=${v.vis.roadOnRamp} offMin=${v.mineral.off} filmD=${v.film.disagrees.length} ` +
      `hub=${v.vis.hub.ok} labs=${v.vis.labs.holes}x${v.vis.labs.w} leakLive=${v.leaks.throughLive} ` +
      `coreFreeze=${v.coreFreeze.length}`,
  );
}
console.log(lines.join("\n"));
