import { haversineKm } from '@meridian/geo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AtlasMap } from '../map/AtlasMap';
import type { AtlasMapEngine, CameraState, MapPick } from '../map/AtlasMapEngine';
import type { GeoData } from '../map/geodata';
import { loadGeoData } from '../map/loadGeoData';
import type { CampMarker, RouteLeg } from '../map/overlay';
import type { ProjectionKind } from '../map/projection';
import { CompassRose } from '../ui/CompassRose';
import { countryNames } from '../ui/countryNames';
import { CountrySearch } from '../ui/CountrySearch';
import { ScaleBar } from '../ui/ScaleBar';
import styles from './MapLab.module.css';

const PORT = { name: 'Lisbonne', lonLat: [-9.14, 38.72] as [number, number] };
const MERIDIAN = 30;

interface Planted {
  lonLat: [number, number];
  entity: string;
}

declare global {
  interface Window {
    /** Test hook for Playwright (phase 1 lab only). */
    __meridianLab?: { engine: AtlasMapEngine | null; data: GeoData };
  }
}

const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const coord = ([lon, lat]: [number, number]) =>
  `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'O'}`;

/** Phase 1 vertical slice: the map, planting camps and drawing the route (development-plan 1.9). */
export function MapLab() {
  const [data, setData] = useState<GeoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projection, setProjection] = useState<ProjectionKind>('equalEarth');
  const [pick, setPick] = useState<MapPick | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [planted, setPlanted] = useState<Planted[]>([]);
  const [animateLast, setAnimateLast] = useState(false);
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [traced, setTraced] = useState(0);
  const engine = useRef<AtlasMapEngine | null>(null);

  useEffect(() => {
    loadGeoData().then(setData, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (data) window.__meridianLab = { engine: engine.current, data };
  });

  const names = useMemo(() => (data ? countryNames(data.entities.values()) : []), [data]);
  const nameOf = useCallback(
    (iso3: string | null) => names.find((n) => n.iso3 === iso3)?.name ?? iso3 ?? '',
    [names],
  );

  const last = planted.at(-1)?.lonLat ?? PORT.lonLat;
  const usedEntities = useMemo(() => new Set(planted.map((p) => p.entity)), [planted]);

  const camps: CampMarker[] = useMemo(
    () => [
      { id: 'port', lonLat: PORT.lonLat, state: 'start' },
      ...planted.map((p, i): CampMarker =>
        i === planted.length - 1
          ? { id: `camp-${i}`, lonLat: p.lonLat, state: 'planted' }
          : { id: `camp-${i}`, lonLat: p.lonLat, state: 'historic', label: String(i + 1) },
      ),
    ],
    [planted],
  );

  const route: RouteLeg[] = useMemo(() => {
    const stops = [PORT.lonLat, ...planted.map((p) => p.lonLat)];
    return stops
      .slice(1)
      .map((to, i) => ({ from: stops[i]!, to, animate: animateLast && i === stops.length - 2 }));
  }, [planted, animateLast]);

  const totalKm = useMemo(() => {
    const stops = [PORT.lonLat, ...planted.map((p) => p.lonLat)];
    return stops.slice(1).reduce((s, p, i) => s + haversineKm(stops[i]!, p), 0);
  }, [planted]);

  const onPick = useCallback(
    (p: MapPick | null) => {
      setPick(p && p.kind !== 'sea' ? p : null);
      if (!p) return setNote(null);
      if (p.kind === 'sea')
        setNote('En mer : rapprochez-vous d’une côte, ou maintenez le doigt pour la loupe.');
      else if (p.kind === 'unplantable')
        setNote('Territoire non plantable (statut contesté ou non membre de l’ONU).');
      else if (p.entity && usedEntities.has(p.entity))
        setNote(`Vous avez déjà campé : ${nameOf(p.entity)}.`);
      else if (p.snapped) setNote('Camp recalé sur la terre la plus proche.');
      else setNote(null);
    },
    [nameOf, usedEntities],
  );

  const plantable =
    pick && pick.kind !== 'unplantable' && pick.entity && !usedEntities.has(pick.entity);

  const plant = useCallback(() => {
    if (!pick || !plantable || !pick.entity) return;
    setAnimateLast(true);
    setTraced(0);
    setPlanted((ps) => [...ps, { lonLat: pick.lonLat, entity: pick.entity! }]);
    engine.current?.setProvisional(null);
    setPick(null);
    setNote(null);
  }, [pick, plantable]);

  const onSearch = (iso3: string) => {
    const e = data?.entities.get(iso3);
    if (!e || !engine.current) return;
    engine.current.flyToBounds(
      e.mainBbox as [number, number, number, number],
      e.isMicroState ? 14 : 12,
    );
    engine.current.setProvisional(engine.current.pickAt(e.aimPoint as [number, number]));
    engine.current.focusMap();
  };

  if (error) return <p className={styles.error}>Impossible de charger l’atlas : {error}</p>;
  if (!data) return <div className={`${styles.loading} paper`} aria-busy="true" />;

  const distance = pick ? haversineKm(last, pick.lonLat) : null;
  // While the last leg is being traced, the odometer rolls with the ink.
  const lastLeg = route.at(-1);
  const odometerKm =
    traced && lastLeg ? totalKm - haversineKm(lastLeg.from, lastLeg.to) + traced : totalKm;

  return (
    <main className={styles.lab}>
      <AtlasMap
        ref={engine}
        className={styles.map}
        data={data}
        projection={projection}
        camps={camps}
        route={route}
        meridianLon={MERIDIAN}
        onPick={onPick}
        onConfirm={plant}
        onCamera={setCamera}
        onRouteProgress={(km, done) => setTraced(done ? 0 : km)}
      />

      <header className={styles.cartouche}>
        <p className={styles.overline}>Laboratoire · Phase 1</p>
        <h1 className={styles.title}>Planter un camp</h1>
        <p className={styles.hint}>
          Touchez un pays, ajustez, puis plantez. Appui long : loupe. Départ : {PORT.name}.
        </p>
      </header>

      <div className={styles.searchBox}>
        <CountrySearch names={names} onSelect={onSearch} />
      </div>

      <div className={styles.compass}>
        <CompassRose onReset={() => engine.current?.resetView()} />
      </div>

      <section className={styles.odometer} aria-label="Distance parcourue">
        <span className={styles.odometerValue}>{fmt.format(Math.round(odometerKm))}</span>
        <span className={styles.unit}> km</span>
      </section>

      <div className={styles.scale}>{camera && <ScaleBar kmPerPx={camera.kmPerPx} />}</div>

      <div className={styles.toggles} role="group" aria-label="Réglages du laboratoire">
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setProjection((p) => (p === 'equalEarth' ? 'naturalEarth' : 'equalEarth'))}
        >
          {projection === 'equalEarth' ? 'Equal Earth' : 'Natural Earth I'}
        </button>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => {
            const root = document.documentElement;
            root.dataset.theme = root.dataset.theme === 'nocturne' ? 'atlas' : 'nocturne';
          }}
        >
          Thème
        </button>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => {
            setPlanted([]);
            setAnimateLast(false);
            engine.current?.setProvisional(null);
          }}
        >
          Effacer
        </button>
      </div>

      <section className={styles.campBar} aria-live="polite">
        <div className={styles.campInfo}>
          {pick ? (
            <>
              <p className={styles.country}>{nameOf(pick.entity) || 'Territoire'}</p>
              <p className={styles.coord}>
                {coord(pick.lonLat)}
                {distance !== null && pick.entity && ` · +${fmt.format(Math.round(distance))} km`}
              </p>
            </>
          ) : (
            <p className={styles.placeholder}>Touchez la carte pour poser un camp provisoire</p>
          )}
          {note && <p className={styles.note}>{note}</p>}
        </div>
        <button
          type="button"
          className={styles.seal}
          onClick={plant}
          disabled={!plantable}
          aria-label="Planter le camp"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              d="M12 3 2 20h20L12 3Zm0 8.5L8.6 20h6.8L12 11.5Z"
              fill="currentColor"
              fillRule="evenodd"
            />
          </svg>
        </button>
      </section>
    </main>
  );
}
