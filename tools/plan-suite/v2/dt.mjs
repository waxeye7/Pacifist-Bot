/**
 * Distance transform — the single terrain "openness" primitive for v2.
 *
 * dt[i] = chebyshev distance from tile i to the nearest wall tile,
 * where out-of-bounds counts as wall. Walls themselves are 0, an open
 * tile hugging a wall (or the room border) is 1, etc.
 *
 * Replaces every ad-hoc openCount/openSpace heuristic: DT >= k means a
 * (2k-1)x(2k-1) clear square fits centered here; local maxima are pocket
 * centers; low-DT walkable tiles are chokepoints.
 */
import { isWall } from "./shared.mjs";

export function distanceTransform(terrain) {
  const dt = new Uint8Array(2500);
  const INF = 60;

  // forward pass: top-left -> bottom-right
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const i = x + y * 50;
      if (isWall(terrain, x, y)) {
        dt[i] = 0;
        continue;
      }
      let d = INF;
      // borders count as wall at distance 0 -> border tile itself is 1
      d = Math.min(d, x + 1, y + 1, 50 - x, 50 - y);
      if (x > 0) d = Math.min(d, dt[i - 1] + 1);
      if (y > 0) d = Math.min(d, dt[i - 50] + 1);
      if (x > 0 && y > 0) d = Math.min(d, dt[i - 51] + 1);
      if (x < 49 && y > 0) d = Math.min(d, dt[i - 49] + 1);
      dt[i] = d;
    }
  }
  // backward pass: bottom-right -> top-left
  for (let y = 49; y >= 0; y--) {
    for (let x = 49; x >= 0; x--) {
      const i = x + y * 50;
      if (dt[i] === 0) continue;
      let d = dt[i];
      if (x < 49) d = Math.min(d, dt[i + 1] + 1);
      if (y < 49) d = Math.min(d, dt[i + 50] + 1);
      if (x < 49 && y < 49) d = Math.min(d, dt[i + 51] + 1);
      if (x > 0 && y < 49) d = Math.min(d, dt[i + 49] + 1);
      dt[i] = d;
    }
  }
  return dt;
}
