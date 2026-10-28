import { lazy, Suspense, useEffect } from 'react';
import { useLocale, useT } from '../game/i18n';
import { useLocation } from '../game/router';
import { useGame } from '../game/store';
import { ExpeditionScreen } from '../screens/ExpeditionScreen';
import { Launcher } from '../screens/Launcher';
import { PassportScreen } from '../screens/PassportScreen';
import styles from '../screens/screens.module.css';

// Development pages: loaded on demand, never in the game bundle.
const MapLab = lazy(() => import('../lab/MapLab').then((m) => ({ default: m.MapLab })));
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
  if (status !== 'ready')
    return (
      <div className={`${styles.loading} paper`} aria-busy="true">
        <span className={styles.srOnly}>{t('loading')}</span>
      </div>
    );

  const x = /^\/x\/([^/]+)$/.exec(path);
  if (x) return <ExpeditionScreen key={x[1]} rawCode={decodeURIComponent(x[1]!)} share={share} />;
  if (path === '/passeport' || path === '/passport') return <PassportScreen />;
  return <Launcher />;
}
