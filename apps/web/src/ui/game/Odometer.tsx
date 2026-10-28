import { digitGroups, formatNumber, useLocale } from '../../game/i18n';
import screens from '../../screens/screens.module.css';
import styles from './game.module.css';

/** Brass odometer (design-system §6.5); `gain` floats above while a leg is traced. */
export function Odometer({ km, gain, label }: { km: number; gain?: number | null; label: string }) {
  const locale = useLocale((s) => s.locale);
  return (
    <section className={styles.odometer} aria-label={label} data-map-chrome>
      {gain ? <span className={styles.gain}>+ {formatNumber(locale, gain)}</span> : null}
      <span className={screens.srOnly}>{formatNumber(locale, km)} km</span>
      <span className={styles.odometerValue} aria-hidden="true">
        {digitGroups(km).map((g, i) => (
          <span key={i} className={screens.digitGroup}>
            {g}
          </span>
        ))}
      </span>
      <span className={styles.unit} aria-hidden="true">
        {' '}
        km
      </span>
    </section>
  );
}
