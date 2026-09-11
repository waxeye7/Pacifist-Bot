import { assert } from "chai";
import fs from "fs";

/**
 * 87% OF THE REMOTE LEDGER WAS ROOMS THE EMPIRE HAD ONLY EVER WALKED THROUGH.
 *
 * Excluding war scouts fixed the loud half of this. The quiet half is that a
 * PLAIN scout is on the role whitelist, never delivers a single unit of
 * energy, and still both CREATES an rstats entry for whatever room it walked
 * into and stamps it `targeted` — which is exactly what stops
 * pruneRemoteStats from ever dropping it again.
 *
 * Live shard3 2026-09-11, an 841,945-tick window: 16 entries, 14 of them
 * `del 0 ... trips 0`, headed by E35N58|E34N57 at -27,700 and E38N56|E37N55
 * at -5,150, against the two that actually mine — E35N58|E34N58 at +79,559
 * and E35N59|E34N59 at +5,312. The loss table was sorted by which room the
 * scout had visited most.
 *
 * A scout's 50 energy is a genuine cost of a remote the empire is really
 * working, so it stays on the books for those. It just may never be the thing
 * that opens the file.
 */
const RS = fs.readFileSync("src/utils/RemoteStats.ts", "utf8");
const CODE = RS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("a scout cannot open a remote's books", () => {
  it("refuses the key when no entry exists yet", () => {
    assert.match(CODE, /if \(role === "scout"\) \{[\s\S]{0,200}return null;/);
    assert.include(CODE, 'r.r[home + "|" + target]');
  });

  it("still books a scout against a remote that already has a file", () => {
    // The exclusion is about CREATING entries, not about hiding the cost from
    // a remote whose P&L the bot actually uses.
    const block = CODE.slice(
      CODE.indexOf('if (role === "scout")'),
      CODE.indexOf('return home + "|" + target;'),
    );
    assert.notInclude(block, "role === \"scout\") return null;");
    assert.include(CODE, 'return home + "|" + target;');
  });

  it("keeps scout on the role whitelist", () => {
    // Dropping it outright would also drop the cost from real remotes.
    assert.include(CODE, 'role !== "scout"');
  });

  it("runs after the war-scout exclusion, which is unconditional", () => {
    const war = CODE.indexOf("if (m.warScout) return null;");
    const scout = CODE.indexOf('if (role === "scout")');
    assert.isAbove(war, 0);
    assert.isAbove(scout, war);
  });

  it("leaves the stale-prune rule that now gets to work", () => {
    // With nothing re-stamping them, the 14 phantom keys age out on lt.
    assert.include(CODE, "const RSTAT_STALE_TICKS = 20000;");
    assert.include(CODE, "Game.time - lt > RSTAT_STALE_TICKS) delete st.r[key];");
  });

  it("does not let the room pass re-stamp a phantom key", () => {
    // The prune only works if nothing else touches lt. The room pass is
    // guarded on the live remote roster or a creep working the key this tick.
    assert.include(CODE, "if (!res[remote].active && !targeted[home + \"|\" + remote]) continue;");
  });
});
