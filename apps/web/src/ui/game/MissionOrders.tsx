import type { MissionDef } from '@meridian/content-schema';
import type { MissionResult } from '@meridian/engine';
import { useState } from 'react';
import { formatNumber, useLocale, useT, type StringKey } from '../../game/i18n';
import styles from './game.module.css';

export function useMissionText() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  return (m: MissionDef) =>
    t(
      `mission_${m.id}` as StringKey,
      Object.fromEntries(
        Object.entries(m.params ?? {}).map(([k, v]) => [k, formatNumber(locale, v)]),
      ),
    );
}

/** Sealed envelope with 1–3 orders (design-system §6.13). */
export function MissionOrders({
  missions,
  results,
}: {
  missions: MissionDef[];
  results?: MissionResult[];
}) {
  const t = useT();
  const text = useMissionText();
  const [open, setOpen] = useState(false);
  if (!missions.length) return null;
  return (
    <div className={styles.missions} data-map-chrome>
      <button
        type="button"
        className={styles.envelope}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('missions')}
        title={t('missions')}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M3 6h18v12H3zM3 6l9 7 9-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="13" r="2.6" fill="var(--color-meridian-500)" />
        </svg>
      </button>
      {open && (
        <ul className={styles.missionList}>
          {missions.map((m, i) => (
            <li key={m.id}>
              <span aria-hidden="true">{results?.[i]?.done ? '☑' : '☐'}</span> {text(m)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Plain list of orders (inside the route log). */
export function MissionList({
  missions,
  results,
}: {
  missions: MissionDef[];
  results?: MissionResult[];
}) {
  const t = useT();
  const text = useMissionText();
  if (!missions.length) return null;
  return (
    <section className={styles.missionInline}>
      <p className={styles.overline}>{t('missions')}</p>
      <ul>
        {missions.map((m, i) => (
          <li key={m.id}>
            <span aria-hidden="true">{results?.[i]?.done ? '☑' : '☐'}</span> {text(m)}
          </li>
        ))}
      </ul>
    </section>
  );
}
