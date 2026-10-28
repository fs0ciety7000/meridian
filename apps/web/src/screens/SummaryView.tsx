import { encodeShare, type RunState } from '@meridian/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { digitGroups, formatNumber, useLocale, useT } from '../game/i18n';
import { navigate } from '../game/router';
import { useGame } from '../game/store';
import { AtlasMap } from '../map/AtlasMap';
import type { AtlasMapEngine } from '../map/AtlasMapEngine';
import type { CampMarker, RouteLeg } from '../map/overlay';
import { bestCenterLon, pointsBounds } from '../map/projection';
import type { CountryMark } from '../map/render';
import { MissionList } from '../ui/game/MissionOrders';
import { Stamp } from '../ui/Stamp';
import styles from './screens.module.css';
import { useMapInsets } from './useMapInsets';

const SHARE_INK = { known: '🟤', trail: '🟢', frontier: '🔵', incognita: '⭐' } as const;

function routeOf(run: RunState, ghost = false): RouteLeg[] {
  const out: RouteLeg[] = [];
  let from = run.expedition.start.lonLat as [number, number];
  for (const l of run.legs) {
    if (!l.valid) continue;
    out.push({ from, to: l.pick.lonLat as [number, number], ghost });
    from = l.pick.lonLat as [number, number];
  }
  return out;
}

/** Expedition summary (design-system §6.10) and challenge comparison (§6.16). */
export function SummaryView({
  run,
  friend,
  onReplay,
}: {
  run: RunState;
  friend: RunState | null;
  onReplay: () => void;
}) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { geo, content } = useGame();
  const deps = content!.deps;
  const nameOf = (iso3: string) => deps.nameOf?.(iso3, locale) ?? iso3;
  const engine = useRef<AtlasMapEngine | null>(null);
  const [copied, setCopied] = useState(false);
  const insets = useMapInsets([]);
  const score = run.score!;
  const exp = run.expedition;

  const route = useMemo(
    () => [...(friend ? routeOf(friend, true) : []), ...routeOf(run)],
    [run, friend],
  );
  const camps: CampMarker[] = useMemo(
    () => [
      { id: 'port', lonLat: exp.start.lonLat as [number, number], state: 'start' },
      ...run.legs
        .filter((l) => l.valid)
        .map((l, i): CampMarker => ({
          id: `c${i}`,
          lonLat: l.pick.lonLat as [number, number],
          state: 'historic',
          label: String(i + 1),
        })),
    ],
    [run, exp],
  );
  const marks: CountryMark[] = useMemo(
    () =>
      run.legs.map((l) =>
        l.valid
          ? { entity: l.pick.iso3, state: 'valid', tier: l.rarity?.tier ?? 'known' }
          : { entity: l.pick.iso3, state: 'falseTrail' },
      ),
    [run],
  );
  const centerLon = useMemo(
    () =>
      bestCenterLon(
        'equalEarth',
        route.map((l) => [l.from, l.to]),
      ),
    [route],
  );

  useEffect(() => {
    window.__meridian = { engine: engine.current };
  });

  // Frame the whole route in the area the summary panel leaves free (AD counter-review R6).
  const stops = useMemo(
    () => [
      exp.start.lonLat as [number, number],
      ...run.legs.filter((l) => l.valid).map((l) => l.pick.lonLat as [number, number]),
    ],
    [exp, run.legs],
  );
  useEffect(() => {
    if (!insets.bottom && !insets.left && !insets.right) return;
    engine.current?.flyToBounds(pointsBounds(stops, centerLon), 6);
  }, [insets, stops, centerLon]);

  const shareUrl = `${location.origin}/x/${exp.code}?r=${encodeShare(
    exp.code,
    run.legs.map((l) => l.pick.lonLat),
  )}`;
  const share = async () => {
    const stamps = run.legs
      .map((l) => (l.valid ? SHARE_INK[l.rarity?.tier ?? 'known'] : '✖️'))
      .join('');
    const text = `Meridian ${exp.code} — ${formatNumber(locale, score.distanceKm)} km · ${t('renown')} ${formatNumber(locale, score.renown)}\n${stamps}${run.spyglassLegs.length ? ' 🔭' : ''}`;
    try {
      if (navigator.share) await navigator.share({ text, url: shareUrl });
      else {
        await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
        setCopied(true);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <main className={styles.screen}>
      <AtlasMap
        insets={insets}
        homeFocus={run.camp as [number, number]}
        ref={engine}
        locale={locale}
        className={styles.map}
        data={geo!}
        centerLon={centerLon}
        camps={camps}
        route={route}
        meridianLon={exp.meridianLon}
        marks={marks}
      />
      <section
        className={styles.summary}
        data-map-chrome
        data-inset="panel"
        aria-labelledby="summary-title"
      >
        <p className={styles.overline}>
          {exp.title?.[locale] ?? exp.code} · {exp.code}
        </p>
        <h1 id="summary-title" className={styles.summaryTitle}>
          {t(run.status === 'abandoned' ? 'abandoned' : 'completed')}
        </h1>
        <p className={styles.bigDistance}>
          <span aria-label={formatNumber(locale, score.distanceKm)}>
            {digitGroups(score.distanceKm).map((g, i) => (
              <span key={i} className={styles.digitGroup} aria-hidden="true">
                {g}
              </span>
            ))}
          </span>
          <span className={styles.bigUnit}> km</span>
        </p>
        <p className={styles.renown}>
          {t('renown')} <strong>{formatNumber(locale, score.renown)}</strong>
          {score.meridian > 0 && ` · ${t('meridianCrossed')}`}
        </p>
        <ol className={styles.stampRow}>
          {exp.legs.map((leg, i) => {
            const l = run.legs[i];
            return (
              <li key={leg.index} title={l ? nameOf(l.pick.iso3) : t('notPlayed')}>
                {l?.valid && l.rarity ? (
                  <Stamp
                    tier={l.rarity.tier}
                    code={l.pick.iso3}
                    size={48}
                    rotationDeg={((i * 37) % 17) - 8}
                  />
                ) : (
                  <span className={styles.emptyStamp}>{l ? '✕' : '·'}</span>
                )}
              </li>
            );
          })}
        </ol>
        <MissionList missions={exp.missions} results={run.missions} />
        {run.attempt === 'replay' && <p className={styles.small}>{t('replayNote')}</p>}
        {friend && (
          <table className={styles.compare}>
            <thead>
              <tr>
                <th />
                <th>{t('you')}</th>
                <th>{t('friend')}</th>
              </tr>
            </thead>
            <tbody>
              {exp.legs.map((leg, i) => {
                const a = run.legs[i];
                const b = friend.legs[i];
                const cell = (l: typeof a) =>
                  l
                    ? l.valid
                      ? `${nameOf(l.pick.iso3)} · ${formatNumber(locale, l.distanceKm)}`
                      : `${nameOf(l.pick.iso3)} ✕`
                    : '—';
                return (
                  <tr key={leg.index}>
                    <td>{leg.index}</td>
                    <td>{cell(a)}</td>
                    <td>{cell(b)}</td>
                  </tr>
                );
              })}
              <tr>
                <td />
                <td>
                  <strong>{formatNumber(locale, score.renown)}</strong>
                </td>
                <td>
                  <strong>{formatNumber(locale, friend.score?.renown ?? 0)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={share}>
            {t('share')}
          </button>
          <button type="button" className={styles.ghostButton} onClick={onReplay}>
            {t('replay')}
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => navigate('/passeport')}
          >
            {t('passport')}
          </button>
          <button type="button" className={styles.ghostButton} onClick={() => navigate('/')}>
            {t('home')}
          </button>
        </div>
        {copied && <p className={styles.small}>{t('copied')}</p>}
      </section>
    </main>
  );
}
