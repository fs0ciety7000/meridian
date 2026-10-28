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

/** Diagonal hatching tile, spacing and width in screen pixels (45° or 135°). */
function hatch(
  ctx: CanvasRenderingContext2D,
  color: string,
  spacing: number,
  width: number,
  dpr: number,
  angleDeg: number,
  cross = false,
): CanvasPattern | null {
  const size = Math.round(spacing * dpr);
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const t = tile.getContext('2d')!;
  t.strokeStyle = color;
  t.lineWidth = width * dpr;
  t.beginPath();
  for (const o of [-size, 0, size]) {
    if (angleDeg === 135 || cross) {
      t.moveTo(o, 0);
      t.lineTo(o + size, size);
    }
    if (angleDeg === 45 || cross) {
      t.moveTo(o, size);
      t.lineTo(o + size, 0);
    }
  }
  t.stroke();
  return ctx.createPattern(tile, 'repeat');
}

/** Unplantable hatching: thin sepia diagonals at 135°, spacing in screen pixels. */
function hatchPattern(
  ctx: CanvasRenderingContext2D,
  pal: MapPalette,
  dpr: number,
): CanvasPattern | null {
  const h = pal.style.unplantableHatch;
  return hatch(ctx, pal.unplantableHatch, h.spacing, h.width, dpr, h.angleDeg);
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
  locale?: MapLocale;
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

export type MapLocale = 'fr' | 'en';

const PARALLEL_LABELS: Record<MapLocale, [number, string][]> = {
  fr: [
    [0, 'Équateur'],
    [23.44, 'Tropique du Cancer'],
    [-23.44, 'Tropique du Capricorne'],
    [66.56, 'Cercle polaire arctique'],
    [-66.56, 'Cercle polaire antarctique'],
  ],
  en: [
    [0, 'Equator'],
    [23.44, 'Tropic of Cancer'],
    [-23.44, 'Tropic of Capricorn'],
    [66.56, 'Arctic Circle'],
    [-66.56, 'Antarctic Circle'],
  ],
};

export const OCEAN_LABELS: Record<MapLocale, { text: string; at: [number, number] }[]> = {
  fr: [
    { text: 'Océan Pacifique', at: [-150, 8] },
    { text: 'Océan Pacifique', at: [152, 14] },
    { text: 'Océan Atlantique', at: [-38, 22] },
    { text: 'Océan Indien', at: [80, -22] },
    { text: 'Océan Austral', at: [20, -58] },
  ],
  en: [
    { text: 'Pacific Ocean', at: [-150, 8] },
    { text: 'Pacific Ocean', at: [152, 14] },
    { text: 'Atlantic Ocean', at: [-38, 22] },
    { text: 'Indian Ocean', at: [80, -22] },
    { text: 'Southern Ocean', at: [20, -58] },
  ],
};

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
  for (const [lat, text] of PARALLEL_LABELS[opts.locale ?? 'fr']) {
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
  /** Persistent country states: played legs, personal atlas (design-system §5.4). */
  marks?: CountryMark[];
  /** Atlas view: every country without a mark is hatched as terra incognita. */
  atlas?: boolean;
}

export type CountryMark =
  | { entity: string; state: 'valid'; tier: 'known' | 'trail' | 'frontier' | 'incognita' }
  | { entity: string; state: 'falseTrail' }
  /** Spyglass veil: every country of a hinted sub-region, answers or not (gameplay §9). */
  | { entity: string; state: 'hint' }
  | { entity: string; state: 'visited'; continent: string; intensity?: number };

/** Hover and selection washes on their own canvas, so they never force a base redraw. */
export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  view: View,
  layers: LayerPaths[],
  pal: MapPalette,
  { hover, selected, clear = true, marks = [], atlas = false }: HighlightOptions,
) {
  const { k, x, y, dpr } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (clear) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
  ctx.lineJoin = 'round';
  const pathsOf = (entityOrUnit: string) =>
    layers.flatMap((layer) =>
      layer.units
        .filter((u) => u.entity === entityOrUnit || u.id === entityOrUnit)
        .map((u) => layer.unitPaths.get(u.id))
        .filter((p): p is Path2D => !!p),
    );
  const paint = (
    entityOrUnit: string,
    fill: string | CanvasPattern | null,
    stroke: string | null,
    width: number,
    dash?: readonly number[],
  ) => {
    for (const path of pathsOf(entityOrUnit)) {
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill(path);
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width / k;
        ctx.setLineDash(dash ? dash.map((d) => d / k) : []);
        ctx.stroke(path);
      }
    }
    ctx.setLineDash([]);
  };
  const pattern = (p: CanvasPattern | null) => {
    p?.setTransform(new DOMMatrix().scale(1 / (k * dpr)));
    return p;
  };
  const cs = pal.style.countryState;
  if (atlas) {
    const u = cs.unvisited;
    const fill = pattern(
      hatch(ctx, alpha(pal[u.color as 'ink-500'], u.opacity), u.spacing, u.width, dpr, 45, true),
    );
    const marked = new Set(marks.map((m) => m.entity));
    for (const layer of layers)
      for (const unit of layer.units)
        if (unit.kind !== 'unplantable' && unit.entity && !marked.has(unit.entity)) {
          const path = layer.unitPaths.get(unit.id);
          if (path && fill) {
            ctx.fillStyle = fill;
            ctx.fill(path);
          }
        }
  }
  for (const m of marks) {
    if (m.state === 'valid') {
      // Wash + outline in the tier ink: an 18 % wash alone greys out (Frontier ultramarine)
      // and would read like the spyglass veil (phase 2 AD review).
      const ink = pal[`rarity-${m.tier}`];
      paint(m.entity, alpha(ink, cs.validOpacity), ink, cs.validOutlineWidth);
    } else if (m.state === 'falseTrail') {
      const f = cs.falseTrail;
      const color = alpha(pal[f.color as 'vermilion-700'], f.opacity);
      paint(
        m.entity,
        pattern(hatch(ctx, color, f.spacing, f.width, dpr, f.angleDeg)),
        color,
        1,
        f.outlineDash,
      );
    } else if (m.state === 'hint') {
      continue; // drawn below as one merged outline
    } else {
      const wash = cs.atlasWash[m.continent as 'AF'] ?? cs.atlasWash.AN;
      const opacity = cs.atlasWash.opacity * (0.6 + 0.4 * Math.min(1, m.intensity ?? 1));
      paint(m.entity, alpha(wash, opacity), null, 0);
    }
  }
  // Spyglass: one dashed outline around the merged sub-regions, no wash, no inner borders
  // (phase 2 AD counter-review R4). Strokes are drawn at twice the width on a scratch canvas,
  // then every hinted country is punched out: shared borders vanish, the outer half remains.
  const hinted = marks.filter((m) => m.state === 'hint').flatMap((m) => pathsOf(m.entity));
  if (hinted.length) {
    const scratch = document.createElement('canvas');
    scratch.width = ctx.canvas.width;
    scratch.height = ctx.canvas.height;
    const sc = scratch.getContext('2d')!;
    sc.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
    sc.lineJoin = 'round';
    sc.strokeStyle = pal['ink-700'];
    sc.lineWidth = (2 * cs.hintOutlineWidth) / k;
    sc.setLineDash(cs.hintDash.map((d) => d / k));
    for (const p of hinted) sc.stroke(p);
    sc.globalCompositeOperation = 'destination-out';
    sc.setLineDash([]);
    for (const p of hinted) sc.fill(p);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
  }
  if (hover && hover !== selected) paint(hover, alpha(pal.hover, 0.85), pal['ink-700'], 1);
  if (selected) paint(selected, alpha(pal['vermilion-600'], 0.1), pal['vermilion-600'], 1.5);
}

/** Encodes unit index i as an opaque RGB colour for the pick buffer (0 = sea). */
export const pickColor = (i: number) =>
  `rgb(${(i + 1) & 255},${((i + 1) >> 8) & 255},${((i + 1) >> 16) & 255})`;
export const pickIndex = (r: number, g: number, b: number) => r + (g << 8) + (b << 16) - 1;
