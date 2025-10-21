import {
  BoundingBox,
  Vec2,
  boundingBox,
  offsetPolygon,
  polygonCentroid,
  rotatePolygon as rotatePoly,
  simplifyPolygon,
  translatePolygon as translatePoly,
  computeNoFitPolygon
} from './polygon-geometry';

const EPS = 1e-6;
const MAX_SAMPLE_VERTICES = 28;

export interface PackableItem<TMeta = unknown> {
  widthCm: number;
  heightCm: number;
  polygon: Float32Array;
  meta: TMeta;
}

export interface PackedPlacement<TMeta = unknown> {
  x: number;
  y: number;
  width: number;
  height: number;
  designWidth: number;
  designHeight: number;
  rotation: number;
  margin: number;
  clipPath?: string;
  meta: TMeta;
}

export interface PackOptions {
  rollWidthCm: number;
  marginMm?: number;
  rotationStepDeg?: number;
  maxHeightCm?: number;
}

export interface PackedResult<TMeta = unknown> {
  placements: Array<PackedPlacement<TMeta>>;
  usedHeight: number;
}

interface PreparedOrientation {
  id: string;
  rotationDeg: number;
  polygon: Vec2[];
  rawPolygon: Vec2[];
  bbox: BoundingBox;
  artWidthCm: number;
  artHeightCm: number;
  totalWidthCm: number;
  totalHeightCm: number;
  marginCm: number;
}

interface PreparedPiece<TMeta> {
  meta: TMeta;
  orientations: PreparedOrientation[];
}

interface InternalPlacement<TMeta> {
  placement: PackedPlacement<TMeta>;
  orientation: PreparedOrientation;
  polygon: Vec2[];
  bbox: BoundingBox;
}

export function packPolygons<TMeta>(
  items: Array<PackableItem<TMeta>>,
  options: PackOptions
): PackedResult<TMeta> {
  const marginCm = Math.max(0, (options.marginMm ?? 3) / 10);
  const rotationStepDeg = Math.min(90, Math.max(5, options.rotationStepDeg ?? 15));
  const rollWidthCm = Math.max(0.1, options.rollWidthCm);
  const maxHeightCm = options.maxHeightCm ?? 1000;

  const preparedPieces: Array<PreparedPiece<TMeta>> = items
    .map(item => preparePiece(item, marginCm, rotationStepDeg))
    .filter(piece => piece.orientations.length > 0);

  preparedPieces.sort((a, b) => {
    const bestA = Math.min(...a.orientations.map(o => o.totalWidthCm * o.totalHeightCm));
    const bestB = Math.min(...b.orientations.map(o => o.totalWidthCm * o.totalHeightCm));
    return bestB - bestA;
  });

  const placements: Array<PackedPlacement<TMeta>> = [];
  const placedInternals: Array<InternalPlacement<TMeta>> = [];
  let usedHeight = 0;

  for (const piece of preparedPieces) {
    let bestCandidate: {
      x: number;
      y: number;
      orientation: PreparedOrientation;
      polygon: Vec2[];
      bbox: BoundingBox;
      score: number;
    } | null = null;

    const currentUsedHeight = usedHeight;

    for (const orientation of piece.orientations) {
      if (orientation.totalWidthCm > rollWidthCm + EPS) continue;
      const candidates = generateCandidatePositions(
        orientation,
        placedInternals,
        rollWidthCm,
        currentUsedHeight
      );

      for (const [cx, cy] of candidates) {
        if (cx < -EPS || cy < -EPS) continue;
        if (cx + orientation.totalWidthCm > rollWidthCm + EPS) continue;
        if (cy > maxHeightCm) continue;

        const translatedPolygon = translatePoly(orientation.polygon, cx, cy);
        const bbox = boundingBox(translatedPolygon);

        if (bbox.maxX > rollWidthCm + EPS || bbox.maxY > maxHeightCm + EPS) continue;

        let intersects = false;
        for (const placed of placedInternals) {
          if (!bboxOverlap(bbox, placed.bbox)) continue;
          if (polygonsIntersect(translatedPolygon, placed.polygon)) {
            intersects = true;
            break;
          }
        }
        if (intersects) continue;

        const candidateUsedHeight = Math.max(usedHeight, bbox.maxY);
        const score =
          candidateUsedHeight * 1e6 + cy * 1e3 + cx + orientation.totalWidthCm * 1e-2;

        if (!bestCandidate || score < bestCandidate.score) {
          bestCandidate = {
            x: cx,
            y: cy,
            orientation,
            polygon: translatedPolygon,
            bbox,
            score
          };
        }
      }
    }

    if (!bestCandidate) {
      const orientation = piece.orientations[0];
      let fallbackY = usedHeight + orientation.marginCm;
      let fallbackX = 0;
      let translatedPolygon = translatePoly(orientation.polygon, fallbackX, fallbackY);
      let bbox = boundingBox(translatedPolygon);

      let safety = 0;
      while (true) {
        let intersects = false;
        for (const placed of placedInternals) {
          if (!bboxOverlap(bbox, placed.bbox)) continue;
          if (polygonsIntersect(translatedPolygon, placed.polygon)) {
            intersects = true;
            break;
          }
        }
        if (!intersects) break;
        fallbackY += orientation.totalHeightCm * 0.5 + orientation.marginCm;
        translatedPolygon = translatePoly(orientation.polygon, fallbackX, fallbackY);
        bbox = boundingBox(translatedPolygon);
        if (bbox.maxY > maxHeightCm + EPS || ++safety > 100) {
          break;
        }
      }

      const placement: PackedPlacement<TMeta> = {
        x: fallbackX,
        y: fallbackY,
        width: orientation.totalWidthCm,
        height: orientation.totalHeightCm,
        designWidth: orientation.artWidthCm,
        designHeight: orientation.artHeightCm,
        rotation: orientation.rotationDeg,
        margin: orientation.marginCm,
        clipPath: polygonToClipPath(orientation.polygon, orientation.totalWidthCm, orientation.totalHeightCm),
        meta: piece.meta
      };

      placements.push(placement);
      placedInternals.push({
        placement,
        orientation,
        polygon: translatedPolygon,
        bbox
      });
      usedHeight = Math.max(usedHeight, bbox.maxY);
      continue;
    }

    const { orientation, x, y, polygon, bbox } = bestCandidate;
    const placement: PackedPlacement<TMeta> = {
      x,
      y,
      width: orientation.totalWidthCm,
      height: orientation.totalHeightCm,
      designWidth: orientation.artWidthCm,
      designHeight: orientation.artHeightCm,
      rotation: orientation.rotationDeg,
      margin: orientation.marginCm,
      clipPath: polygonToClipPath(orientation.polygon, orientation.totalWidthCm, orientation.totalHeightCm),
      meta: piece.meta
    };

    placements.push(placement);
    placedInternals.push({
      placement,
      orientation,
      polygon,
      bbox
    });
    usedHeight = Math.max(usedHeight, bbox.maxY);
  }

  return { placements, usedHeight };
}

function preparePiece<TMeta>(
  item: PackableItem<TMeta>,
  marginCm: number,
  rotationStepDeg: number
): PreparedPiece<TMeta> {
  const normalizedPolygon = sanitizePolygon(item.polygon);
  const angles: number[] = [];
  for (let angle = 0; angle < 360; angle += rotationStepDeg) {
    angles.push(angle);
  }
  if (!angles.includes(0)) {
    angles.unshift(0);
  }

  const orientations: PreparedOrientation[] = [];
  const seen = new Set<string>();

  for (const angleDeg of angles) {
    const orientation = buildOrientation(normalizedPolygon, item.widthCm, item.heightCm, angleDeg, marginCm);
    if (!orientation) continue;
    if (seen.has(orientation.id)) continue;
    seen.add(orientation.id);
    orientations.push(orientation);
  }

  orientations.sort((a, b) => a.totalWidthCm * a.totalHeightCm - b.totalWidthCm * b.totalHeightCm);

  return { meta: item.meta, orientations };
}

function buildOrientation(
  polygon: Float32Array,
  widthCm: number,
  heightCm: number,
  angleDeg: number,
  marginCm: number
): PreparedOrientation | null {
  const angleRad = (angleDeg * Math.PI) / 180;

  const normalizedPoints: Vec2[] = [];
  for (let i = 0; i < polygon.length; i += 2) {
    normalizedPoints.push([polygon[i], polygon[i + 1]]);
  }
  const simplifiedNormalized = simplifyPolygon(normalizedPoints, 0.001);

  const basePoints: Vec2[] = simplifiedNormalized.map(([nx, ny]) => [
    (nx - 0.5) * widthCm,
    (ny - 0.5) * heightCm
  ]);

  const rotated = rotatePoly(basePoints, angleRad, polygonCentroid(basePoints));
  const rawBox = boundingBox(rotated);
  const rawTranslated = translatePoly(rotated, -rawBox.minX, -rawBox.minY);

  const offset = offsetPolygon(rawTranslated, marginCm);
  const offsetBox = boundingBox(offset);
  const offsetTranslated = translatePoly(offset, -offsetBox.minX, -offsetBox.minY);

  const id = `${Math.round(angleDeg)}-${Math.round(offsetBox.width * 100)}-${Math.round(offsetBox.height * 100)}`;

  return {
    id,
    rotationDeg: angleDeg % 360,
    polygon: ensureClosed(offsetTranslated),
    rawPolygon: ensureClosed(rawTranslated),
    bbox: offsetBox,
    artWidthCm: rawBox.width,
    artHeightCm: rawBox.height,
    totalWidthCm: offsetBox.width,
    totalHeightCm: offsetBox.height,
    marginCm
  };
}

function generateCandidatePositions<TMeta>(
  orientation: PreparedOrientation,
  placed: Array<InternalPlacement<TMeta>>,
  rollWidthCm: number,
  currentUsedHeight: number
): Vec2[] {
  const candidatesSet = new Set<string>();
  const candidates: Vec2[] = [];

  const push = (x: number, y: number) => {
    if (x < -EPS || y < -EPS) return;
    const key = `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
    if (candidatesSet.has(key)) return;
    candidatesSet.add(key);
    candidates.push([Math.max(0, x), Math.max(0, y)]);
  };

  if (!placed.length) {
    push(0, 0);
    return candidates;
  }

  push(0, 0);
  if (currentUsedHeight > 0) {
    push(0, currentUsedHeight);
  }

  for (const pl of placed) {
    push(pl.placement.x + pl.orientation.totalWidthCm, pl.placement.y);
    push(pl.placement.x, pl.placement.y + pl.orientation.totalHeightCm);

    const placedLocal = translatePoly(pl.polygon, -pl.placement.x, -pl.placement.y);
    const nfpRaw = computeNoFitPolygon(orientation.polygon, placedLocal);
    if (!nfpRaw || nfpRaw.length < 3) continue;
    const nfp = ensureClosed(nfpRaw);
    const sampled = sampleVertices(nfp);

    for (const [nx, ny] of sampled) {
      const cx = pl.placement.x + nx;
      const cy = pl.placement.y + ny;
      if (cx + orientation.totalWidthCm > rollWidthCm + EPS) continue;
      push(cx, cy);
    }
  }

  candidates.sort((a, b) => {
    if (Math.abs(a[1] - b[1]) < 1e-3) {
      return a[0] - b[0];
    }
    return a[1] - b[1];
  });

  return candidates;
}

function polygonsIntersect(polyA: Vec2[], polyB: Vec2[]): boolean {
  const axes = [...getAxes(polyA), ...getAxes(polyB)];
  for (const axis of axes) {
    const [minA, maxA] = projectPolygon(polyA, axis);
    const [minB, maxB] = projectPolygon(polyB, axis);
    if (maxA < minB + EPS || maxB < minA + EPS) {
      return false;
    }
  }
  return true;
}

function getAxes(points: Vec2[]): Vec2[] {
  const axes: Vec2[] = [];
  const len = points.length;
  for (let i = 0; i < len - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const edgeX = p2[0] - p1[0];
    const edgeY = p2[1] - p1[1];
    const length = Math.hypot(edgeX, edgeY) || 1;
    const nx = -edgeY / length;
    const ny = edgeX / length;
    axes.push([nx, ny]);
  }
  return axes;
}

function projectPolygon(points: Vec2[], axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of points) {
    const projection = x * axis[0] + y * axis[1];
    if (projection < min) min = projection;
    if (projection > max) max = projection;
  }
  return [min, max];
}

function bboxOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return !(a.maxX <= b.minX + EPS || a.minX >= b.maxX - EPS || a.maxY <= b.minY + EPS || a.minY >= b.maxY - EPS);
}

function ensureClosed(points: Vec2[]): Vec2[] {
  if (!points.length) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first[0] - last[0]) < EPS && Math.abs(first[1] - last[1]) < EPS) {
    return points.slice();
  }
  return [...points, [first[0], first[1]]];
}

function sampleVertices(points: Vec2[]): Vec2[] {
  const result: Vec2[] = [];
  const n = Math.max(0, points.length - 1);
  if (n === 0) return result;
  const step = Math.max(1, Math.floor(n / MAX_SAMPLE_VERTICES));
  for (let i = 0; i < n; i += step) {
    result.push(points[i]);
  }
  if (result.length === 0) {
    result.push(points[0]);
  }
  return result;
}

function polygonToClipPath(points: Vec2[], width: number, height: number): string | undefined {
  if (!points.length || width < EPS || height < EPS) return undefined;
  const len = points.length;
  const commands: string[] = [];
  for (let i = 0; i < len - 1; i++) {
    const [x, y] = points[i];
    const xPct = (x / width) * 100;
    const yPct = (y / height) * 100;
    commands.push(`${i === 0 ? 'M' : 'L'} ${xPct.toFixed(2)}% ${yPct.toFixed(2)}%`);
  }
  commands.push('Z');
  return `path("${commands.join(' ')}")`;
}

function sanitizePolygon(polygon: Float32Array): Float32Array {
  if (!polygon || polygon.length < 6 || polygon.length % 2 !== 0) {
    return new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  }
  return polygon;
}
