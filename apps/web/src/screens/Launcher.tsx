import type { Difficulty } from '@meridian/content-schema';
import { decodeCode, normaliseCode } from '@meridian/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DIFFICULTIES } from '../game/content';
import { formatNumber, useLocale, useT } from '../game/i18n';
import { atlasMarks, lifetimeKm } from '../game/progress';
import { navigate } from '../game/router';
import { useGame } from '../game/store';
import { reportSlowDevice, setMaterial, useMaterial } from '../game/material';
import { AtlasMap } from '../map/AtlasMap';
import type { AtlasMapEngine } from '../map/AtlasMapEngine';
import styles from './screens.module.css';
import { useMapInsets } from './useMapInsets';

/**
 * Home = the personal atlas, with the launcher as a cartouche in the margin
 * (design-system §6.15): new expedition, logbook, code, runs in progress.
 */
export function Launcher() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const { geo, content, runs, newCode } = useGame();
  const material = useMaterial();
  const engine = useRef<AtlasMapEngine | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [view, setView] = useState<'home' | 'catalog'>('home');

  useEffect(() => {
    window.__meridian = { engine: engine.current };
  });

  const homeInsets = useMapInsets([view]);
  const marks = useMemo(() => atlasMarks(runs, content!.deps.entities), [runs, content]);
  const inProgress = runs
    .filter((r) => r.status === 'in_progress')
    .slice(-5)
    .reverse();
  const codeOk = code.trim() ? decodeCode(code) !== null : null;
  const best = (n: string) => {
    const tiers = runs
      .filter((r) => r.expedition.code === n && r.status === 'completed')
      .flatMap((r) => r.legs.map((l) => l.rarity?.tier))
      .filter(Boolean);
    return tiers.length ? `✓ ${tiers.length}` : t('notPlayed');
  };

  const start = () => {
    const c = newCode(difficulty);
    if (c) navigate(`/x/${c}`);
  };

  return (
    <main className={styles.screen}>
      <AtlasMap
        onSlow={reportSlowDevice}
        locale={locale}
        ref={engine}
        className={styles.map}
        data={geo!}
        marks={marks}
        atlas
        homeInsets={homeInsets}
      />
      <section
        className={styles.launcher}
        data-map-chrome
        data-inset="panel"
        aria-labelledby="launcher-title"
      >
        <p className={styles.overline}>{t('tagline')}</p>
        <h1 id="launcher-title" className={styles.launcherTitle}>
          {t('appName')}
        </h1>

        {view === 'home' ? (
          <>
            <div className={styles.difficulty} role="radiogroup" aria-label={t('newExpedition')}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === d}
                  className={`${styles.notch} ${difficulty === d ? styles.notchOn : ''}`}
                  onClick={() => setDifficulty(d)}
                >
                  {t(d)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.primary}
              onClick={start}
              disabled={!content?.latestLibrary}
            >
              {t('newExpedition')}
            </button>

            <div className={styles.linkRow}>
              <button type="button" className={styles.link} onClick={() => setView('catalog')}>
                {t('catalog')}
              </button>
              <button
                type="button"
                className={styles.link}
                aria-expanded={showCode}
                onClick={() => setShowCode((v) => !v)}
              >
                {t('haveCode')}
              </button>
            </div>

            {showCode && (
              <form
                className={styles.codeForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  const c = normaliseCode(code);
                  if (c) navigate(`/x/${c}`);
                }}
              >
                <label className={styles.srOnly} htmlFor="code">
                  {t('haveCode')}
                </label>
                <div className={styles.codeRow}>
                  <input
                    id="code"
                    className={styles.codeInput}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="MER-XXXX"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={codeOk === false}
                    aria-describedby="code-help"
                  />
                  <button type="submit" className={styles.ghostButton} disabled={!codeOk}>
                    {t('go')}
                  </button>
                </div>
                <p id="code-help" className={styles.small} aria-live="polite">
                  {codeOk === false ? t('codeInvalid') : ''}
                </p>
              </form>
            )}

            {inProgress.length > 0 && (
              <section>
                <p className={styles.overline}>{t('inProgress')}</p>
                <ul className={styles.runList}>
                  {inProgress.map((r) => (
                    <li key={r.runId}>
                      <button
                        type="button"
                        className={styles.runButton}
                        onClick={() => navigate(`/x/${r.expedition.code}`)}
                      >
                        <span className={styles.mono}>{r.expedition.code}</span>
                        <span>{t('legOf', { n: r.currentLeg }).split('·')[0]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className={styles.small}>
              {formatNumber(locale, lifetimeKm(runs))} km ·{' '}
              <button
                type="button"
                className={styles.inlineLink}
                onClick={() => navigate('/passeport')}
              >
                {t('passport')}
              </button>{' '}
              ·{' '}
              <button
                type="button"
                className={styles.inlineLink}
                onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
              >
                {t('language')}
              </button>{' '}
              ·{' '}
              <button
                type="button"
                className={styles.inlineLink}
                onClick={() => {
                  const root = document.documentElement;
                  const dark = root.dataset.theme
                    ? root.dataset.theme === 'nocturne'
                    : window.matchMedia('(prefers-color-scheme: dark)').matches;
                  root.dataset.theme = dark ? 'atlas' : 'nocturne';
                  try {
                    localStorage.setItem('meridian.theme', root.dataset.theme);
                  } catch {
                    /* storage unavailable */
                  }
                }}
              >
                {t('theme')}
              </button>{' '}
              ·{' '}
              <button
                type="button"
                className={styles.inlineLink}
                onClick={() => setMaterial(material === 'light' ? 'full' : 'light')}
              >
                {t(material === 'light' ? 'fullMaterial' : 'lightMaterial')}
              </button>
            </p>
          </>
        ) : (
          <>
            <button type="button" className={styles.link} onClick={() => setView('home')}>
              ← {t('home')}
            </button>
            <p className={styles.overline}>{t('catalog')}</p>
            {content!.catalog.length === 0 ? (
              <p className={styles.small}>{t('catalogEmpty')}</p>
            ) : (
              <ol className={styles.catalog}>
                {content!.catalog.map((e) => (
                  <li key={e.code}>
                    <button
                      type="button"
                      className={styles.catalogEntry}
                      onClick={() => navigate(`/x/${e.code}`)}
                    >
                      <span className={styles.mono}>
                        {String(e.catalogNumber).padStart(4, '0')}
                      </span>
                      <span className={styles.catalogTitle}>{e.title?.[locale]}</span>
                      <span className={styles.catalogMeta}>
                        {e.theme ? `${e.theme} · ` : ''}
                        {t(e.difficulty)} · {best(e.code)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </main>
  );
}
