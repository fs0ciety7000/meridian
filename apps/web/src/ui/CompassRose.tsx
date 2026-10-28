import styles from './MapInstruments.module.css';

const RAYS = Array.from({ length: 16 }, (_, i) => i * 22.5);

/** 16-point rose; indicates north and resets the view (design-system §5.5). */
export function CompassRose({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      className={styles.compass}
      onClick={onReset}
      aria-label="Recentrer la carte sur le monde"
    >
      <svg viewBox="-24 -24 48 48" width="48" height="48" aria-hidden="true">
        <circle r="21" className={styles.compassRing} />
        {RAYS.map((a) => {
          const major = a % 90 === 0;
          const mid = a % 45 === 0;
          const len = major ? 19 : mid ? 13 : 9;
          return (
            <path
              key={a}
              d={`M0,${-len} L${major ? 2.6 : 1.6},0 L0,${len / 6} L${major ? -2.6 : -1.6},0 Z`}
              transform={`rotate(${a})`}
              className={major && a === 0 ? styles.compassNorth : styles.compassRay}
            />
          );
        })}
        <text y="-15.5" className={styles.compassN} textAnchor="middle">
          N
        </text>
      </svg>
    </button>
  );
}
