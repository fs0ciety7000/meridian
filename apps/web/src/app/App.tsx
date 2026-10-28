import { lazy, Suspense, useEffect } from 'react';
import { useLocale, useT } from '../game/i18n';
import { useLocation } from '../game/router';
import { useGame } from '../game/store';
import { Launcher } from '../screens/Launcher';
import styles from '../screens/screens.module.css';

// Development pages: loaded on demand, never in the game bundle.
const MapLab = lazy(() => import('../lab/MapLab').then((m) => ({ default: m.MapLab })));
// Screens beyond the launcher load on demand: the first paint only needs the atlas.
const ExpeditionScreen = lazy(() =>
  import('../screens/ExpeditionScreen').then((m) => ({ default: m.ExpeditionScreen })),
);
const PassportScreen = lazy(() =>
  import('../screens/PassportScreen').then((m) => ({ default: m.PassportScreen })),
);
const AboutScreen = lazy(() =>
  import('../screens/AboutScreen').then((m) => ({ default: m.AboutScreen })),
);
const Specimen = lazy(() => import('../lab/Specimen').then((m) => ({ default: m.Specimen })));

export function App() {
  const { path, params } = useLocation();
  if (path === '/lab/specimen' || path === '/lab/map')
    return (
      <Suspense fallback={<div className={`${styles.loading} paper`} aria-busy="true" />}>
        {path === '/lab/map' ? <MapLab /> : <Specimen />}
      </Suspense>
    );
  return <Game path={path} share={params.get('r')} />;
}

function Game({ path, share }: { path: string; share: string | null }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { status, error, init } = useGame();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    void init();
  }, [init]);

  if (status === 'error')
    return <p className={styles.message}>{t('loadError', { e: error ?? '' })}</p>;
  // The launcher paints at once (title, actions) and fills in as data arrives.
  if (path === '/') return <Launcher />;
  if (status !== 'ready')
    return (
      <div className={`${styles.loading} paper`} aria-busy="true">
        <span className={styles.srOnly}>{t('loading')}</span>
      </div>
    );

  const x = /^\/x\/([^/]+)$/.exec(path);
  const fallback = <div className={`${styles.loading} paper`} aria-busy="true" />;
  if (x)
    return (
      <Suspense fallback={fallback}>
        <ExpeditionScreen key={x[1]} rawCode={decodeURIComponent(x[1]!)} share={share} />
      </Suspense>
    );
  if (path === '/passeport' || path === '/passport')
    return (
      <Suspense fallback={fallback}>
        <PassportScreen />
      </Suspense>
    );
  if (path === '/a-propos' || path === '/about')
    return (
      <Suspense fallback={fallback}>
        <AboutScreen />
      </Suspense>
    );
  return <Launcher />;
}
