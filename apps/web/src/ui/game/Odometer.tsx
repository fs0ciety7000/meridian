import { formatNumber, useLocale } from '../../game/i18n';
import styles from './game.module.css';

/** Brass odometer (design-system §6.5); `gain` floats above while a leg is traced. */
export function Odometer({ km, gain, label }: { km: number; gain?: number | null; label: string }) {
  const locale = useLocale((s) => s.locale);
  return (
    <section className={styles.odometer} aria-label={label} data-map-chrome>
      {gain ? <span className={styles.gain}>+ {formatNumber(locale, gain)}</span> : null}
      <span className={styles.odometerValue}>{formatNumber(locale, km)}</span>
      <span className={styles.unit}> km</span>
    </section>
  );
}
