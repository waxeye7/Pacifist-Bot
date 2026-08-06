/**
 * Generated prose for the three `labs` declarations. See the header of
 * declprose.mjs for the contract: the producer sets `detail = renderDecl(sf)`,
 * the validator regenerates from the PUBLISHED record and requires equality.
 *
 * ===========================================================================
 * THESE THREE SHIPPED WITH NO RECORD AT ALL.
 * ===========================================================================
 * `labs|lab-haul`, `labs|shallow-lab` and `labs|lab-road-eat` carried a `tiles`
 * list and a paragraph, and that was the whole declaration — every number in the
 * prose (the hauler distance, the anchor census, the fleet median, the cost
 * weights) existed only inside the sentence that quoted it. A reviewer rewrote
 * E13S2's "the lab diamond is 12 hauler tile(s) from the hub" to "2 hauler
 * tile(s)" — the fleet median, i.e. the most comfortable number available — and
 * the room passed, because there was nothing on the other side of the comparison.
 *
 * So the paragraphs are generated from a record now, and the record had to be
 * INVENTED to make that possible: every figure the old prose asserted is a field
 * (`haulDist`, `anchor`, `orientation`, `refused` by class, `deepAnchors`,
 * `fallbackAnchors`, the two cost weights, the two fleet quantiles). That is the
 * contract working as intended — "everything the paragraph says has to be IN the
 * record, so a claim the producer wants to make in prose has to be a field
 * somebody can check".
 */

const pt = (t) => (t && Number.isInteger(t.x) ? `${t.x},${t.y}` : "?,?");

/**
 * ---------------------------------------------------------------------------
 * labs|shallow-lab — a lab inside the ranged band, and the rigid stamp that
 * put it there.
 * ---------------------------------------------------------------------------
 * The claim is "the diamond is a rigid 4x4 stamp and this room has no dry pocket
 * that fits it", and the numbers that back it are the anchor census both depth
 * passes measured. The closing clause is selected from `deepAnchors` rather than
 * carried as a boolean: a room with no deep anchor at all is making a different
 * admission from a room that had one and refused it over the wall promise.
 */
export function renderShallowLab(sf) {
  const r = sf.labs || {};
  const shallow = r.shallow || [];
  return (
    `${shallow.length}/${r.total} labs sit inside the ranged band (depth < ${r.depthSafe}) and carry personal ` +
    `ramparts (${shallow.map((l) => `${l.x},${l.y} d${l.depth}`).join(" · ")}). ` +
    `The ${r.total}-lab diamond is a rigid 4x4 stamp ` +
    `— it cannot be split or reshaped — and this enclosure offers ${r.deepAnchors} anchor(s) with all ` +
    `ten labs at depth >= ${r.depthSafe} and ${r.fallbackAnchors} at depth >= ${r.depthSafe - 1}, of ` +
    `which ${r.dryAnchors} would be fully dry. The anchor shipped was the cheapest on hauler distance ` +
    `PLUS ${r.shallowLabCost} tiles per shallow lab, so depth was priced, not ignored; ` +
    (r.deepAnchors === 0
      ? `no dry anchor exists at any orientation, so the ramparts are the room's verdict, not a preference`
      : `every dry anchor was refused because it seals a wall segment the garrison can walk today`) +
    `.`
  );
}

/**
 * ---------------------------------------------------------------------------
 * labs|lab-haul — a reagent walk an order of magnitude off the fleet.
 * ---------------------------------------------------------------------------
 * E9S9's diamond sits 17 hauler tiles from the hub against a fleet median of 2
 * and a p90 of 4, and every reagent load pays it forever. The number alone says
 * nothing about whether that is a defect or a verdict; the difference is exactly
 * whether the room can show what it REFUSED, so the refusal census is the body
 * of the paragraph — the anchors this layer walked past on its way out, and
 * which guard killed each.
 */
export function renderLabHaul(sf) {
  const r = sf.labs || {};
  const ref = r.refused || {};
  const cheaper = ref.wall + ref.mineral + ref.network + ref.lap;
  return (
    `the lab diamond is ${r.haulDist} hauler tile(s) from the hub (anchor ${pt(r.anchor)}, ${r.orientation} ` +
    `orientation) — the fleet median is ${r.fleetMedian} and p90 is ${r.fleetP90}, and every reagent load pays this walk forever. ` +
    `It is the cheapest anchor that survived every guard, not the cheapest anchor: candidates are ` +
    `examined in strict score order and the search stops at the first survivor, so the ${cheaper} ` +
    `anchor(s) refused ahead of it all scored at or below it — ${ref.wall} because ` +
    `the stamp would strand a wall segment the garrison can walk today, ${ref.mineral} ` +
    `because it would leave the mineral no seat a creep can reach, ${ref.network} because ` +
    `eating its roads would split the network, and ${ref.lap} because it would create or ` +
    `worsen a gated-over-target defender pair. The enclosure offers ${r.deepAnchors} anchor(s) with all ` +
    `ten labs at depth >= ${r.depthSafe} and ${r.fallbackAnchors} at depth >= ${r.depthSafe - 1}. The ` +
    `scoring is hauler distance plus ${r.shallowLabCost} per shallow lab plus ${r.roadEatCost} per ` +
    `eaten road tile, so the walk was minimised subject to those guards and this is what was left.`
  );
}

/**
 * ---------------------------------------------------------------------------
 * labs|lab-road-eat — the eco road tiles the stamp displaced.
 * ---------------------------------------------------------------------------
 * The displaced tiles are DELETED from the plan by the time it ships, which is
 * why this kind is the one named exemption in the validator's obligation
 * inventory: the finished board carries no trace of them. That makes the record
 * the ONLY witness, and therefore the one place the paragraph may read from.
 */
export function renderLabRoadEat(sf) {
  const r = sf.labs || {};
  const eaten = sf.tiles || [];
  return (
    `the lab diamond displaced ${eaten.length} planned road tile(s) ` +
    `(${eaten.map(pt).join(" · ")}). This enclosure offers ` +
    `${r.deepAnchors} anchor(s) at depth >= ${r.depthSafe} and ${r.fallbackAnchors} at depth >= ` +
    `${r.depthSafe - 1} that clear the road network entirely — that is why the stamp is eating ` +
    `road rather than avoiding it: with the road veto in place this room shipped ZERO labs. ` +
    `${r.eatAnchors} anchor(s) were reachable once roads were priced instead of vetoed and ` +
    `${r.eatBlockedByNet} of the ones tried were refused because eating them would have split the ` +
    `road network or stranded a structure. The tiles taken are deleted from the plan, the ` +
    `diamond's own diagonal and its stitch replace them, and the whole network was re-derived ` +
    `as one component still servicing every structure it serviced before — the validator's ROAD ` +
    `gate, asked before the fact. Cost model: ${r.roadEatCost} tile(s) of hauler walk per tile ` +
    `eaten, which is what made the winner the cheapest anchor and not merely a legal one.`
  );
}
