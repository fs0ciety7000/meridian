import { geoDistance, geoInterpolate, geoPath, type GeoProjection } from 'd3-geo';
import { EARTH_RADIUS_KM } from '@meridian/geo';
import type { View } from './render';

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
  g.append(el('ellipse', { class: 'atlas-camp__shadow', cx: 3, cy: 0, rx: 7, ry: 2 }));
  g.append(el('line', { class: 'atlas-camp__mast', x1: 0, y1: 0, x2: 0, y2: -27 }));
  const flag = el('g', { class: 'atlas-camp__flag' });
  flag.append(el('path', { class: 'atlas-camp__pennant', d: 'M0.75,-27 L15,-22 L0.75,-17 Z' }));
  if (camp.state === 'invalid')
    flag.append(el('path', { class: 'atlas-camp__tear', d: 'M7,-25 L9,-21 L6.5,-19' }));
  g.append(flag);
  g.append(el('circle', { class: 'atlas-camp__foot', r: 1.6 }));
  g.append(el('path', { class: 'atlas-camp__sight', d: 'M-5,0H-2.5M2.5,0H5' }));
  return g;
}

const easeInk = (t: number) => 1 - Math.pow(1 - t, 3);

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

  private camps: { marker: CampMarker; node: SVGGElement }[] = [];
  private halos: { lonLat: [number, number]; node: SVGCircleElement }[] = [];
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
    this.screen.append(this.meridianLabel, this.haloGroup, this.inkTip, this.campGroup);
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

  setHalos(points: [number, number][]) {
    this.haloGroup.replaceChildren();
    this.halos = points.map((lonLat) => {
      const node = el('circle', { class: 'atlas-halo', r: 11 });
      this.haloGroup.append(node);
      return { lonLat, node };
    });
  }

  setMeridian(lon: number | null) {
    this.meridianLon = lon;
    if (lon === null) {
      this.meridianPath.removeAttribute('d');
      this.meridianLabel.textContent = '';
      return;
    }
    const line = {
      type: 'LineString' as const,
      coordinates: Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]),
    };
    this.meridianPath.setAttribute('d', geoPath(this.projection)(line) ?? '');
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

  private redrawRoute(lastProgress: number) {
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
    if (this.tip) place(this.tip, this.inkTip);
    if (this.meridianLon !== null) place([this.meridianLon, -44], this.meridianLabel);
  }

  destroy() {
    cancelAnimationFrame(this.animation);
    this.svg.remove();
  }
}
