import { useEffect } from 'react';
import { useLocale, useT } from '../game/i18n';
import { useLocation } from '../game/router';
import { useGame } from '../game/store';
import { MapLab } from '../lab/MapLab';
import { Specimen } from '../lab/Specimen';
import { ExpeditionScreen } from '../screens/ExpeditionScreen';
import { Launcher } from '../screens/Launcher';
import { PassportScreen } from '../screens/PassportScreen';
import styles from '../screens/screens.module.css';

export function App() {
  const { path, params } = useLocation();
  if (path === '/lab/specimen') return <Specimen />;
  if (path === '/lab/map') return <MapLab />;
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
