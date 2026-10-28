import type { ReactNode } from 'react';
import styles from './game.module.css';

export interface CampBarProps {
  title: string | null;
  detail: string | null;
  /** Potential distance from the previous camp (kept on one line on phones). */
  gain?: string | null;
  placeholder: string;
  note: string | null;
  canPlant: boolean;
  plantLabel: string;
  onPlant: () => void;
  /** Extra instruments in the bar: odometer on mobile, spyglass, search. */
  children?: ReactNode;
}

/** Camp bar with the wax seal (design-system §6.2), anchored in the thumb zone on mobile. */
export function CampBar(p: CampBarProps) {
  return (
    <section className={styles.campBar} aria-live="polite" data-map-chrome>
      <div className={styles.campInfo}>
        {p.title ? (
          <>
            <p className={styles.country}>{p.title}</p>
            {(p.detail || p.gain) && (
              <p className={styles.coord}>
                {p.detail && <span className={styles.coordText}>{p.detail}</span>}
                {p.detail && p.gain && <span className={styles.coordText}> · </span>}
                {p.gain}
              </p>
            )}
          </>
        ) : (
          <p className={styles.placeholder}>{p.placeholder}</p>
        )}
        {p.note && <p className={styles.note}>{p.note}</p>}
      </div>
      {p.children}
      <button
        type="button"
        className={styles.seal}
        onClick={p.onPlant}
        disabled={!p.canPlant}
        aria-label={p.plantLabel}
        title={p.plantLabel}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path
            d="M12 3 2 20h20L12 3Zm0 8.5L8.6 20h6.8L12 11.5Z"
            fill="currentColor"
            fillRule="evenodd"
          />
        </svg>
      </button>
    </section>
  );
}
