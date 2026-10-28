import { formatKm, niceScale } from '../map/scale';
import styles from './MapInstruments.module.css';

/** Graphic scale, updated with the zoom (design-system §5.5): functional, not decorative. */
export function ScaleBar({ kmPerPx }: { kmPerPx: number }) {
  if (!kmPerPx || !Number.isFinite(kmPerPx)) return null;
  const { km, px } = niceScale(kmPerPx);
  const half = px / 2;
  return (
    <div className={styles.scale} aria-label={`Échelle : ${formatKm(km)}`} role="img">
      <svg width={px + 2} height="8" aria-hidden="true">
        <rect x="1" y="1" width={half} height="5" className={styles.scaleDark} />
        <rect x={1 + half} y="1" width={half} height="5" className={styles.scaleLight} />
      </svg>
      <span className={styles.scaleLabel}>{formatKm(km)}</span>
    </div>
  );
}
