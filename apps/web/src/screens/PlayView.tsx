import { haversineKm } from '@meridian/geo';
import { activeLeg, spyglassAllowance, type EngineEvent, type RunState } from '@meridian/engine';
import type { PromptCategory } from '@meridian/content-schema';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatNumber, useLocale, useT, type StringKey } from '../game/i18n';
import { navigate } from '../game/router';
import { useGame } from '../game/store';
import { AtlasMap } from '../map/AtlasMap';
import type { AtlasMapEngine, CameraState, MapPick } from '../map/AtlasMapEngine';
import type { CampMarker, RouteLeg } from '../map/overlay';
import { bestCenterLon } from '../map/projection';
import type { CountryMark } from '../map/render';
import { CompassRose } from '../ui/CompassRose';
import { countryNames } from '../ui/countryNames';
import { CountrySearch } from '../ui/CountrySearch';
import { CampBar } from '../ui/game/CampBar';
import gameStyles from '../ui/game/game.module.css';
import { LegLog } from '../ui/game/LegLog';
import { MarginNote } from '../ui/game/MarginNote';
import { MissionList, MissionOrders } from '../ui/game/MissionOrders';
import { Odometer } from '../ui/game/Odometer';
import { PromptCartouche } from '../ui/game/PromptCartouche';
import { ScaleBar } from '../ui/ScaleBar';
import styles from './screens.module.css';
import { useMapInsets } from './useMapInsets';

const TIER_KEY = {
  known: 'tierKnown',
  trail: 'tierTrail',
  frontier: 'tierFrontier',
  incognita: 'tierIncognita',
} as const;
/** Resolution choreography budget (design-system §8: ≤ 3.5 s, skippable). */
const RESOLVE_MS = { valid: 2600, falseTrail: 3200, reduced: 900 };

declare global {
  interface Window {
    /** Test hook (Playwright): the map engine of the current screen. */
    __meridian?: { engine: AtlasMapEngine | null };
  }
}

const deg = (locale: string) =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export function PlayView({ run, friend }: { run: RunState; friend: RunState | null }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { geo, content, dispatch } = useGame();
  const deps = content!.deps;
  const engine = useRef<AtlasMapEngine | null>(null);
  const [pick, setPick] = useState<MapPick | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [traced, setTraced] = useState(0);
  const [logOpen, setLogOpen] = useState(() => window.innerWidth >= 900);
  const [searchOpen, setSearchOpen] = useState(false);
  const [spy, setSpy] = useState<{ leg: number; subregions: string[] } | null>(null);
  /** The leg being resolved (choreography), or null while playing. */
  const [resolving, setResolving] = useState<{ leg: number; valid: boolean } | null>(null);
  const legStart = useRef(0);
  /** Leg to frame once the projection has settled (prev camp → new camp). */
  const [frame, setFrame] = useState<[[number, number], [number, number]] | null>(null);
  const moves = useRef(0);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    window.__meridian = { engine: engine.current };
  });
  useEffect(() => {
    legStart.current = performance.now();
  }, []);

  const names = useMemo(() => countryNames(deps.entities.values(), locale), [deps, locale]);
  const nameOf = useCallback((iso3: string) => deps.nameOf?.(iso3, locale) ?? iso3, [deps, locale]);
  const say = useCallback((text: string) => setNote((n) => ({ id: (n?.id ?? 0) + 1, text })), []);

  const exp = run.expedition;
  const active = activeLeg(run, deps);
  const shownLeg = resolving ? run.legs[resolving.leg - 1] : null;
  const legDef = resolving
    ? (() => {
        const l = exp.legs[resolving.leg - 1]!;
        return shownLeg?.usedFallback && l.fallback ? l.fallback : l;
      })()
    : active.def;
  const category = (legDef.promptId.split('.')[0] ?? 'position') as PromptCategory;

  // ── Map state ────────────────────────────────────────────────────────────
  const valid = run.legs.filter((l) => l.valid);
  const stops = useMemo(
    () => [
      exp.start.lonLat as [number, number],
      ...run.legs.filter((l) => l.valid).map((l) => l.pick.lonLat as [number, number]),
    ],
    [exp, run.legs],
  );
  const camps: CampMarker[] = useMemo(() => {
    const out: CampMarker[] = [{ id: 'port', lonLat: stops[0]!, state: 'start' }];
    let n = 0;
    run.legs.forEach((l, i) => {
      const last = i === run.legs.length - 1;
      if (!l.valid) {
        if (last && resolving)
          out.push({ id: `c${i}`, lonLat: l.pick.lonLat as [number, number], state: 'invalid' });
        return;
      }
      n++;
      out.push(
        last
          ? { id: `c${i}`, lonLat: l.pick.lonLat as [number, number], state: 'planted' }
          : {
              id: `c${i}`,
              lonLat: l.pick.lonLat as [number, number],
              state: 'historic',
              label: String(n),
            },
      );
    });
    return out;
  }, [run.legs, stops, resolving]);

  const ghostLegs: RouteLeg[] = useMemo(() => {
    if (!friend) return [];
    // The friend's route is never shown before the player has played the same leg (§6.16).
    const out: RouteLeg[] = [];
    let from = friend.expedition.start.lonLat as [number, number];
    friend.legs.slice(0, run.legs.length).forEach((l) => {
      if (!l.valid) return;
      out.push({ from, to: l.pick.lonLat as [number, number], ghost: true });
      from = l.pick.lonLat as [number, number];
    });
    return out;
  }, [friend, run.legs.length]);

  const route: RouteLeg[] = useMemo(() => {
    const legs = stops.slice(1).map((to, i) => ({
      from: stops[i]!,
      to,
      animate: !!resolving?.valid && i === stops.length - 2,
    }));
    return [...ghostLegs, ...legs];
  }, [stops, resolving, ghostLegs]);

  const centerLon = useMemo(
    () =>
      bestCenterLon('equalEarth', [
        ...route.map((l) => [l.from, l.to] as [[number, number], [number, number]]),
      ]),
    [route],
  );

  const marks: CountryMark[] = useMemo(() => {
    const out: CountryMark[] = run.legs.map((l) =>
      l.valid
        ? { entity: l.pick.iso3, state: 'valid', tier: l.rarity?.tier ?? 'known' }
        : { entity: l.pick.iso3, state: 'falseTrail' },
    );
    if (spy && spy.leg === run.currentLeg && !resolving)
      for (const e of deps.entities.values())
        if (spy.subregions.includes(e.subregionM49)) out.push({ entity: e.iso3, state: 'hint' });
    return out;
  }, [run.legs, run.currentLeg, spy, resolving, deps]);

  const insets = useMapInsets([resolving, logOpen]);

  // Child effects (projection) run before this one: the flight targets the rotated world.
  useEffect(() => {
    if (!frame) return;
    const [a, b] = frame;
    const w = Math.min(a[0], b[0]);
    const e = Math.max(a[0], b[0]);
    const s = Math.min(a[1], b[1]);
    const n = Math.max(a[1], b[1]);
    engine.current?.flyToBounds(e - w > 180 ? [e, s, w, n] : [w, s, e, n], 6);
  }, [frame, centerLon]);

  // ── Choreography ─────────────────────────────────────────────────────────
  const finishResolution = useCallback(() => {
    setResolving(null);
    setTraced(0);
    legStart.current = performance.now();
    moves.current = 0;
  }, []);

  useEffect(() => {
    if (!resolving) return;
    const ms = reduced
      ? RESOLVE_MS.reduced
      : resolving.valid
        ? RESOLVE_MS.valid
        : RESOLVE_MS.falseTrail;
    const timer = window.setTimeout(finishResolution, ms);
    return () => clearTimeout(timer);
  }, [resolving, reduced, finishResolution]);

  const react = useCallback(
    (events: EngineEvent[], prev: [number, number]) => {
      for (const e of events) {
        if (e.type === 'CAMP_REFUSED') {
          const key: Record<typeof e.reason, StringKey> = {
            not_playable: 'atSea',
            disputed: 'unplantable',
            already_used: 'alreadyUsed',
            finished: 'completed',
          };
          setHint(t(key[e.reason], { name: pick?.entity ? nameOf(pick.entity) : '' }));
          return;
        }
      }
      const planted = events.find((e) => e.type === 'CAMP_PLANTED');
      const falseTrail = events.find((e) => e.type === 'FALSE_TRAIL');
      const leg =
        planted?.type === 'CAMP_PLANTED'
          ? planted.leg
          : falseTrail?.type === 'FALSE_TRAIL'
            ? falseTrail.leg
            : 0;
      if (!leg) return;
      setResolving({ leg, valid: !!planted });
      engine.current?.setProvisional(null);
      setPick(null);
      setHint(null);
      if (planted?.type === 'CAMP_PLANTED') {
        // Framed after the render: the world may rotate to keep the new leg uncut.
        const to = pick ? pick.lonLat : prev;
        setFrame([prev, to]);
        if (events.some((x) => x.type === 'MERIDIAN_CROSSED')) say(t('meridianCrossed'));
      } else if (falseTrail?.type === 'FALSE_TRAIL') {
        const l = exp.legs[leg - 1]!;
        const def =
          run.legs.length >= leg && run.legs[leg - 1]?.usedFallback && l.fallback ? l.fallback : l;
        say(`${t('falseTrail', { name: nameOf(falseTrail.iso3) })} ${def.explain[locale]}`);
      }
    },
    [t, pick, nameOf, say, exp, run.legs, locale],
  );

  const plant = useCallback(() => {
    if (!pick || resolving) return;
    const prev = run.camp as [number, number];
    const events = dispatch(run.runId, {
      type: 'CONFIRM_CAMP',
      lonLat: pick.lonLat,
      iso3: pick.kind === 'unplantable' ? pick.unitId : pick.entity,
      ms: Math.round(performance.now() - legStart.current),
      provisionalMoves: moves.current,
      now: new Date().toISOString(),
    });
    react(events, prev);
  }, [pick, resolving, run, dispatch, react]);

  const onPick = useCallback(
    (p: MapPick | null) => {
      if (resolving) return;
      moves.current++;
      setPick(p && p.kind !== 'sea' ? p : null);
      if (!p) return setHint(null);
      if (p.kind === 'sea') setHint(t('atSea'));
      else if (p.kind === 'unplantable') setHint(t('unplantable'));
      else if (p.entity && run.usedIso3.includes(p.entity))
        setHint(t('alreadyUsed', { name: nameOf(p.entity) }));
      else if (p.snapped) setHint(t('snapped'));
      else setHint(null);
    },
    [resolving, run.usedIso3, t, nameOf],
  );

  const lookThroughSpyglass = () => {
    const events = dispatch(run.runId, { type: 'USE_SPYGLASS' });
    const used = events.find((e) => e.type === 'SPYGLASS_USED');
    if (used?.type === 'SPYGLASS_USED') {
      setSpy({ leg: used.leg, subregions: used.subregions });
      engine.current?.resetView(); // step back so the outlined regions are visible
      say(t('spyglassNote'));
    }
  };

  const onSearch = (iso3: string) => {
    const e = deps.entities.get(iso3);
    if (!e || !engine.current) return;
    engine.current.flyToBounds(
      e.mainBbox as [number, number, number, number],
      e.isMicroState ? 14 : 12,
    );
    engine.current.setProvisional(engine.current.pickAt(e.aimPoint as [number, number]));
    engine.current.focusMap();
    setSearchOpen(false);
  };

  // '/' opens the register (design-system §6.12).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Numbers ──────────────────────────────────────────────────────────────
  const totalKm = valid.reduce((s, l) => s + l.distanceKm, 0);
  const lastLegKm = resolving?.valid ? (shownLeg?.distanceKm ?? 0) : 0;
  const odometerKm = traced && resolving?.valid ? totalKm - lastLegKm + traced : totalKm;
  const potential = pick?.entity ? haversineKm(run.camp, pick.lonLat) : null;
  const spyLeft = spyglassAllowance(run, deps) - run.spyglassLegs.length;
  const plantable =
    !!pick &&
    !resolving &&
    pick.kind !== 'unplantable' &&
    !!pick.entity &&
    !run.usedIso3.includes(pick.entity);

  const d = deg(locale);
  const coord = ([lon, lat]: [number, number]) =>
    `${d.format(Math.abs(lat))}° ${lat >= 0 ? 'N' : 'S'} · ${d.format(Math.abs(lon))}° ${lon >= 0 ? 'E' : locale === 'fr' ? 'O' : 'W'}`;

  const resolvedInfo =
    resolving && shownLeg
      ? {
          tier: shownLeg.valid ? (shownLeg.rarity?.tier ?? 'known') : null,
          iso3: shownLeg.pick.iso3,
          label: shownLeg.valid
            ? `${nameOf(shownLeg.pick.iso3)} · ${t(TIER_KEY[shownLeg.rarity?.tier ?? 'known'])}${run.attempt === 'replay' ? '' : ` (${t('estimated')})`}`
            : t('falseTrail', { name: nameOf(shownLeg.pick.iso3) }),
        }
      : null;

  // When the last leg resolves, the summary takes over after the choreography.
  useEffect(() => {
    if (run.currentLeg > 6 && !resolving) navigate(`/x/${exp.code}`, true);
  }, [run.currentLeg, resolving, exp.code]);

  return (
    <main
      className={styles.screen}
      onClick={resolving ? finishResolution : undefined}
      style={{ '--chrome-bottom': `${insets.bottom || 100}px` } as CSSProperties}
    >
      <AtlasMap
        ref={engine}
        locale={locale}
        className={styles.map}
        data={geo!}
        centerLon={centerLon}
        camps={camps}
        route={route}
        meridianLon={exp.meridianLon}
        marks={marks}
        insets={insets}
        homeFocus={run.camp as [number, number]}
        onPick={onPick}
        onConfirm={plant}
        onCamera={setCamera}
        onRouteProgress={(km, done) => setTraced(done ? 0 : km)}
      />

      <div data-inset="top">
        <PromptCartouche
          overline={t('legOf', { n: resolving?.leg ?? active.index })}
          text={legDef.text[locale]}
          category={category}
          resolved={resolvedInfo}
          hint={resolving ? t('skip') : null}
        />
      </div>

      <div className={styles.compass} data-map-chrome>
        <CompassRose onReset={() => engine.current?.resetView()} />
      </div>

      <div className={styles.scale} data-map-chrome>
        {camera && <ScaleBar kmPerPx={camera.kmPerPx} />}
      </div>

      <div data-inset="left">
        <LegLog
          run={run}
          nameOf={nameOf}
          open={logOpen}
          onToggle={() => setLogOpen((o) => !o)}
          ghost={friend?.legs
            .slice(0, run.legs.length)
            .map((l) => ({ valid: l.valid, km: l.distanceKm, iso3: l.pick.iso3 }))}
        >
          <MissionList missions={exp.missions} />
          <div className={styles.logActions}>
            <button type="button" className={styles.ghostButton} onClick={() => navigate('/')}>
              {t('home')}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => {
                if (window.confirm(t('abandonConfirm')))
                  dispatch(run.runId, { type: 'ABANDON', now: new Date().toISOString() });
              }}
            >
              {t('abandon')}
            </button>
          </div>
        </LegLog>
      </div>

      <MissionOrders missions={exp.missions} />

      {searchOpen && (
        <div className={styles.searchBox} data-map-chrome>
          <CountrySearch names={names} onSelect={onSearch} />
        </div>
      )}

      <MarginNote note={note} />

      <div data-inset="bottom">
        <CampBar
          title={pick ? (pick.entity ? nameOf(pick.entity) : t('unplantable')) : null}
          detail={pick ? coord(pick.lonLat) : null}
          gain={potential !== null ? `+${formatNumber(locale, potential)} km` : null}
          placeholder={window.innerWidth < 600 ? t('tapMapShort') : t('tapMap')}
          note={hint}
          canPlant={plantable}
          plantLabel={t('plant')}
          onPlant={plant}
        >
          <button
            type="button"
            className={`${gameStyles.tool} ${gameStyles.mobileOnly}`}
            onClick={() => setLogOpen((o) => !o)}
            aria-expanded={logOpen}
            aria-label={t('log')}
            title={t('log')}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M6 3h11a1 1 0 0 1 1 1v16l-3-2-3 2V3M6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <Odometer
            km={odometerKm}
            gain={resolving?.valid && traced ? Math.round(lastLegKm) : null}
            label={t('distance')}
          />
          <button
            type="button"
            className={gameStyles.tool}
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="/"
            title="/"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <circle
                cx="10.5"
                cy="10.5"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path d="m15 15 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className={gameStyles.tool}
            onClick={lookThroughSpyglass}
            disabled={spyLeft <= 0 || run.spyglassLegs.includes(run.currentLeg) || !!resolving}
            aria-label={t('spyglassLeft', { n: spyLeft })}
            title={t('spyglassLeft', { n: spyLeft })}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="m3 15 12-7 2 3.5-12 7zM15 8l4-2 2 3.5-4 2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span className={gameStyles.toolBadge}>{spyLeft}</span>
          </button>
        </CampBar>
      </div>
    </main>
  );
}
