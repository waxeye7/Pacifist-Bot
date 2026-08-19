import { loadPlans, cheb } from "./common.mjs";
const { plans } = loadPlans();
const rows = [];
for (const p of plans) {
  const labs = p.structures?.lab || [];
  const sitter = p.sitter || p.hub;
  const haul = labs.length ? Math.min(...labs.map((l) => cheb(l, sitter))) : null;
  const decl = (p.meta?.shortfalls || []).some((s) => s.gate === "labs" && /haul/i.test(s.kind || s.detail || ""));
  rows.push({ room: p.room, haul, decl, variant: p.meta?.labs?.variant });
}
rows.sort((a, b) => (b.haul || 0) - (a.haul || 0));
const hist = {};
for (const r of rows) hist[r.haul] = (hist[r.haul] || 0) + 1;
console.log(JSON.stringify({
  hist,
  max: rows.slice(0, 12),
  haul7undeclared: rows.filter((r) => r.haul >= 7 && !r.decl),
  haulDeclared: rows.filter((r) => r.decl),
}, null, 2));
