import type { RunState } from '@meridian/engine';
import type { ReactNode } from 'react';
import { formatNumber, useLocale, useT } from '../../game/i18n';
import { Stamp } from '../Stamp';
import styles from './game.module.css';

/** Route log: n°, prompt, country, km, stamp (design-system §6.7). */
export function LegLog({
  run,
  nameOf,
  open,
  onToggle,
  ghost,
  children,
}: {
  run: RunState;
  nameOf: (iso3: string) => string;
  open: boolean;
  onToggle: () => void;
  ghost?: { valid: boolean; km: number; iso3: string }[] | undefined;
  /** Mission orders and run actions: on mobile, everything beyond the 3 instruments lives here. */
  children?: ReactNode;
}) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  return (
    <aside className={`${styles.legLog} ${open ? styles.legLogOpen : ''}`} data-map-chrome>
      <button type="button" className={styles.legLogTab} onClick={onToggle} aria-expanded={open}>
        {t('log')}
      </button>
      {open && (
        <div className={styles.legPanel}>
          <ol className={styles.legList}>
            {run.expedition.legs.map((leg, i) => {
              const r = run.legs[i];
              const g = ghost?.[i];
              const def = r?.usedFallback && leg.fallback ? leg.fallback : leg;
              return (
                <li key={leg.index} className={styles.legRow}>
                  <span className={styles.legNo}>{leg.index}</span>
                  <span className={styles.legText}>
                    <span className={styles.legPrompt}>
                      {r || i < run.currentLeg ? def.text[locale] : '…'}
                    </span>
                    <span className={styles.legResult}>
                      {r
                        ? `${nameOf(r.pick.iso3)} · ${r.valid ? `${formatNumber(locale, r.distanceKm)} km` : t('falseTrailShort')}`
                        : t('notPlayed')}
                      {r &&
                        g &&
                        ` — ${t('friend')} : ${nameOf(g.iso3)} ${g.valid ? `${formatNumber(locale, g.km)} km` : '✕'}`}
                    </span>
                  </span>
                  {r?.rarity && <Stamp tier={r.rarity.tier} code={r.pick.iso3} size={34} />}
                </li>
              );
            })}
          </ol>
          {children}
        </div>
      )}
    </aside>
  );
}
