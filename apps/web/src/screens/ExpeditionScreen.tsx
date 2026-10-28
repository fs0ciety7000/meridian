import type { Expedition } from '@meridian/content-schema';
import { decodeShare, normaliseCode, type RunState } from '@meridian/engine';
import { useEffect, useMemo, useState } from 'react';
import { replayShared } from '../game/challenge';
import { formatNumber, useLocale, useT } from '../game/i18n';
import { navigate } from '../game/router';
import { AtlasMap } from '../map/AtlasMap';
import { useGame } from '../game/store';
import { PlayView } from './PlayView';
import styles from './screens.module.css';
import { SummaryView } from './SummaryView';

/**
 * /x/<code>[?r=<share>]: resumes the run in progress for this code, shows the last finished
 * one, or starts a new run — after the challenge card when the link carries a friend's route.
 */
export function ExpeditionScreen({ rawCode, share }: { rawCode: string; share: string | null }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { geo, content, runs, start, expedition: resolve } = useGame();
  const code = normaliseCode(rawCode);
  const [expedition, setExpedition] = useState<Expedition | null | undefined>(undefined);
  const [friend, setFriend] = useState<RunState | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    if (code !== rawCode) navigate(`/x/${code}${share ? `?r=${share}` : ''}`, true);
    let live = true;
    resolve(code).then((e) => live && setExpedition(e));
    return () => {
      live = false;
    };
  }, [code, rawCode, share, resolve]);

  // The friend's route comes from the link, or from the challenge run being resumed.
  const challengeFrom =
    share ??
    runs.find((r) => r.expedition.code === code && r.status === 'in_progress')?.challengeFrom;
  const shared = useMemo(() => {
    const s = challengeFrom ? decodeShare(challengeFrom) : null;
    return s && s.code === code ? s : null;
  }, [challengeFrom, code]);

  useEffect(() => {
    if (!shared || !expedition || !geo || !content) return;
    let live = true;
    replayShared(shared, expedition, geo, content.deps).then((r) => live && setFriend(r));
    return () => {
      live = false;
    };
  }, [shared, expedition, geo, content]);

  const forCode = runs.filter(
    (r) => r.expedition.code === code && r.expedition.hash === expedition?.hash,
  );
  const inProgress = forCode.find((r) => r.status === 'in_progress');
  const lastFinished = forCode.filter((r) => r.status !== 'in_progress').at(-1);
  const run =
    runs.find((r) => r.runId === runId) ?? inProgress ?? (share ? undefined : lastFinished);

  // Without a challenge to accept, a new code starts straight away.
  useEffect(() => {
    if (expedition && !run && !share && !runId) start(expedition);
  }, [expedition, run, share, runId, start]);

  if (!code)
    return (
      <main className={`${styles.message} paper`}>
        <p>{t('notFound')}</p>
        <button type="button" className={styles.link} onClick={() => navigate('/')}>
          {t('home')}
        </button>
      </main>
    );
  if (expedition === undefined)
    return <div className={`${styles.loading} paper`} aria-busy="true" />;
  if (!expedition)
    return (
      <main className={`${styles.message} paper`}>
        <p>{t('notFound')}</p>
        <button type="button" className={styles.link} onClick={() => navigate('/')}>
          {t('home')}
        </button>
      </main>
    );

  if (!run && share) {
    const km = friend?.score?.distanceKm ?? friend?.legs.reduce((s, l) => s + l.distanceKm, 0) ?? 0;
    return (
      <main className={styles.screen}>
        {/* The atlas behind the card: port and meridian only — the friend's route stays
            hidden until the player has played each leg (design-system §6.16). */}
        <AtlasMap
          className={styles.map}
          data={geo!}
          locale={locale}
          camps={[
            { id: 'port', lonLat: expedition.start.lonLat as [number, number], state: 'start' },
          ]}
          meridianLon={expedition.meridianLon}
          homeFocus={expedition.start.lonLat as [number, number]}
        />
        <div className={styles.challengeOverlay}>
          <section className={styles.challengeCard} data-map-chrome>
            <p className={styles.overline}>{expedition.title?.[locale] ?? expedition.code}</p>
            <h1 className={styles.challengeTitle}>
              {t('challengeFrom', { code: expedition.code, km: formatNumber(locale, km) })}
            </h1>
            <p className={styles.small}>
              {t('departure', { name: expedition.start.name[locale] })} ·{' '}
              {t('meridian', {
                lon: `${Math.abs(expedition.meridianLon)}° ${expedition.meridianLon < 0 ? (locale === 'fr' ? 'O' : 'W') : 'E'}`,
              })}
            </p>
            <button
              type="button"
              className={styles.primary}
              onClick={() => setRunId(start(expedition, share ?? undefined).runId)}
            >
              {t('acceptChallenge')}
            </button>
          </section>
        </div>
      </main>
    );
  }
  if (!run) return <div className={`${styles.loading} paper`} aria-busy="true" />;

  return run.status === 'in_progress' ? (
    <PlayView run={run} friend={friend} />
  ) : (
    <SummaryView run={run} friend={friend} onReplay={() => setRunId(start(expedition).runId)} />
  );
}
