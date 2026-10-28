import { geoGraticule, geoPath, type GeoProjection } from 'd3-geo';
import type { Geometry } from 'geojson';
import type { GeoLayer, GeoUnit } from './geodata';
import type { MapPalette } from './palette';

/** Geometry projected once at camera scale 1; zoom and pan only change the canvas transform. */
export interface LayerPaths {
  units: GeoUnit[];
  unitPaths: Map<string, Path2D>;
  land: Path2D;
  unplantable: Path2D;
  coast: Path2D;
  borders: Path2D;
  disputed: Path2D;
}

export interface StaticPaths {
  sphere: Path2D;
  graticule: Path2D;
  /** Equator, tropics and polar circles (design-system §5.2). */
  parallels: Path2D;
}

export interface View {
  k: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dpr: number;
}

function toPath(projection: GeoProjection, object: Geometry | { type: 'Sphere' }): Path2D {
  const p = new Path2D();
  geoPath(projection, p as unknown as CanvasRenderingContext2D)(object as Geometry);
  return p;
}

export function buildLayerPaths(
  layer: GeoLayer,
  projection: GeoProjection,
  skip?: Set<string>,
): LayerPaths {
  const units = skip ? layer.units.filter((u) => !skip.has(u.id)) : layer.units;
  const unitPaths = new Map<string, Path2D>();
  const land = new Path2D();
  const unplantable = new Path2D();
  for (const unit of units) {
    const path = toPath(projection, unit.geometry);
    unitPaths.set(unit.id, path);
    (unit.kind === 'unplantable' ? unplantable : land).addPath(path);
  }
  return {
    units,
    unitPaths,
    land,
    unplantable,
    coast: toPath(projection, layer.coast),
    borders: toPath(projection, layer.borders),
    disputed: toPath(projection, layer.disputedBorders),
  };
}

const PARALLELS = [0, 23.44, -23.44, 66.56, -66.56];

export function buildStaticPaths(projection: GeoProjection): StaticPaths {
  const parallels: Geometry = {
    type: 'MultiLineString',
    coordinates: PARALLELS.map((lat) => Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat])),
  };
  return {
    sphere: toPath(projection, { type: 'Sphere' }),
    graticule: toPath(projection, geoGraticule().step([15, 15])()),
    parallels: toPath(projection, parallels),
  };
}

const alpha = (hex: string, a: number) =>
  `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`;

/** Unplantable hatching: thin sepia diagonals at 135°, spacing in screen pixels. */
function hatchPattern(
  ctx: CanvasRenderingContext2D,
  pal: MapPalette,
  dpr: number,
): CanvasPattern | null {
  const h = pal.style.unplantableHatch;
  const size = Math.round(h.spacing * dpr);
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const t = tile.getContext('2d')!;
  t.strokeStyle = pal.unplantableHatch;
  t.lineWidth = h.width * dpr;
  t.beginPath();
  for (const o of [-size, 0, size]) {
    t.moveTo(o, 0);
    t.lineTo(o + size, size);
  }
  t.stroke();
  return ctx.createPattern(tile, 'repeat');
}

export interface DrawOptions {
  /** During gestures: skip water lines, hatching and labels to stay within the frame budget. */
  fast: boolean;
  oceanLabels: { text: string; at: [number, number] }[];
  projection: GeoProjection;
  /** Width of the projected sphere at scale 1, to size labels. */
  worldWidth?: number;
  /** Labels keep clear of the meridian of the expedition. */
  meridianLon?: number | null;
  /** Screen rectangles covered by interface chrome: no label goes underneath. */
  occlusions?: Rect[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Base cartography (design-system §5.2), painted bottom to top. */
export function drawBase(
  ctx: CanvasRenderingContext2D,
  view: View,
  base: LayerPaths,
  micro: LayerPaths,
  statics: StaticPaths,
  pal: MapPalette,
  opts: DrawOptions,
) {
  const { k, x, y, dpr } = view;
  const px = 1 / k;
  const s = pal.style;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Ocean
  ctx.fillStyle = pal['sea-100'];
  ctx.fill(statics.sphere);
  ctx.save();
  ctx.clip(statics.sphere);

  // Water lines: concentric rings offset from the coast, carved with the ocean colour.
  if (!opts.fast) {
    const offsets = [...s.waterLines.offsets]
      .map((o, i) => [o, s.waterLines.opacity[i] ?? 0.2] as const)
      .reverse();
    for (const [offset, opacity] of offsets) {
      for (const coast of [base.coast, micro.coast]) {
        ctx.lineWidth = (2 * offset + s.waterLines.width) * px;
        ctx.strokeStyle = alpha(pal['sea-300'], opacity);
        ctx.stroke(coast);
        ctx.lineWidth = Math.max(0, 2 * offset - s.waterLines.width) * px;
        ctx.strokeStyle = pal['sea-100'];
        ctx.stroke(coast);
      }
    }
  }

  // Graticule and remarkable parallels
  ctx.lineWidth = 0.4 * px;
  ctx.strokeStyle = alpha(pal['ink-500'], 0.25);
  ctx.stroke(statics.graticule);
  ctx.setLineDash([4 * px, 3 * px]);
  ctx.strokeStyle = alpha(pal['ink-500'], 0.45);
  ctx.lineWidth = 0.5 * px;
  ctx.stroke(statics.parallels);
  ctx.setLineDash([]);
  ctx.restore();

  // Land
  ctx.fillStyle = pal['paper-200'];
  for (const layer of [base, micro]) {
    ctx.fill(layer.land);
    ctx.fill(layer.unplantable);
  }
  if (!opts.fast) {
    const hatch = hatchPattern(ctx, pal, dpr);
    if (hatch) {
      hatch.setTransform(new DOMMatrix().scale(1 / (k * dpr)));
      ctx.fillStyle = hatch;
      ctx.fill(base.unplantable);
      ctx.fill(micro.unplantable);
    }
  }

  // Borders
  ctx.strokeStyle = pal['sepia-600'];
  ctx.lineWidth = s.border.width * px;
  ctx.setLineDash(s.border.dash.map((d) => d * px));
  ctx.stroke(base.borders);
  ctx.stroke(micro.borders);
  ctx.setLineDash(s.border.disputedDash.map((d) => d * px));
  ctx.stroke(base.disputed);
  ctx.stroke(micro.disputed);
  ctx.setLineDash([]);

  // Coast: a firm line plus a faint offset echo (ink bleed)
  ctx.strokeStyle = pal['ink-900'];
  ctx.lineWidth = s.coast.width * px;
  ctx.stroke(base.coast);
  ctx.stroke(micro.coast);
  if (!opts.fast) {
    ctx.save();
    ctx.translate(s.coast.echoOffset * px, s.coast.echoOffset * px);
    ctx.strokeStyle = alpha(pal['ink-900'], 0.4);
    ctx.lineWidth = s.coast.echoWidth * px;
    ctx.stroke(base.coast);
    ctx.stroke(micro.coast);
    ctx.restore();
  }

  // Neat line around the world
  ctx.strokeStyle = pal['ink-900'];
  ctx.lineWidth = 1 * px;
  ctx.stroke(statics.sphere);

  if (!opts.fast) {
    // Land test in screen space against the projected land paths (labels must sit at sea).
    const isLand = (sx: number, sy: number) => {
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
      const hit = [base.land, base.unplantable, micro.land, micro.unplantable].some((p) =>
        ctx.isPointInPath(p, sx * dpr, sy * dpr),
      );
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return hit;
    };
    drawLabels(ctx, view, pal, opts, isLand);
  }
}

const PARALLEL_LABELS: [number, string][] = [
  [0, 'Équateur'],
  [23.44, 'Tropique du Cancer'],
  [-23.44, 'Tropique du Capricorne'],
  [66.56, 'Cercle polaire arctique'],
  [-66.56, 'Cercle polaire antarctique'],
];

/**
 * Hydrography and remarkable parallels in italics (design-system §5.2–5.3): AA contrast
 * colour, a sea-coloured halo, and never a label cut by the screen edge.
 */
function drawLabels(
  ctx: CanvasRenderingContext2D,
  view: View,
  pal: MapPalette,
  opts: DrawOptions,
  isLand: (sx: number, sy: number) => boolean,
) {
  const { k, x, y, dpr, width, height } = view;
  const L = pal.style.label;
  const size = Math.round(
    Math.max(L.minPx, Math.min(L.maxPx, ((opts.worldWidth ?? width) * k) / 90)),
  );
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = L.haloWidth * 2;
  ctx.strokeStyle = pal['sea-100'];
  ctx.fillStyle = pal.seaLabel;
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  const screen = (lonLat: [number, number]) => {
    const p = opts.projection(lonLat);
    return p ? ([p[0] * k + x, p[1] * k + y] as const) : null;
  };
  const placed: Rect[] = [...(opts.occlusions ?? [])];
  const free = (r: Rect) =>
    r.x >= 4 &&
    r.x + r.w <= width - 4 &&
    r.y >= 2 &&
    r.y + r.h <= height - 2 &&
    !placed.some((o) => overlaps(o, r));
  const draw = (text: string, r: Rect) => {
    placed.push(r);
    ctx.strokeText(text, r.x, r.y + r.h / 2);
    ctx.fillText(text, r.x, r.y + r.h / 2);
  };
  ctx.textAlign = 'left';

  // Oceans: keep clear of the meridian (half the label width + 8 px).
  ctx.font = `italic 400 ${size}px ${pal.font.map}`;
  spaced.letterSpacing = '0.18em';
  for (const label of opts.oceanLabels) {
    const p = screen(label.at);
    if (!p) continue;
    const w = ctx.measureText(label.text).width;
    let cx = p[0];
    if (opts.meridianLon != null) {
      const m = screen([opts.meridianLon, label.at[1]]);
      if (m && Math.abs(cx - m[0]) < w / 2 + 8) cx = m[0] + Math.sign(cx - m[0] || 1) * (w / 2 + 8);
    }
    const r = { x: cx - w / 2, y: p[1] - size * 0.7, w, h: size * 1.4 };
    if (free(r)) draw(label.text, r);
  }

  // Parallels: the first stretch of open sea along the line, clear of labels and chrome.
  const ps = Math.max(L.minPx, size - 2);
  ctx.font = `italic 400 ${ps}px ${pal.font.map}`;
  spaced.letterSpacing = '0.08em';
  for (const [lat, text] of PARALLEL_LABELS) {
    const w = ctx.measureText(text).width;
    for (let lon = -180; lon <= 180; lon += 2.5) {
      const p = screen([lon, lat]);
      if (!p) continue;
      const r = { x: p[0] + 4, y: p[1] - ps * 1.5, w, h: ps * 1.4 };
      if (!free(r)) continue;
      const mid = r.y + r.h / 2;
      if ([0, 0.5, 1].some((f) => isLand(r.x + f * r.w, mid))) continue;
      draw(text, r);
      break;
    }
  }
  spaced.letterSpacing = '0px';
}

export interface HighlightOptions {
  hover: string | null;
  selected: string | null;
  /** false when painting over an existing frame (the loupe draws base + highlight on one canvas). */
  clear?: boolean;
}

/** Hover and selection washes on their own canvas, so they never force a base redraw. */
export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  view: View,
  layers: LayerPaths[],
  pal: MapPalette,
  { hover, selected, clear = true }: HighlightOptions,
) {
  const { k, x, y, dpr } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (clear) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
  ctx.lineJoin = 'round';
  const paint = (entityOrUnit: string, fill: string, stroke: string, width: number) => {
    for (const layer of layers) {
      for (const unit of layer.units) {
        if (unit.entity !== entityOrUnit && unit.id !== entityOrUnit) continue;
        const path = layer.unitPaths.get(unit.id);
        if (!path) continue;
        ctx.fillStyle = fill;
        ctx.fill(path);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width / k;
        ctx.stroke(path);
      }
    }
  };
  if (hover && hover !== selected) paint(hover, alpha(pal.hover, 0.85), pal['ink-700'], 1);
  if (selected) paint(selected, alpha(pal['vermilion-600'], 0.1), pal['vermilion-600'], 1.5);
}

/** Encodes unit index i as an opaque RGB colour for the pick buffer (0 = sea). */
export const pickColor = (i: number) =>
  `rgb(${(i + 1) & 255},${((i + 1) >> 8) & 255},${((i + 1) >> 16) & 255})`;
export const pickIndex = (r: number, g: number, b: number) => r + (g << 8) + (b << 16) - 1;
