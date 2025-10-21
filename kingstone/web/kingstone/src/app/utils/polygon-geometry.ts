export type Vec2 = [number, number];

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function clonePolygon(points: Vec2[]): Vec2[] {
  return points.map(p => [p[0], p[1]]);
}

export function translatePolygon(points: Vec2[], dx: number, dy: number): Vec2[] {
  return points.map(([x, y]) => [x + dx, y + dy]);
}

export function rotatePolygon(points: Vec2[], angleRad: number, origin: Vec2 = [0, 0]): Vec2[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const [ox, oy] = origin;
  return points.map(([x, y]) => {
    const tx = x - ox;
    const ty = y - oy;
    return [ox + tx * cos - ty * sin, oy + tx * sin + ty * cos];
  });
}

export function scalePolygon(points: Vec2[], sx: number, sy: number, origin: Vec2 = [0, 0]): Vec2[] {
  const [ox, oy] = origin;
  return points.map(([x, y]) => [ox + (x - ox) * sx, oy + (y - oy) * sy]);
}

export function polygonArea(points: Vec2[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    area += (xj + xi) * (yj - yi);
  }
  return area / 2;
}

export function polygonCentroid(points: Vec2[]): Vec2 {
  const area = polygonArea(points);
  if (Math.abs(area) < 1e-8) {
    const avgX = points.reduce((acc, p) => acc + p[0], 0) / points.length;
    const avgY = points.reduce((acc, p) => acc + p[1], 0) / points.length;
    return [avgX, avgY];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const f = xi * yj - xj * yi;
    cx += (xi + xj) * f;
    cy += (yi + yj) * f;
  }
  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor];
}

export function boundingBox(points: Vec2[]): BoundingBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = minY = maxX = maxY = 0;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Douglas-Peucker simplification
 */
export function simplifyPolygon(points: Vec2[], tolerance = 0.1): Vec2[] {
  if (points.length <= 3) return clonePolygon(points);
  const sqTolerance = tolerance * tolerance;

  const simplified = simplifyDouglasPeucker(points, sqTolerance);
  // Ensure polygon closed
  if (simplified.length && (simplified[0][0] !== simplified[simplified.length - 1][0] || simplified[0][1] !== simplified[simplified.length - 1][1])) {
    simplified.push([simplified[0][0], simplified[0][1]]);
  }
  return simplified;
}

function simplifyDouglasPeucker(points: Vec2[], sqTolerance: number): Vec2[] {
  const last = points.length - 1;
  const stack: Array<[number, number]> = [[0, last]];
  const markers: Uint8Array = new Uint8Array(points.length);
  markers[0] = markers[last] = 1;

  const simplified: Vec2[] = [];

  while (stack.length) {
    const [first, second] = stack.pop()!;
    let maxSqDist = 0;
    let index = 0;
    for (let i = first + 1; i < second; i++) {
      const sqDist = getSqSegDist(points[i], points[first], points[second]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    if (maxSqDist > sqTolerance) {
      markers[index] = 1;
      stack.push([first, index], [index, second]);
    }
  }

  for (let i = 0; i <= last; i++) {
    if (markers[i]) simplified.push(points[i]);
  }
  return simplified;
}

function getSqSegDist(p: Vec2, p1: Vec2, p2: Vec2): number {
  let x = p1[0];
  let y = p1[1];
  let dx = p2[0] - x;
  let dy = p2[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2[0];
      y = p2[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/**
 * Simple polygon offset using averaged normals.
 * Works reasonably for non-self-intersecting polygons; not robust for highly concave shapes.
 */
export function offsetPolygon(points: Vec2[], offset: number): Vec2[] {
  if (Math.abs(offset) < 1e-6) return clonePolygon(points);
  const len = points.length;
  if (len < 3) return clonePolygon(points);
  const closed = points[0][0] === points[len - 1][0] && points[0][1] === points[len - 1][1];
  const pts = closed ? points.slice(0, -1) : points.slice();
  const n = pts.length;
  const offsetPoints: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const v1x = curr[0] - prev[0];
    const v1y = curr[1] - prev[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const len1 = Math.hypot(v1x, v1y) || 1;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const n1x = v1y / len1;
    const n1y = -v1x / len1;
    const n2x = v2y / len2;
    const n2y = -v2x / len2;
    const nx = n1x + n2x;
    const ny = n1y + n2y;
    const norm = Math.hypot(nx, ny) || 1;
    const scale = offset / norm;
    offsetPoints.push([curr[0] + nx * scale, curr[1] + ny * scale]);
  }
  offsetPoints.push(offsetPoints[0]);
  return offsetPoints;
}

/**
 * Minkowski sum: adds every point of A to every point of B.
 * Returns simple polygon hull of result via convex hull (approximation).
 */
export function minkowskiSum(polyA: Vec2[], polyB: Vec2[]): Vec2[] {
  const result: Vec2[] = [];
  for (const [ax, ay] of polyA) {
    for (const [bx, by] of polyB) {
      result.push([ax + bx, ay + by]);
    }
  }
  return convexHull(result);
}

export function convexHull(points: Vec2[]): Vec2[] {
  if (points.length <= 1) return points.slice();
  const pts = points
    .map(p => [p[0], p[1]] as Vec2)
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Compute a simple approximation of the no-fit polygon by taking the Minkowski sum of subject and reversed clip.
 * This is not a full NFP implementation but provides candidate translation vectors for heuristics.
 */
export function computeNoFitPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
  const reversedClip: Vec2[] = clip.map(([x, y]) => [-x, -y]);
  return minkowskiSum(subject, reversedClip);
}
