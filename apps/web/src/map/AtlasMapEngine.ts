import { geoDistance, geoPath, type GeoProjection } from 'd3-geo';
import { interpolateZoom } from 'd3-interpolate';
import { select, type Selection } from 'd3-selection';
import {
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3-zoom';
import { EARTH_RADIUS_KM } from '@meridian/geo';
import { tokens, type ThemeName } from '@meridian/design-tokens';
import type { GeoData, GeoLayer } from './geodata';
import { Overlay, type CampMarker, type HaloTarget, type RouteLeg } from './overlay';
import { currentTheme, mapPalette, type MapPalette } from './palette';
import { resolvePick, type PickResult } from './pick';
import { makeProjection, type ProjectionKind } from './projection';
import {
  buildLayerPaths,
  buildStaticPaths,
  drawBase,
  drawHighlight,
  pickColor,
  pickIndex,
  type CountryMark,
  type MapLocale,
  OCEAN_LABELS,
  type LayerPaths,
  type StaticPaths,
  type View,
} from './render';

export interface MapPick extends PickResult {
  /** True when the pin was moved: coastal snap or micro-state halo (architecture §4.4). */
  snapped: boolean;
}

export interface CameraState {
  k: number;
  lod: '110m' | '50m';
  kmPerPx: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AtlasMapOptions {
  data: GeoData;
  projection?: ProjectionKind;
  centerLon?: number;
  /** Lazily provides the 50m layer (zoom ≥ ×3 and precise validation). */
  loadDetail?: () => Promise<GeoLayer>;
  onPick?: (pick: MapPick | null) => void;
  onConfirm?: (pick: MapPick) => void;
  onCamera?: (camera: CameraState) => void;
  /** Gestures run below 45 fps (development-plan 3.7): the app may lighten the material. */
  onSlow?: () => void;
}

interface PickUnit {
  id: string;
  entity: string | null;
  /** Micro-state finger target: resolves to the entity's aim point. */
  halo: boolean;
}

const MAX_ZOOM = 40;
const DETAIL_ZOOM = 3;
const TAP_SLOP_PX = 6;
const LONG_PRESS_MS = 350;
const SNAP_RADIUS_PX = 12;
const HALO_PX = tokens.map.halo.sizePx;
const HALO_REVEAL_PX = tokens.map.halo.revealRadiusPx;
const LOUPE_PX = 132;
const LOUPE_ZOOM = 4;

/**
 * The atlas map (architecture §4): Canvas for the cartography, a second canvas for hover and
 * selection, a hidden pick buffer, an SVG overlay for camps/route/meridian and a loupe.
 * React only hosts it; everything here is imperative so gestures never re-render React.
 */
export class AtlasMapEngine {
  private host: HTMLElement;
  private surface: HTMLDivElement;
  private base: HTMLCanvasElement;
  private highlight: HTMLCanvasElement;
  private pickCanvas: HTMLCanvasElement;
  private loupe: HTMLCanvasElement;
  private overlay: Overlay;

  private data: GeoData;
  private kind: ProjectionKind;
  private centerLon: number;
  private projection!: GeoProjection;
  private statics!: StaticPaths;
  private paths: {
    '110m'?: LayerPaths;
    '50m'?: LayerPaths;
    micro110?: LayerPaths;
    micro50?: LayerPaths;
  } = {};
  private pickUnits: PickUnit[] = [];
  private pickDirty = true;

  private zoomBehavior: ZoomBehavior<HTMLDivElement, unknown>;
  private selection: Selection<HTMLDivElement, unknown, null, undefined>;
  private transform: ZoomTransform = zoomIdentity;
  private width = 0;
  private worldWidth = 0;
  private height = 0;
  private dpr = 1;
  private interacting = false;
  private flying = 0;
  private frame = 0;
  private fastFrame = false;
  /** Last full-quality frame and the camera it was drawn for (gesture frames reuse it). */
  private frozen = document.createElement('canvas');
  private frozenAt: ZoomTransform | null = null;
  /** Whole world at scale 1: covers what a pan reveals beyond the frozen frame. */
  private worldBitmap = document.createElement('canvas');
  private worldBitmapReady = false;
  private fullTimer = 0;

  private theme: ThemeName = currentTheme();
  private pal: MapPalette = mapPalette(this.theme);
  private hover: string | null = null;
  private selected: string | null = null;
  private provisional: MapPick | null = null;
  private camps: CampMarker[] = [];
  private marks: CountryMark[] = [];
  private atlasMode = false;
  /** Screen margins covered by chrome: framing centres targets in the remaining area. */
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** Chrome margins the world view itself is fitted around (launcher, atlas). */
  private homeInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** True once the player moved the camera: insets no longer re-home the view. */
  private userMoved = false;
  /** Frame timestamps of the current gesture, and how many gestures ran slow. */
  private gestureFrames: number[] = [];
  private slowGestures = 0;
  private homeFocus: [number, number] | null = null;
  private locale: MapLocale = document.documentElement.lang === 'en' ? 'en' : 'fr';

  private press: {
    id: number;
    x: number;
    y: number;
    t: number;
    timer: number;
    type: string;
  } | null = null;
  private loupeActive = false;
  private resizeObserver: ResizeObserver;
  private themeObserver: MutationObserver;
  private media = window.matchMedia('(prefers-reduced-motion: reduce)');
  private colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

  constructor(
    host: HTMLElement,
    private opts: AtlasMapOptions,
  ) {
    this.host = host;
    this.data = opts.data;
    this.kind = opts.projection ?? 'equalEarth';
    this.centerLon = opts.centerLon ?? 0;

    host.classList.add('atlas-map');
    host.tabIndex = 0;
    host.setAttribute('role', 'application');
    this.labelHost();

    this.base = this.canvas('atlas-map__base');
    this.highlight = this.canvas('atlas-map__highlight');
    this.pickCanvas = document.createElement('canvas');
    this.surface = document.createElement('div');
    this.surface.className = 'atlas-map__surface';
    const texture = document.createElement('div');
    texture.className = 'atlas-map__texture';
    host.append(texture);
    this.overlay = new Overlay(host, makeProjection(this.kind, 1, 1), () => this.reducedMotion);
    this.loupe = this.canvas('atlas-map__loupe');
    this.loupe.style.display = 'none';
    host.append(this.surface);

    this.zoomBehavior = zoom<HTMLDivElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .on('start', (e: D3ZoomEvent<HTMLDivElement, unknown>) => {
        if (!this.flying) this.interacting = true;
        if (e.sourceEvent) this.userMoved = true;
      })
      .on('zoom', (e: D3ZoomEvent<HTMLDivElement, unknown>) => {
        this.transform = e.transform;
        this.requestDraw(this.interacting || this.flying > 0);
      })
      .on('end', () => {
        if (this.flying) return;
        this.interacting = false;
        this.measureGesture();
        this.settle();
      });
    this.selection = select(this.surface);
    this.selection.call(this.zoomBehavior).on('dblclick.zoom', null);
    this.selection.on('dblclick', (e: MouseEvent) => this.zoomAt([e.offsetX, e.offsetY], 2));

    this.bindGestures();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.themeObserver = new MutationObserver(() => this.refreshTheme());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    this.colorScheme.addEventListener('change', this.refreshTheme);
    document.fonts?.ready.then(() => this.requestFullDraw(0));
    this.resize();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  get camera(): CameraState {
    return { k: this.transform.k, lod: this.lod, kmPerPx: this.kmPerPx() };
  }

  /** Screen position of a geographic point (used by tests and overlays). */
  project(lonLat: [number, number]): [number, number] | null {
    const p = this.projection(lonLat);
    return p ? (this.transform.apply(p) as [number, number]) : null;
  }

  invert(point: [number, number]): [number, number] | null {
    return (
      (this.projection.invert?.(this.transform.invert(point)) as [number, number] | null) ?? null
    );
  }

  setCamps(camps: CampMarker[]) {
    this.camps = camps;
    this.syncCamps();
  }

  setRoute(legs: RouteLeg[], onProgress?: (km: number, done: boolean) => void) {
    this.overlay.setRoute(legs, onProgress);
    this.overlay.update(this.view);
  }

  setMeridian(lon: number | null) {
    this.meridianLon = lon;
    this.overlay.setMeridian(lon);
    this.overlay.update(this.view);
  }

  /** Country states that persist across frames: played legs, personal atlas. */
  setMarks(marks: CountryMark[], atlas = false) {
    this.marks = marks;
    this.atlasMode = atlas;
    this.drawHighlightLayer();
  }

  /** Chrome margins (fitInsets, design-system §7): framing avoids cartouche and camp bar. */
  setInsets(insets: Insets) {
    this.insets = insets;
    if (!this.userMoved && !this.flying) this.setTransform(this.homeTransform());
  }

  /** Point the home view centres on in portrait (the current camp). */
  setHomeFocus(lonLat: [number, number] | null) {
    this.homeFocus = lonLat;
  }

  private labelHost() {
    const fr = this.locale === 'fr';
    this.host.setAttribute('aria-roledescription', fr ? 'carte' : 'map');
    this.host.setAttribute(
      'aria-label',
      fr
        ? 'Atlas du monde : touchez un pays pour y poser votre camp, ou utilisez la recherche.'
        : 'World atlas: tap a country to pitch your camp there, or use the search.',
    );
  }

  /** Language of the map's own labels (oceans, parallels, accessible name). */
  setLocale(locale: MapLocale) {
    if (locale === this.locale) return;
    this.locale = locale;
    this.labelHost();
    this.frozenAt = null;
    this.requestDraw(false);
  }

  /**
   * Fits the world view to the area left free by the chrome (launcher panel, bottom sheet).
   * Rebuilds the projection, so it is meant for screens whose chrome rarely changes size.
   */
  setHomeInsets(insets: Insets) {
    const a = this.homeInsets;
    const same = (['top', 'right', 'bottom', 'left'] as const).every(
      (k) => Math.abs(a[k] - insets[k]) < 4,
    );
    if (same) return;
    this.homeInsets = insets;
    this.rebuild(true);
    if (!this.userMoved) this.setTransform(this.homeTransform());
  }

  /** Places (or clears) the provisional camp, e.g. from the country search. */
  setProvisional(pick: MapPick | null) {
    this.provisional = pick;
    this.selected = pick?.entity ?? pick?.unitId ?? null;
    this.syncCamps();
    this.drawHighlightLayer();
    this.opts.onPick?.(pick);
  }

  /** Moves keyboard focus to the map so arrows move the camp (keyboard-only flow). */
  focusMap() {
    this.host.focus({ preventScroll: true });
  }

  pickAt(lonLat: [number, number]): MapPick {
    return { ...resolvePick(this.data, lonLat), snapped: false };
  }

  setProjection(kind: ProjectionKind, centerLon = this.centerLon) {
    if (kind === this.kind && centerLon === this.centerLon) return;
    // Rotating the world must not move the camera: keep the geographic centre and zoom.
    const centre = this.width ? this.invert([this.width / 2, this.height / 2]) : null;
    const k = this.transform.k;
    if (this.flying) {
      this.flying = 0; // a flight computed in the old projection would land elsewhere
      this.settle();
    }
    this.kind = kind;
    this.centerLon = centerLon;
    this.rebuild(true);
    const p = centre && k > 1 ? this.projection(centre) : null;
    this.setTransform(
      p
        ? zoomIdentity.translate(this.width / 2 - k * p[0], this.height / 2 - k * p[1]).scale(k)
        : this.homeTransform(),
    );
  }

  resetView() {
    this.flyToTransform(this.homeTransform());
    this.userMoved = false; // back home: chrome changes may re-frame it again
  }

  /**
   * Home view: the whole world in landscape; in portrait the world would only fill a third
   * of the screen, so it is zoomed to fill about half the height and stays pannable.
   */
  private homeTransform(): ZoomTransform {
    const [[x0, y0], [x1, y1]] = geoPath(this.projection).bounds({ type: 'Sphere' });
    if (this.width / this.height >= 0.9) return zoomIdentity;
    // Portrait (design-system §7, phase 1 review): the world would fill a third of the screen.
    // It is zoomed so the map fills ≥ 70 % of the height and most of the area the chrome
    // leaves free, centred in that area on the current camp, and stays pannable.
    const top = Math.max(this.homeInsets.top, this.insets.top);
    const bottom = Math.max(this.homeInsets.bottom, this.insets.bottom);
    const freeH = Math.max(120, this.height - top - bottom);
    const target = Math.max(this.height * tokens.map.fit.minMapHeightRatioSm, freeH * 0.92);
    const k = Math.min(tokens.map.fit.maxHomeKSm, Math.max(1, target / (y1 - y0)));
    const focus = this.homeFocus ? this.projection(this.homeFocus) : null;
    const fx = focus ? focus[0] : (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return zoomIdentity.translate(this.width / 2 - k * fx, top + freeH / 2 - k * cy).scale(k);
  }

  /** Flies to a geographic box [west, south, east, north] (van Wijk interpolation). */
  flyToBounds([west, s, e, n]: [number, number, number, number], maxK = 24) {
    const east = e < west ? e + 360 : e;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 4; i++) {
      const lon = west + ((east - west) * i) / 4;
      pts.push([lon > 180 ? lon - 360 : lon, s], [lon > 180 ? lon - 360 : lon, n]);
    }
    const [[x0, y0], [x1, y1]] = geoPath(this.projection).bounds({
      type: 'MultiPoint',
      coordinates: pts,
    });
    const dx = Math.max(x1 - x0, 1);
    const dy = Math.max(y1 - y0, 1);
    const { top, right, bottom, left } = this.insets;
    const w = Math.max(80, this.width - left - right);
    const h = Math.max(80, this.height - top - bottom);
    const k = Math.max(1, Math.min(maxK, 0.8 / Math.max(dx / w, dy / h)));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    this.flyToTransform(
      zoomIdentity.translate(left + w / 2 - k * cx, top + h / 2 - k * cy).scale(k),
    );
  }

  flyToPoint(lonLat: [number, number], k: number) {
    const p = this.projection(lonLat);
    if (!p) return;
    this.flyToTransform(
      zoomIdentity.translate(this.width / 2 - k * p[0], this.height / 2 - k * p[1]).scale(k),
    );
  }

  /** Programmatic zoom (keyboard, tests). */
  zoomAt(point: [number, number], factor: number) {
    const t = this.transform;
    const k = Math.max(1, Math.min(MAX_ZOOM, t.k * factor));
    const [wx, wy] = t.invert(point);
    this.flyToTransform(zoomIdentity.translate(point[0] - k * wx, point[1] - k * wy).scale(k), 260);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.fullTimer);
    this.resizeObserver.disconnect();
    this.themeObserver.disconnect();
    this.colorScheme.removeEventListener('change', this.refreshTheme);
    this.selection.on('.zoom', null);
    this.overlay.destroy();
    this.host.replaceChildren();
  }

  // ── Layout & data ────────────────────────────────────────────────────────────

  private canvas(className: string) {
    const c = document.createElement('canvas');
    c.className = className;
    this.host.append(c);
    return c;
  }

  private get reducedMotion() {
    return this.media.matches || document.documentElement.dataset.motion === 'reduced';
  }

  private get lod(): '110m' | '50m' {
    return this.transform.k >= DETAIL_ZOOM && this.paths['50m'] ? '50m' : '110m';
  }

  private get view(): View {
    const { k, x, y } = this.transform;
    return { k, x, y, width: this.width, height: this.height, dpr: this.dpr };
  }

  private resize() {
    const rect = this.host.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    // Keep the geographic centre and zoom across resizes.
    const centre = this.width ? this.invert([this.width / 2, this.height / 2]) : null;
    const k = this.transform.k;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.base, this.highlight]) {
      c.width = Math.round(this.width * this.dpr);
      c.height = Math.round(this.height * this.dpr);
    }
    this.pickCanvas.width = Math.round(this.width);
    this.pickCanvas.height = Math.round(this.height);
    this.loupe.width = this.loupe.height = Math.round(LOUPE_PX * this.dpr);
    this.overlay.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.rebuild(false);
    this.zoomBehavior.translateExtent([
      [0, 0],
      [this.width, this.height],
    ]);
    if (centre && k > 1) {
      const p = this.projection(centre);
      if (p)
        this.setTransform(
          zoomIdentity.translate(this.width / 2 - k * p[0], this.height / 2 - k * p[1]).scale(k),
        );
    } else {
      this.setTransform(this.homeTransform());
    }
    this.settle();
  }

  private rebuild(redraw: boolean) {
    this.projection = makeProjection(
      this.kind,
      this.width,
      this.height,
      this.centerLon,
      this.homeInsets,
    );
    this.statics = buildStaticPaths(this.projection);
    const [[x0], [x1]] = geoPath(this.projection).bounds({ type: 'Sphere' });
    this.worldWidth = x1 - x0;
    const coarse = this.data.layers['110m'];
    this.paths = {
      '110m': buildLayerPaths(coarse, this.projection),
      micro110: buildLayerPaths(this.data.micro, this.projection),
    };
    if (this.data.layers['50m']) this.buildDetailPaths();
    this.overlay.setProjection(this.projection);
    this.overlay.setHalos(this.microAimPoints());
    this.measureMicroStates();
    this.pickDirty = true;
    this.frozenAt = null;
    if (this.width) this.renderWorldBitmap();
    if (redraw) this.settle();
    else if (!this.paths['50m'] && this.opts.loadDetail) this.loadDetail();
  }

  private detailRequested = false;
  private loadDetail() {
    if (this.detailRequested || !this.opts.loadDetail) return;
    this.detailRequested = true;
    this.opts.loadDetail().then((layer) => {
      this.data.layers['50m'] = layer;
      const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1));
      idle(() => {
        this.buildDetailPaths();
        this.frozenAt = null;
        this.settle();
      });
    });
  }

  private buildDetailPaths() {
    const detail = this.data.layers['50m'];
    if (!detail) return;
    const in50 = new Set(detail.units.map((u) => u.id));
    this.paths['50m'] = buildLayerPaths(detail, this.projection);
    // Micro-states exist in both: draw 10m only for units 50m lacks.
    this.paths.micro50 = buildLayerPaths(this.data.micro, this.projection, in50);
  }

  private microAimPoints(): HaloTarget[] {
    return [...this.data.entities.values()]
      .filter((e) => e.isMicroState)
      .map((e) => ({ id: e.iso3, lonLat: e.aimPoint as [number, number] }));
  }

  /** Projected size (px at scale 1) of each micro-state's main polygon. */
  private microSize = new Map<string, number>();

  private measureMicroStates() {
    this.microSize.clear();
    const path = geoPath(this.projection);
    for (const e of this.data.entities.values()) {
      if (!e.isMicroState) continue;
      const [w, s, east, n] = e.mainBbox;
      const corners: [number, number][] = [
        [w, s],
        [east, n],
        [w, n],
        [east, s],
      ];
      const [[x0, y0], [x1, y1]] = path.bounds({ type: 'MultiPoint', coordinates: corners });
      this.microSize.set(e.iso3, Math.max(x1 - x0, y1 - y0));
    }
  }

  /** Micro-states smaller than a finger at the current zoom: they get a halo target. */
  private haloCandidates(): HaloTarget[] {
    const k = this.transform.k;
    return this.microAimPoints().filter((h) => (this.microSize.get(h.id) ?? 0) * k < HALO_PX);
  }

  private pointer: [number, number] | null = null;
  private meridianLon: number | null = null;

  /** Interface chrome over the map (elements marked `data-map-chrome`), in map coordinates. */
  private chromeRects() {
    const host = this.host.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('[data-map-chrome]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left - host.left - 6,
        y: r.top - host.top - 6,
        w: r.width + 12,
        h: r.height + 12,
      };
    });
  }

  /** Halos are invisible at rest; they appear within reach of the pointer (design-system §5.4 bis). */
  private revealHalos() {
    const ids = new Set<string>();
    if (this.pointer) {
      for (const h of this.haloCandidates()) {
        const p = this.project(h.lonLat);
        if (p && Math.hypot(p[0] - this.pointer[0], p[1] - this.pointer[1]) <= HALO_REVEAL_PX)
          ids.add(h.id);
      }
    }
    this.overlay.revealHalos(ids);
  }

  private refreshTheme = () => {
    this.theme = currentTheme();
    this.pal = mapPalette(this.theme);
    this.frozenAt = null;
    this.renderWorldBitmap();
    this.requestDraw(false);
  };

  // ── Drawing ──────────────────────────────────────────────────────────────────

  private layersFor(lod: '110m' | '50m'): [LayerPaths, LayerPaths] {
    return lod === '50m'
      ? [this.paths['50m']!, this.paths.micro50!]
      : [this.paths['110m']!, this.paths.micro110!];
  }

  private requestDraw(fast: boolean) {
    this.fastFrame = fast;
    if (fast) clearTimeout(this.fullTimer);
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw(this.fastFrame);
    });
  }

  /**
   * Median frame interval of the gesture that just ended; two gestures slower than 45 fps
   * report the device as slow once (the app then switches to the light material).
   */
  private measureGesture() {
    const t = this.gestureFrames;
    this.gestureFrames = [];
    if (t.length < 20 || !this.opts.onSlow) return;
    const dt = t
      .slice(1)
      .map((v, i) => v - t[i]!)
      .sort((a, b) => a - b);
    const median = dt[Math.floor(dt.length / 2)]!;
    if (median > 1000 / 45 && ++this.slowGestures === 2) this.opts.onSlow();
  }

  /** Full-quality frame shortly after the camera settles; a new gesture cancels it. */
  private requestFullDraw(delay = 80) {
    clearTimeout(this.fullTimer);
    this.fullTimer = window.setTimeout(() => {
      if (this.interacting || this.flying) return;
      this.requestDraw(false);
    }, delay);
  }

  private draw(fast: boolean) {
    if (this.interacting) this.gestureFrames.push(performance.now());
    const view = this.view;
    if (fast && this.frozenAt && this.worldBitmapReady) this.drawFrozen();
    else {
      const [base, micro] = this.layersFor(this.lod);
      drawBase(this.base.getContext('2d')!, view, base, micro, this.statics, this.pal, {
        fast,
        oceanLabels: OCEAN_LABELS[this.locale],
        locale: this.locale,
        projection: this.projection,
        worldWidth: this.worldWidth,
        meridianLon: this.meridianLon,
        occlusions: fast ? [] : this.chromeRects(),
      });
      if (!fast) this.freeze();
    }
    this.drawHighlightLayer();
    this.overlay.update(view);
    this.revealHalos();
  }

  /**
   * Gesture frame (architecture §4.6): no geometry is rasterised, only two bitmaps are
   * transformed: the whole world at scale 1, then the last full-quality frame on top.
   */
  private drawFrozen() {
    const ctx = this.base.getContext('2d')!;
    const { k, x, y } = this.transform;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.base.width, this.base.height);
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(k, 0, 0, k, d * x, d * y);
    ctx.drawImage(this.worldBitmap, 0, 0);
    const f = this.frozenAt!;
    const r = k / f.k;
    ctx.setTransform(r, 0, 0, r, d * x - r * d * f.x, d * y - r * d * f.y);
    ctx.drawImage(this.frozen, 0, 0);
  }

  private freeze() {
    this.frozen.width = this.base.width;
    this.frozen.height = this.base.height;
    const ctx = this.frozen.getContext('2d')!;
    ctx.clearRect(0, 0, this.frozen.width, this.frozen.height);
    ctx.drawImage(this.base, 0, 0);
    this.frozenAt = this.transform;
  }

  /** Renders the whole world once at scale 1 (after load, resize, theme or projection change). */
  private renderWorldBitmap() {
    this.worldBitmap.width = this.base.width;
    this.worldBitmap.height = this.base.height;
    const [base, micro] = this.layersFor('110m');
    drawBase(
      this.worldBitmap.getContext('2d')!,
      { k: 1, x: 0, y: 0, width: this.width, height: this.height, dpr: this.dpr },
      base,
      micro,
      this.statics,
      this.pal,
      {
        fast: false,
        oceanLabels: [],
        projection: this.projection,
        worldWidth: this.worldWidth,
      },
    );
    this.worldBitmapReady = true;
  }

  private drawHighlightLayer() {
    const [base, micro] = this.layersFor(this.lod);
    drawHighlight(this.highlight.getContext('2d')!, this.view, [base, micro], this.pal, {
      hover: this.hover,
      selected: this.selected,
      marks: this.marks,
      atlas: this.atlasMode,
    });
  }

  /** After a gesture: full-quality frame, LOD switch, pick buffer, camera event. */
  private settle() {
    if (this.transform.k >= DETAIL_ZOOM) this.loadDetail();
    this.pickDirty = true;
    this.requestDraw(true);
    this.requestFullDraw();
    this.opts.onCamera?.(this.camera);
  }

  private setTransform(t: ZoomTransform) {
    this.selection.call(this.zoomBehavior.transform, t);
  }

  private flyToTransform(target: ZoomTransform, fixedMs?: number) {
    const from = this.transform;
    const w = this.width;
    const a: [number, number, number] = [
      (w / 2 - from.x) / from.k,
      (this.height / 2 - from.y) / from.k,
      w / from.k,
    ];
    const b: [number, number, number] = [
      (w / 2 - target.x) / target.k,
      (this.height / 2 - target.y) / target.k,
      w / target.k,
    ];
    // A framed view (leg, search) must not be undone by a later chrome resize.
    this.userMoved = true;
    if (this.reducedMotion) {
      this.setTransform(target);
      return;
    }
    const interp = interpolateZoom(a, b);
    const duration = fixedMs ?? Math.min(1800, Math.max(600, interp.duration));
    const start = performance.now();
    const token = ++this.flying;
    const step = (now: number) => {
      if (token !== this.flying) return;
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const [cx, cy, vw] = interp(e);
      // Van Wijk zooms out on long flights; below ×1 the world would shrink off its frame.
      const k = Math.max(1, w / vw);
      this.setTransform(zoomIdentity.translate(w / 2 - k * cx, this.height / 2 - k * cy).scale(k));
      if (t < 1) requestAnimationFrame(step);
      else {
        this.flying = 0;
        this.settle();
      }
    };
    requestAnimationFrame(step);
  }

  private kmPerPx(): number {
    const c: [number, number] = [this.width / 2, this.height / 2];
    const a = this.invert([c[0] - 50, c[1]]);
    const b = this.invert([c[0] + 50, c[1]]);
    if (!a || !b) return 0;
    return (geoDistance(a, b) * EARTH_RADIUS_KM) / 100;
  }

  // ── Picking ──────────────────────────────────────────────────────────────────

  private ensurePickBuffer() {
    if (!this.pickDirty) return;
    this.pickDirty = false;
    const ctx = this.pickCanvas.getContext('2d', { willReadFrequently: true })!;
    const { k, x, y } = this.transform;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.pickCanvas.width, this.pickCanvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(k, 0, 0, k, x, y);
    this.pickUnits = [];
    for (const layer of this.layersFor(this.lod)) {
      for (const unit of layer.units) {
        const path = layer.unitPaths.get(unit.id);
        if (!path) continue;
        ctx.fillStyle = pickColor(this.pickUnits.length);
        this.pickUnits.push({ id: unit.id, entity: unit.entity, halo: false });
        ctx.fill(path);
      }
    }
    // Micro-state halos on top: a finger-sized target snapping to the aim point.
    for (const h of this.haloCandidates()) {
      const p = this.projection(h.lonLat);
      if (!p) continue;
      ctx.fillStyle = pickColor(this.pickUnits.length);
      this.pickUnits.push({ id: h.id, entity: h.id, halo: true });
      ctx.beginPath();
      ctx.arc(p[0], p[1], HALO_PX / 2 / k, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private pickBufferAt(x: number, y: number, radius = 0, minAlpha = radius ? 64 : 200) {
    this.ensurePickBuffer();
    const ctx = this.pickCanvas.getContext('2d', { willReadFrequently: true })!;
    const x0 = Math.max(0, Math.round(x) - radius);
    const y0 = Math.max(0, Math.round(y) - radius);
    const size = radius * 2 + 1;
    const img = ctx.getImageData(x0, y0, size, size).data;
    const hits: { unit: PickUnit; x: number; y: number; d: number }[] = [];
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const o = (j * size + i) * 4;
        // Partially covered pixels still identify thin capes and islets; a blend of two units
        // can decode to the wrong id, but every candidate is re-validated by resolvePick.
        if (img[o + 3]! < minAlpha) continue;
        const unit = this.pickUnits[pickIndex(img[o]!, img[o + 1]!, img[o + 2]!)];
        if (!unit) continue;
        const px = x0 + i;
        const py = y0 + j;
        const d = Math.hypot(px - x, py - y);
        if (d <= Math.max(radius, 0.5)) hits.push({ unit, x: px, y: py, d });
      }
    }
    return hits.sort((a, b) => a.d - b.d);
  }

  /** Tap resolution: halo → aim point; land → exact point; sea near a coast → snap. */
  pickScreen(x: number, y: number): MapPick {
    const direct = this.pickBufferAt(x, y)[0];
    if (direct?.unit.halo) {
      const entity = this.data.entities.get(direct.unit.id)!;
      return { ...resolvePick(this.data, entity.aimPoint as [number, number]), snapped: true };
    }
    const lonLat = this.invert([x, y]);
    if (lonLat) {
      const pick = resolvePick(this.data, lonLat);
      if (pick.kind !== 'sea') return { ...pick, snapped: false };
    }
    const tried = new Set<string>();
    for (const hit of this.pickBufferAt(x, y, SNAP_RADIUS_PX)) {
      if (hit.unit.halo) {
        const entity = this.data.entities.get(hit.unit.id)!;
        return { ...resolvePick(this.data, entity.aimPoint as [number, number]), snapped: true };
      }
      // Blended edge pixels can decode to any unit: dedupe by screen cell, not by id.
      const key = `${hit.x >> 1}:${hit.y >> 1}`;
      if (tried.has(key) || tried.size > 60) continue;
      tried.add(key);
      // An edge pixel's centre may sit just offshore: also probe 1–2 px further along the
      // tap → pixel ray, i.e. inland.
      const len = Math.max(hit.d, 0.5);
      const ux = (hit.x + 0.5 - x) / len;
      const uy = (hit.y + 0.5 - y) / len;
      for (const step of [0, 1, 2]) {
        const at = this.invert([hit.x + 0.5 + ux * step, hit.y + 0.5 + uy * step]);
        if (!at) continue;
        const pick = resolvePick(this.data, at);
        if (pick.kind !== 'sea') return { ...pick, snapped: true };
      }
    }
    return {
      ...(lonLat
        ? resolvePick(this.data, lonLat)
        : { lonLat: [0, 0], unitId: null, entity: null, kind: 'sea' as const }),
      snapped: false,
    };
  }

  private syncCamps() {
    const camps = [...this.camps];
    if (this.provisional && this.provisional.kind !== 'sea') {
      camps.push({ id: 'provisional', lonLat: this.provisional.lonLat, state: 'provisional' });
    }
    this.overlay.setCamps(camps);
    this.overlay.update(this.view);
  }

  private choose(pick: MapPick) {
    if (pick.kind === 'sea') {
      this.setProvisional(null);
      this.opts.onPick?.(pick);
      return;
    }
    this.setProvisional(pick);
  }

  // ── Gestures ─────────────────────────────────────────────────────────────────

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.host.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private bindGestures() {
    const h = this.host;
    h.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      const [x, y] = this.local(e);
      const timer =
        e.pointerType === 'mouse'
          ? 0
          : window.setTimeout(() => this.startLoupe(x, y), LONG_PRESS_MS);
      this.press = { id: e.pointerId, x, y, t: performance.now(), timer, type: e.pointerType };
    });
    h.addEventListener(
      'pointermove',
      (e) => {
        const [x, y] = this.local(e);
        if (this.loupeActive && this.press?.id === e.pointerId) {
          e.stopPropagation();
          this.moveLoupe(x, y);
          return;
        }
        if (this.press && Math.hypot(x - this.press.x, y - this.press.y) > TAP_SLOP_PX) {
          clearTimeout(this.press.timer);
          this.press = null;
        }
        if (e.pointerType === 'mouse') {
          this.pointer = [x, y];
          this.revealHalos();
          if (e.buttons === 0 && !this.interacting) this.hoverAt(x, y);
        }
      },
      { capture: true },
    );
    // While the loupe is open, the finger moves the loupe, not the map.
    h.addEventListener(
      'touchmove',
      (e) => {
        if (!this.loupeActive) return;
        e.stopPropagation();
        e.preventDefault();
      },
      { capture: true, passive: false },
    );
    const finish = (e: PointerEvent) => {
      const press = this.press;
      if (!press || press.id !== e.pointerId) return;
      clearTimeout(press.timer);
      this.press = null;
      const [x, y] = this.local(e);
      if (this.loupeActive) {
        this.endLoupe();
        this.choose(this.pickScreen(x, y));
        return;
      }
      if (
        e.type === 'pointerup' &&
        Math.hypot(x - press.x, y - press.y) <= TAP_SLOP_PX &&
        performance.now() - press.t < LONG_PRESS_MS
      ) {
        this.choose(this.pickScreen(x, y));
        this.host.focus({ preventScroll: true });
      }
    };
    h.addEventListener('pointerup', finish);
    h.addEventListener('pointercancel', (e) => {
      if (this.loupeActive) this.endLoupe();
      finish(e);
    });
    h.addEventListener('pointerleave', () => {
      this.pointer = null;
      this.revealHalos();
      if (this.hover) {
        this.hover = null;
        this.drawHighlightLayer();
      }
    });
    h.addEventListener('keydown', (e) => this.onKey(e));
  }

  private hoverAt(x: number, y: number) {
    const hit = this.pickBufferAt(x, y)[0];
    const next = hit ? (hit.unit.entity ?? hit.unit.id) : null;
    if (next === this.hover) return;
    this.hover = next;
    this.host.style.cursor = next ? 'crosshair' : '';
    this.drawHighlightLayer();
  }

  private onKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 5 : 0.5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      if (this.provisional && this.provisional.kind !== 'sea') {
        const [lon, lat] = this.provisional.lonLat;
        this.setProvisional({
          ...this.pickAt([lon + move[0], Math.max(-89, Math.min(89, lat + move[1]))]),
          snapped: false,
        });
      } else {
        this.selection.call(
          this.zoomBehavior.translateBy,
          (-move[0] * 60) / step / this.transform.k,
          (move[1] * 60) / step / this.transform.k,
        );
        this.settle();
      }
      return;
    }
    if (e.key === '+' || e.key === '=') this.zoomAt([this.width / 2, this.height / 2], 1.6);
    else if (e.key === '-') this.zoomAt([this.width / 2, this.height / 2], 1 / 1.6);
    else if (e.key === 'Escape') this.setProvisional(null);
    else if (e.key === 'Enter' && this.provisional && this.provisional.kind !== 'sea')
      this.opts.onConfirm?.(this.provisional);
  }

  // ── Loupe (long press) ───────────────────────────────────────────────────────

  private startLoupe(x: number, y: number) {
    if (!this.press) return;
    this.loupeActive = true;
    this.loupe.style.display = 'block';
    navigator.vibrate?.(8);
    this.moveLoupe(x, y);
  }

  private moveLoupe(x: number, y: number) {
    const size = LOUPE_PX;
    const left = Math.max(4, Math.min(this.width - size - 4, x - size / 2));
    const top = y - size - 48 < 4 ? y + 48 : y - size - 48;
    this.loupe.style.transform = `translate(${left}px, ${top}px)`;

    const ctx = this.loupe.getContext('2d')!;
    const { k, x: tx, y: ty } = this.transform;
    const lk = k * LOUPE_ZOOM;
    const [wx, wy] = [(x - tx) / k, (y - ty) / k];
    const view: View = {
      k: lk,
      x: size / 2 - lk * wx,
      y: size / 2 - lk * wy,
      width: size,
      height: size,
      dpr: this.dpr,
    };
    const [base, micro] = this.layersFor(this.lod);
    drawBase(ctx, view, base, micro, this.statics, this.pal, {
      fast: true,
      oceanLabels: [],
      projection: this.projection,
    });
    drawHighlight(ctx, view, [base, micro], this.pal, {
      hover: this.pickBufferAt(x, y)[0]?.unit.entity ?? null,
      selected: null,
      clear: false,
      marks: this.marks,
    });
    // Halo targets within the loupe, at their real finger size.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = this.pal['ink-500'];
    ctx.lineWidth = 0.75;
    for (const h of this.haloCandidates()) {
      const p = this.projection(h.lonLat);
      if (!p) continue;
      const lx = p[0] * view.k + view.x;
      const ly = p[1] * view.k + view.y;
      if (lx < -20 || ly < -20 || lx > size + 20 || ly > size + 20) continue;
      ctx.beginPath();
      ctx.arc(lx, ly, HALO_PX / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Reticle
    ctx.strokeStyle = this.pal['vermilion-600'];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2 - 12, size / 2);
    ctx.lineTo(size / 2 - 4, size / 2);
    ctx.moveTo(size / 2 + 4, size / 2);
    ctx.lineTo(size / 2 + 12, size / 2);
    ctx.moveTo(size / 2, size / 2 - 12);
    ctx.lineTo(size / 2, size / 2 - 4);
    ctx.moveTo(size / 2, size / 2 + 4);
    ctx.lineTo(size / 2, size / 2 + 12);
    ctx.stroke();
  }

  private endLoupe() {
    this.loupeActive = false;
    this.loupe.style.display = 'none';
  }
}
