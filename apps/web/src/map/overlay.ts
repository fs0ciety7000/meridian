import { geoDistance, geoInterpolate, geoPath, type GeoProjection } from 'd3-geo';
import { EARTH_RADIUS_KM } from '@meridian/geo';
import { tokens } from '@meridian/design-tokens';
import type { View } from './render';

const ROUTE = tokens.map.route;
const MERIDIAN = tokens.map.meridian;

export type CampState = 'provisional' | 'planted' | 'invalid' | 'historic' | 'start';

export interface CampMarker {
  id: string;
  lonLat: [number, number];
  state: CampState;
  /** Shown inside historic camps (step number). */
  label?: string;
}

export interface RouteLeg {
  from: [number, number];
  to: [number, number];
  /** Draw this leg progressively ("ink tracing", design-system §6.4). */
  animate?: boolean;
  /** A friend's route in a challenge (dashed, ink-700). */
  ghost?: boolean;
}

const SVG = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

/** Pennant on a mast; the anchor is the exact foot of the mast (design-system §6.3). */
function campNode(camp: CampMarker): SVGGElement {
  const g = el('g', { class: `atlas-camp atlas-camp--${camp.state}`, 'data-camp': camp.id });
  if (camp.state === 'historic') {
    g.append(el('circle', { r: 8, class: 'atlas-camp__disc' }));
    const t = el('text', {
      class: 'atlas-camp__num',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    t.textContent = camp.label ?? '';
    g.append(t);
    return g;
  }
  if (camp.state === 'start') {
    g.append(el('circle', { r: 9, class: 'atlas-camp__disc' }));
    g.append(
      el('path', { class: 'atlas-camp__anchor', d: 'M0,-5V5M-3.5,-2.5H3.5M-5,1.5Q0,7 5,1.5' }),
    );
    return g;
  }
  // Ground shadow only while provisional; a ripple when the camp is planted.
  if (camp.state === 'provisional')
    g.append(el('ellipse', { class: 'atlas-camp__shadow', cx: 3, cy: 0, rx: 7, ry: 2 }));
  if (camp.state === 'planted') g.append(el('circle', { class: 'atlas-camp__ripple', r: 10 }));
  const pole = el('g', { class: 'atlas-camp__pole' });
  pole.append(el('line', { class: 'atlas-camp__mast', x1: 0, y1: 0, x2: 0, y2: -27 }));
  const flag = el('g', { class: 'atlas-camp__flag' });
  flag.append(el('path', { class: 'atlas-camp__pennant', d: 'M0.75,-27 L15,-22 L0.75,-17 Z' }));
  if (camp.state === 'invalid')
    flag.append(el('path', { class: 'atlas-camp__tear', d: 'M7,-25 L9,-21 L6.5,-19' }));
  pole.append(flag);
  g.append(pole);
  g.append(el('circle', { class: 'atlas-camp__foot', r: 1.6 }));
  g.append(el('path', { class: 'atlas-camp__sight', d: 'M-5,0H-2.5M2.5,0H5' }));
  return g;
}

const easeInk = (t: number) => 1 - Math.pow(1 - t, 3);

const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Where a great-circle leg crosses the meridian half-plane (not its antimeridian), if it does. */
export function meridianCrossing(
  from: [number, number],
  to: [number, number],
  meridian: number,
): [number, number] | null {
  const at = geoInterpolate(from, to);
  let prev = at(0) as [number, number];
  for (let i = 1; i <= 128; i++) {
    const cur = at(i / 128) as [number, number];
    const a = wrap(prev[0] - meridian);
    const b = wrap(cur[0] - meridian);
    if (a !== 0 && Math.sign(a) !== Math.sign(b) && Math.abs(a - b) < 90) {
      return at((i - 1 + Math.abs(a) / (Math.abs(a) + Math.abs(b))) / 128) as [number, number];
    }
    prev = cur;
  }
  return null;
}

/** Points every `stepKm` along a leg, with a point just after each one to orient the tick. */
function legTicks(from: [number, number], to: [number, number], stepKm: number) {
  const km = geoDistance(from, to) * EARTH_RADIUS_KM;
  const at = geoInterpolate(from, to);
  const ticks: [[number, number], [number, number]][] = [];
  for (let d = stepKm; d < km - stepKm / 4; d += stepKm) {
    ticks.push([
      at(d / km) as [number, number],
      at(Math.min(1, (d + 20) / km)) as [number, number],
    ]);
  }
  return ticks;
}

export interface HaloTarget {
  id: string;
  lonLat: [number, number];
}

export class Overlay {
  readonly svg: SVGSVGElement;
  private world = el('g', { class: 'atlas-overlay__world' });
  private screen = el('g', { class: 'atlas-overlay__screen' });
  private meridianPath = el('path', { class: 'atlas-meridian' });
  private meridianLabel = el('text', { class: 'atlas-meridian__label' });
  private routeGroup = el('g', { class: 'atlas-route' });
  private inkTip = el('circle', { class: 'atlas-route__tip', r: 3 });
  private haloGroup = el('g', { class: 'atlas-halos' });
  private campGroup = el('g', { class: 'atlas-camps' });
  private meridianTicks = el('path', { class: 'atlas-meridian__ticks' });
  private routeTicks = el('path', { class: 'atlas-route__ticks' });
  private crossingGroup = el('g', { class: 'atlas-route__crossings' });
  private meridianMarker = el('path', {
    class: 'atlas-meridian__marker',
    d: 'M0,-3L3,0L0,3L-3,0Z',
  });

  private camps: { marker: CampMarker; node: SVGGElement }[] = [];
  private halos: { id: string; lonLat: [number, number]; node: SVGCircleElement }[] = [];
  private ticks: [[number, number], [number, number]][] = [];
  private crossings: { lonLat: [number, number]; node: SVGPathElement }[] = [];
  private meridianLon: number | null = null;
  private legs: RouteLeg[] = [];
  private tip: [number, number] | null = null;
  private animation = 0;

  constructor(
    host: HTMLElement,
    private projection: GeoProjection,
    private reducedMotion: () => boolean,
  ) {
    this.svg = el('svg', { class: 'atlas-overlay', 'aria-hidden': 'true' });
    this.world.append(this.meridianPath, this.routeGroup);
    this.screen.append(
      this.meridianTicks,
      this.meridianMarker,
      this.meridianLabel,
      this.routeTicks,
      this.crossingGroup,
      this.haloGroup,
      this.inkTip,
      this.campGroup,
    );
    this.svg.append(this.world, this.screen);
    this.inkTip.style.display = 'none';
    host.append(this.svg);
  }

  setProjection(projection: GeoProjection) {
    this.projection = projection;
    this.setMeridian(this.meridianLon);
    this.redrawRoute(1);
  }

  setCamps(camps: CampMarker[]) {
    this.campGroup.replaceChildren();
    this.camps = camps.map((marker) => {
      const node = campNode(marker);
      this.campGroup.append(node);
      return { marker, node };
    });
  }

  /** Micro-state finger targets; invisible at rest (they would reveal which islets are states). */
  setHalos(targets: HaloTarget[]) {
    this.haloGroup.replaceChildren();
    this.halos = targets.map(({ id, lonLat }) => {
      const node = el('circle', { class: 'atlas-halo', r: 11 });
      node.style.display = 'none';
      this.haloGroup.append(node);
      return { id, lonLat, node };
    });
  }

  /** Shows only the halos near the pointer (design-system §5.4 bis). */
  revealHalos(ids: ReadonlySet<string>) {
    for (const h of this.halos) h.node.style.display = ids.has(h.id) ? '' : 'none';
  }

  setMeridian(lon: number | null) {
    this.meridianLon = lon;
    if (lon === null) {
      this.meridianPath.removeAttribute('d');
      this.meridianLabel.textContent = '';
      this.computeRouteMarks();
      return;
    }
    const line = {
      type: 'LineString' as const,
      coordinates: Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]),
    };
    this.meridianPath.setAttribute('d', geoPath(this.projection)(line) ?? '');
    this.computeRouteMarks();
    const abs = Math.abs(lon);
    this.meridianLabel.textContent =
      `Méridien · ${abs}° ${lon === 0 || abs === 180 ? '' : lon > 0 ? 'E' : 'O'}`.trim();
  }

  /** Replaces the route; the last leg is traced progressively when `animate` is set. */
  setRoute(legs: RouteLeg[], onProgress?: (km: number, done: boolean) => void) {
    cancelAnimationFrame(this.animation);
    this.legs = legs;
    const last = legs.at(-1);
    if (!last?.animate || this.reducedMotion()) {
      this.redrawRoute(1);
      if (last) onProgress?.(geoDistance(last.from, last.to) * EARTH_RADIUS_KM, true);
      return;
    }
    const km = geoDistance(last.from, last.to) * EARTH_RADIUS_KM;
    const duration = Math.min(1600, 900 + (km / 20000) * 700);
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      this.redrawRoute(easeInk(t));
      onProgress?.(km * easeInk(t), t === 1);
      if (t < 1) this.animation = requestAnimationFrame(frame);
    };
    this.animation = requestAnimationFrame(frame);
  }

  /** Ticks every 500 km on past legs and gold diamonds where legs cross the meridian. */
  private computeRouteMarks(lastDone = true) {
    const real = this.legs.filter((l) => !l.ghost);
    this.ticks = real.slice(0, -1).flatMap((l) => legTicks(l.from, l.to, ROUTE.tickEveryKm));
    this.crossingGroup.replaceChildren();
    this.crossings = [];
    if (this.meridianLon === null) return;
    const s = ROUTE.crossingMarkerSize / 2;
    for (const leg of lastDone ? real : real.slice(0, -1)) {
      const at = meridianCrossing(leg.from, leg.to, this.meridianLon);
      if (!at) continue;
      const node = el('path', {
        class: 'atlas-route__crossing',
        d: `M0,${-s}L${s},0L0,${s}L${-s},0Z`,
      });
      this.crossingGroup.append(node);
      this.crossings.push({ lonLat: at, node });
    }
  }

  private redrawRoute(lastProgress: number) {
    this.computeRouteMarks(lastProgress >= 1);
    const path = geoPath(this.projection);
    this.routeGroup.replaceChildren();
    this.tip = null;
    this.legs.forEach((leg, i) => {
      const isLast = i === this.legs.length - 1;
      const end =
        isLast && lastProgress < 1 ? geoInterpolate(leg.from, leg.to)(lastProgress) : leg.to;
      const d = path({ type: 'LineString', coordinates: [leg.from, end] });
      const cls = leg.ghost
        ? 'atlas-route__leg atlas-route__leg--ghost'
        : isLast
          ? 'atlas-route__leg atlas-route__leg--current'
          : 'atlas-route__leg';
      this.routeGroup.append(el('path', { class: cls, d: d ?? '' }));
      if (isLast && lastProgress < 1) this.tip = end as [number, number];
    });
    this.inkTip.style.display = this.tip ? '' : 'none';
  }

  /** Re-positions everything for the current camera; called on every frame. */
  update(view: View) {
    const { k, x, y } = view;
    this.world.setAttribute('transform', `matrix(${k},0,0,${k},${x},${y})`);
    const place = (lonLat: [number, number], node: SVGElement) => {
      const p = this.projection(lonLat);
      if (!p) return false;
      node.setAttribute(
        'transform',
        `translate(${(p[0] * k + x).toFixed(1)},${(p[1] * k + y).toFixed(1)})`,
      );
      return true;
    };
    for (const { marker, node } of this.camps) place(marker.lonLat, node);
    for (const { lonLat, node } of this.halos) place(lonLat, node);
    for (const { lonLat, node } of this.crossings) place(lonLat, node);
    if (this.tip) place(this.tip, this.inkTip);
    const screen = (ll: [number, number]) => {
      const p = this.projection(ll);
      return p ? ([p[0] * k + x, p[1] * k + y] as const) : null;
    };

    // Route ticks, perpendicular to the leg, in screen space.
    let d = '';
    const half = ROUTE.tickLength / 2;
    for (const [a, b] of this.ticks) {
      const p = screen(a);
      const q = screen(b);
      if (!p || !q) continue;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const nx = (-(q[1] - p[1]) / len) * half;
      const ny = ((q[0] - p[0]) / len) * half;
      d += `M${(p[0] - nx).toFixed(1)},${(p[1] - ny).toFixed(1)}L${(p[0] + nx).toFixed(1)},${(p[1] + ny).toFixed(1)}`;
    }
    this.routeTicks.setAttribute('d', d);

    // Meridian graduations every 10° of latitude, and its label with a gold diamond.
    let m = '';
    if (this.meridianLon !== null) {
      for (let lat = -80; lat <= 80; lat += MERIDIAN.tickEveryDeg) {
        const p = screen([this.meridianLon, lat]);
        if (p)
          m += `M${(p[0] - MERIDIAN.tickLength).toFixed(1)},${p[1].toFixed(1)}h${MERIDIAN.tickLength * 2}`;
      }
      place([this.meridianLon, -44], this.meridianLabel);
      place([this.meridianLon, -44], this.meridianMarker);
    }
    this.meridianTicks.setAttribute('d', m);
    this.meridianMarker.style.display = this.meridianLon === null ? 'none' : '';
  }

  destroy() {
    cancelAnimationFrame(this.animation);
    this.svg.remove();
  }
}
