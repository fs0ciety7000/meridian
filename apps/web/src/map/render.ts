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

function hatchPattern(
  ctx: CanvasRenderingContext2D,
  color: string,
  dpr: number,
): CanvasPattern | null {
  const size = Math.round(6 * dpr);
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const t = tile.getContext('2d')!;
  t.strokeStyle = alpha(color, 0.45);
  t.lineWidth = dpr;
  t.beginPath();
  for (const o of [-size, 0, size]) {
    t.moveTo(o, size);
    t.lineTo(o + size, 0);
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
}

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
    const hatch = hatchPattern(ctx, pal.hatch, dpr);
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

  // Ocean labels in screen space (hydrography in italics, design-system §5.3)
  if (!opts.fast) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Label size follows the size of the world on screen (≈ 1/90 of its width), 9–15 px.
    const sphereWidth = (opts.worldWidth ?? view.width) * k;
    ctx.font = `italic 400 ${Math.round(Math.max(9, Math.min(15, sphereWidth / 90)))}px ${pal.font.map}`;
    ctx.fillStyle = alpha(pal['ink-500'], 0.85);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx)
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.18em';
    for (const label of opts.oceanLabels) {
      const p = opts.projection(label.at);
      if (!p) continue;
      const sx = p[0] * k + x;
      const sy = p[1] * k + y;
      if (sx < -100 || sy < -20 || sx > view.width + 100 || sy > view.height + 20) continue;
      ctx.fillText(label.text, sx, sy);
    }
    if ('letterSpacing' in ctx)
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  }
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
  if (hover && hover !== selected) paint(hover, alpha(pal['ink-900'], 0.06), pal['ink-700'], 1);
  if (selected) paint(selected, alpha(pal['vermilion-600'], 0.1), pal['vermilion-600'], 1.5);
}

/** Encodes unit index i as an opaque RGB colour for the pick buffer (0 = sea). */
export const pickColor = (i: number) =>
  `rgb(${(i + 1) & 255},${((i + 1) >> 8) & 255},${((i + 1) >> 16) & 255})`;
export const pickIndex = (r: number, g: number, b: number) => r + (g << 8) + (b << 16) - 1;
