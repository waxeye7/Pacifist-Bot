const d = db.getSiblingDB("screeps");
const rooms = [
  "E5S3","E9S1","E12S3","E13S9","E18S9","E8S5","E11S6","E8S3",
  "E16S9","E4S7","E18S5","E6S1","E12S1","E3S5","E13S7","E21S4",
];
const race = {};
rooms.forEach((r) => {
  race[r] = true;
});

function shift(letter, n, deltaPos) {
  if (letter === "E" || letter === "N") {
    const v = n + deltaPos;
    if (v >= 0) return [letter, v];
    return [letter === "E" ? "W" : "S", -v - 1];
  }
  const v = n - deltaPos;
  if (v >= 0) return [letter, v];
  return [letter === "W" ? "E" : "N", -v - 1];
}

function neighbors(name) {
  const m = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
  if (!m) return [];
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const ew = shift(m[1], +m[2], dx);
      const ns = shift(m[3], +m[4], dy);
      out.push(ew[0] + ew[1] + ns[0] + ns[1]);
    }
  }
  return out;
}

const inRace = d["rooms.objects"].deleteMany({
  room: { $in: rooms },
  type: { $in: ["creep", "energy", "tombstone", "ruin", "constructionSite"] },
});

const adj = {};
rooms.forEach((r) => {
  neighbors(r).forEach((n) => {
    if (!race[n]) adj[n] = true;
  });
});
const adjList = Object.keys(adj);
const border = d["rooms.objects"].deleteMany({
  room: { $in: adjList },
  type: "creep",
  $or: [{ x: 0 }, { x: 49 }, { y: 0 }, { y: 49 }],
});
print(
  "deleted in-16=" +
    inRace.deletedCount +
    " border-walkers=" +
    border.deletedCount +
    " adj=" +
    adjList.length,
);
