import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import {
  AtlasMapEngine,
  type AtlasMapOptions,
  type CameraState,
  type Insets,
  type MapPick,
} from './AtlasMapEngine';
import type { GeoData } from './geodata';
import { loadDetailLayer } from './loadGeoData';
import type { CampMarker, RouteLeg } from './overlay';
import type { ProjectionKind } from './projection';
import type { CountryMark } from './render';
import './map.css';

export interface AtlasMapProps {
  data: GeoData;
  projection?: ProjectionKind;
  centerLon?: number;
  camps?: CampMarker[];
  route?: RouteLeg[];
  meridianLon?: number | null;
  marks?: CountryMark[];
  /** Personal atlas view: unvisited countries hatched as terra incognita. */
  atlas?: boolean;
  insets?: Insets;
  locale?: 'fr' | 'en';
  /** Portrait home view centres on this point (current camp). */
  homeFocus?: [number, number] | null;
  /** Chrome margins the world view is fitted around (launcher). */
  homeInsets?: Insets;
  className?: string | undefined;
  onPick?: (pick: MapPick | null) => void;
  onConfirm?: (pick: MapPick) => void;
  onCamera?: (camera: CameraState) => void;
  onRouteProgress?: (km: number, done: boolean) => void;
  onSlow?: () => void;
}

/**
 * React host for the imperative map engine (architecture §4.7): no map data lives in React
 * state, gestures never re-render React. The ref exposes the engine API.
 */
export const AtlasMap = forwardRef<AtlasMapEngine | null, AtlasMapProps>(
  function AtlasMap(props, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<AtlasMapEngine | null>(null);
    const callbacks = useRef(props);
    callbacks.current = props;

    // Layout effect, declared before the imperative handle: the ref sees the engine immediately.
    useLayoutEffect(() => {
      const opts: AtlasMapOptions = {
        data: props.data,
        projection: props.projection ?? 'equalEarth',
        centerLon: props.centerLon ?? 0,
        loadDetail: loadDetailLayer,
        onPick: (p) => callbacks.current.onPick?.(p),
        onConfirm: (p) => callbacks.current.onConfirm?.(p),
        onCamera: (c) => callbacks.current.onCamera?.(c),
        onSlow: () => callbacks.current.onSlow?.(),
      };
      const engine = new AtlasMapEngine(hostRef.current!, opts);
      engineRef.current = engine;
      return () => {
        engine.destroy();
        engineRef.current = null;
      };
      // The engine is created once per data set; other props are pushed below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.data]);

    useImperativeHandle(ref, () => engineRef.current as AtlasMapEngine);

    useEffect(() => {
      engineRef.current?.setProjection(props.projection ?? 'equalEarth', props.centerLon ?? 0);
    }, [props.projection, props.centerLon]);

    useEffect(() => {
      engineRef.current?.setCamps(props.camps ?? []);
    }, [props.camps]);

    useEffect(() => {
      engineRef.current?.setRoute(props.route ?? [], (km, done) =>
        callbacks.current.onRouteProgress?.(km, done),
      );
    }, [props.route]);

    useEffect(() => {
      engineRef.current?.setMeridian(props.meridianLon ?? null);
    }, [props.meridianLon]);

    useEffect(() => {
      engineRef.current?.setMarks(props.marks ?? [], props.atlas ?? false);
    }, [props.marks, props.atlas]);

    useEffect(() => {
      engineRef.current?.setHomeFocus(props.homeFocus ?? null);
    }, [props.homeFocus]);

    useEffect(() => {
      if (props.insets) engineRef.current?.setInsets(props.insets);
    }, [props.insets]);

    useEffect(() => {
      if (props.locale) engineRef.current?.setLocale(props.locale);
    }, [props.locale]);

    useEffect(() => {
      if (props.homeInsets) engineRef.current?.setHomeInsets(props.homeInsets);
    }, [props.homeInsets]);

    return <div ref={hostRef} className={props.className} />;
  },
);
