import { loadPlans, K } from "./common.mjs";
const { plans } = loadPlans();
for (const name of ["E13S5", "E6S5", "E3S4", "E11S9"]) {
  const p = plans.find((x) => x.room === name);
  const drift = (p.meta?.shell?.cutDrift || []).map((e) => `${e.op} ${K(e)} ${e.pass}`);
  console.log(name, {
    cut: (p.meta.shell.cut || []).length,
    freeze: (p.meta.shell.cutAtFreeze || []).length,
    baseCut: p.meta.shell.baseCut,
    protect: p.meta.shell.protectRadius,
    drift,
    adopted: p.meta.shell.cutAdopted,
    seed: p.seed,
    hub: p.hub,
    mobility: p.meta.walls?.mobility?.builtGated,
    enclosedCtrl: p.meta.shell.enclosedController,
  });
}
