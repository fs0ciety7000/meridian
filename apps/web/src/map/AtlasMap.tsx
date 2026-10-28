import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import {
  AtlasMapEngine,
  type AtlasMapOptions,
  type CameraState,
  type MapPick,
} from './AtlasMapEngine';
import type { GeoData } from './geodata';
import { loadDetailLayer } from './loadGeoData';
import type { CampMarker, RouteLeg } from './overlay';
import type { ProjectionKind } from './projection';
import './map.css';

export interface AtlasMapProps {
  data: GeoData;
  projection?: ProjectionKind;
  centerLon?: number;
  camps?: CampMarker[];
  route?: RouteLeg[];
  meridianLon?: number | null;
  className?: string | undefined;
  onPick?: (pick: MapPick | null) => void;
  onConfirm?: (pick: MapPick) => void;
  onCamera?: (camera: CameraState) => void;
  onRouteProgress?: (km: number, done: boolean) => void;
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

    return <div ref={hostRef} className={props.className} />;
  },
);
