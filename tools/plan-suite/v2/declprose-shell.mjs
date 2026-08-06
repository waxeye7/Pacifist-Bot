/**
 * Generated prose for the two `battlements` declarations — one wall segment the
 * garrison cannot reach, filed twice by two layers because the tile becomes
 * unreachable at two different moments. See the header of declprose.mjs for the
 * contract: the producer sets `detail = renderDecl(sf)`, the validator
 * regenerates from the PUBLISHED record and requires equality.
 *
 * ===========================================================================
 * TWO KINDS, ONE FACT, AND WHY BOTH EXIST.
 * ===========================================================================
 * `battlements|` is layer 2's flavour: the cut the enclosure negotiation itself
 * produced already rings a lobe the basin cannot walk to, so the room can also
 * say what the ALTERNATIVE enclosure would have cost — that is the `substitute`
 * clause, and its three branches are selected from the record rather than from a
 * producer boolean.
 *
 * `battlements|unreachable` is layer 7's: the tile was reachable when layer 2
 * finished and stopped being reachable when the extension mass grew or the prune
 * moved the wall. Eleven rooms ship one; layer 7 had no declaration path for it
 * at all until round 12, and until round 13 the paragraph it filed was hand
 * written — a reviewer rewrote E13S3's "1 cut tile(s)" to "0 cut tile(s)", an
 * assertion that the declaration is about nothing, and the room passed.
 */

const pt = (t) => (t && Number.isInteger(t.x) ? `${t.x},${t.y}` : "?,?");

/**
 * ---------------------------------------------------------------------------
 * battlements| — layer 2's unreachable wall, with the substitute priced.
 * ---------------------------------------------------------------------------
 */
export function renderBattlementsCut(sf) {
  const r = sf.battlements || {};
  const s = r.substitute || {};
  const where = (sf.tiles || []).map(pt).join(" ");
  const substitute =
    s.kind === "swap"
      ? `the cheapest fully-reachable cut that still holds the program is ${s.altCut} tiles ` +
        `against this radius's ${s.thisCut} (+${s.altCut - s.thisCut} ramparts), ` +
        `over the ${s.budget}-tile swap budget`
      : s.kind === "small"
        ? `every fully-reachable enclosure of this hub is too small for the program — the best is ` +
          `radius ${s.radius} at ${s.cut} cut tiles enclosing only ${s.deep} deep ` +
          `tiles against a floor of ${s.needDeep}, so buying it would trade ${r.unreachable} unreachable ` +
          `wall tiles for roughly ${s.needDeep - s.deep} structures pushed into the shallow band, ` +
          `each of which rents a personal rampart forever`
        : `no protect radius in this room produces a fully-reachable cut at all — every enclosure ` +
          `of this hub rings a lobe the basin cannot walk to`;
  return (
    `${r.unreachable}/${r.cutTiles} cut tiles sit on a wall segment the interior walk region ` +
    `cannot reach (${where}); no defender can stand there and no battlement can cover them. ` +
    `${substitute}.`
  );
}

/**
 * ---------------------------------------------------------------------------
 * battlements|unreachable — the tiles OUR OWN MASS stranded.
 * ---------------------------------------------------------------------------
 * `strandedByMass` is the number that makes this a declaration and not a copy of
 * layer 2's: it is what the mass and the prune took away AFTER the enclosure was
 * negotiated, so a room only speaks about the tiles IT stranded.
 */
export function renderUnreachableWall(sf) {
  const r = sf.battlements || {};
  const where = (sf.tiles || []).map(pt).join(" ");
  return (
    `UNREACHABLE WALL: ${r.unreachable} cut tile(s) — ${where} — carry a rampart the finished base cannot walk ` +
    `to. ${r.strandedByMass} of them became unreachable after layer 2, which is why this is declared here and ` +
    `not with the enclosure: the mass we grew, or the prune that moved the wall, sealed them off from ` +
    `the sitter's own walk region. Each one is a rampart paying decay forever for a tile no garrison ` +
    `can hold or repair, and each is dropped from the mobility endpoint set, so the lap it would have ` +
    `contributed appears in no published number. It is NOT removed: it is load-bearing on the seal ` +
    `(an unreachable tile that was not would have gone in the inert prune), so the room owes the ` +
    `upkeep either way and the honest thing is to say what it is buying.`
  );
}
