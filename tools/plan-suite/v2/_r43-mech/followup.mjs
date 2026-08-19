/**
 * Round-43 twin-identity follow-up on leftover single-room BITES. Never writes the artifact.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderSwapOfferBasis, MIN_SAT } from "../layer-towers.mjs";
import { loadPlans, loadRooms, makeChecker } from "./common.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { plans } = loadPlans();
const { byRoom } = loadRooms();
const byPlan = new Map(plans.map((p) => [p.room, p]));
const run = makeChecker(byPlan, byRoom);
const results = [];
function rec(r) {
  results.push(r);
  console.log(String(r.status).padEnd(8), r.name, r.room, String(r.detail || "").slice(0, 220));
}

function zeroAll(obj, name, n) {
  if (!obj || typeof obj !== "object") return n;
  if (Array.isArray(obj)) {
    for (const el of obj) n = zeroAll(el, name, n);
    return n;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === name) {
      if (typeof v === "number" && v !== 0) { obj[k] = 0; n++; }
      else if (typeof v === "boolean" && v === true) { obj[k] = false; n++; }
      else if (Array.isArray(v) && v.length) { obj[k] = []; n++; }
    } else if (v && typeof v === "object") n = zeroAll(v, name, n);
  }
  return n;
}

const twins = [
  "deepBudget",
  "faceAndSatHeld",
  "priceProven",
  "searchedSeats",
  "strandedFirst",
  "unsealed",
  "worstCase",
  "worstCaseUngated",
];

for (const name of twins) {
  const room = plans.find((p) => {
    const stack = [p.meta];
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== "object") continue;
      if (Array.isArray(o)) { for (const e of o) stack.push(e); continue; }
      for (const [k, v] of Object.entries(o)) {
        if (k === name) {
          if (typeof v === "number" && v !== 0) return true;
          if (typeof v === "boolean" && v === true) return true;
          if (Array.isArray(v) && v.length) return true;
        }
        if (v && typeof v === "object") stack.push(v);
      }
    }
    return false;
  })?.room;
  if (!room) {
    rec({ name: "TWIN-" + name, room: "-", status: "SKIP", detail: "no truthy" });
    continue;
  }
  rec(run("TWIN-" + name + "-zero-every-copy", room, (p) => {
    zeroAll(p.meta, name, 0);
  }));
}

for (const name of ["faceAndSatHeld", "priceProven", "searchedSeats"]) {
  rec(run("TWIN-" + name + "-zero-and-regen-basis", "E11S1", (p) => {
    zeroAll(p.meta, name, 0);
    const off = p.meta?.towers?.towerSwapOffer;
    if (off && typeof off.basis === "string") {
      const mn = p.meta.towers.minShellDmg;
      const sat = mn < MIN_SAT ? mn : MIN_SAT;
      try {
        off.basis = renderSwapOfferBasis({
          seats: off.seats,
          searchedSeats: off.searchedSeats,
          towers: (p.structures?.tower || []).length,
          scanned: off.scanned,
          faceAndSatHeld: off.faceAndSatHeld,
          priceProven: off.priceProven,
          face: { min: mn, sat },
          before: off.before,
          best: off.best,
        });
      } catch { /* leave */ }
    }
  }));
}

const prevPath = path.join(DIR, "presence.json");
const prev = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, "utf8")) : { singles: [] };
const skips = (prev.singles || []).filter((s) => s.status === "SKIP").map((s) => s.name.replace(/^PRESENCE-/, ""));

// p16 leftover: fleet-zero remaining presence minus derived+baseCut+shallowNow.
// p16 moved hubDistCap to derived, so excluding derived already leaves the cap.
// Also re-probe the r37 extra skip of hubDistCap (now a no-op vs derived).
{
  const { checkRoom } = await import("../validate.mjs");
  const { META_DARK } = await import("../r27-gates.mjs");
  const { loadPlans, loadRooms, realFails } = await import("./common.mjs");
  const { plans } = loadPlans();
  const { byRoom } = loadRooms();
  const PRESENCE = Object.entries(META_DARK).filter(([, v]) => v.klass === "presence").map(([k]) => k);
  const DERIVED = Object.entries(META_DARK).filter(([, v]) => v.klass === "derived").map(([k]) => k);
  const skip = new Set(["shallowNow", "baseCut", "hubDistCap", ...DERIVED]);
  function walkFlip(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { for (const el of obj) walkFlip(el); return; }
    for (const [k, v] of Object.entries(obj)) {
      if (PRESENCE.includes(k) && !skip.has(k)) {
        if (typeof v === "number" && v !== 0) obj[k] = 0;
        else if (typeof v === "boolean" && v === true) obj[k] = false;
        else if (Array.isArray(v) && v.length) obj[k] = [];
      } else if (v && typeof v === "object") walkFlip(v);
    }
  }
  const mutated = JSON.parse(JSON.stringify(plans));
  for (const p of mutated) if (p && p.meta) walkFlip(p.meta);
  let pass = 0, fail = 0;
  const first = [];
  for (const p of mutated) {
    const d = byRoom.get(p.room);
    if (!d) { fail++; continue; }
    const res = checkRoom(p, d.terrain, d.objects, null);
    const fails = realFails(res);
    if (fails.length) {
      fail++;
      if (first.length < 4) first.push({ room: p.room, fails: fails.slice(0, 2) });
    } else pass++;
  }
  rec({
    name: "FLEET-presence-zero-excl-derived-baseCut-shallowNow-hubDistCap",
    room: "*",
    status: fail ? "BITES" : "ESCAPE",
    detail: JSON.stringify({ pass, fail, first }),
  });

  const skipNoCap = new Set(["shallowNow", "baseCut", ...DERIVED]);
  function walkFlipNoCap(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { for (const el of obj) walkFlipNoCap(el); return; }
    for (const [k, v] of Object.entries(obj)) {
      if (PRESENCE.includes(k) && !skipNoCap.has(k)) {
        if (typeof v === "number" && v !== 0) obj[k] = 0;
        else if (typeof v === "boolean" && v === true) obj[k] = false;
        else if (Array.isArray(v) && v.length) obj[k] = [];
      } else if (v && typeof v === "object") walkFlipNoCap(v);
    }
  }
  const mutated2 = JSON.parse(JSON.stringify(plans));
  for (const p of mutated2) if (p && p.meta) walkFlipNoCap(p.meta);
  let pass2 = 0, fail2 = 0;
  const first2 = [];
  for (const p of mutated2) {
    const d = byRoom.get(p.room);
    if (!d) { fail2++; continue; }
    const res = checkRoom(p, d.terrain, d.objects, null);
    const fails = realFails(res);
    if (fails.length) {
      fail2++;
      if (first2.length < 4) first2.push({ room: p.room, fails: fails.slice(0, 2) });
    } else pass2++;
  }
  rec({
    name: "FLEET-presence-zero-excl-derived-baseCut-shallowNow",
    room: "*",
    status: fail2 ? "BITES" : "ESCAPE",
    detail: JSON.stringify({ pass: pass2, fail: fail2, first: first2 }),
  });
}

fs.writeFileSync(path.join(DIR, "followup.json"), JSON.stringify({ skips, results }, null, 2));
console.log(JSON.stringify({
  skips,
  escapeNames: results.filter((r) => r.status === "ESCAPE").map((r) => r.name),
  biteNames: results.filter((r) => r.status === "BITES").map((r) => r.name),
}, null, 2));
