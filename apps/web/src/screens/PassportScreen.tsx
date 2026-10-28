import { TIERS } from '@meridian/engine';
import { useMemo } from 'react';
import { useLocale, useT } from '../game/i18n';
import { passport } from '../game/progress';
import { navigate } from '../game/router';
import { useGame } from '../game/store';
import { countryNames } from '../ui/countryNames';
import { Stamp } from '../ui/Stamp';
import styles from './screens.module.css';

const TIER_KEY = {
  known: 'tierKnown',
  trail: 'tierTrail',
  frontier: 'tierFrontier',
  incognita: 'tierIncognita',
} as const;

/** Passport (design-system §6.9): one page per state, four slots (one per tier). */
export function PassportScreen() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { runs, content } = useGame();
  const pages = useMemo(() => passport(runs), [runs]);
  const names = useMemo(
    () => countryNames(content!.deps.entities.values(), locale),
    [content, locale],
  );
  const visited = names.filter((n) => pages.has(n.iso3));

  return (
    <main className={`${styles.passport} paper`}>
      <header className={styles.passportHead}>
        <button type="button" className={styles.link} onClick={() => navigate('/')}>
          ← {t('atlas')}
        </button>
        <h1 className={styles.launcherTitle}>{t('passport')}</h1>
        <p className={styles.small}>
          {t('countriesStamped', { n: visited.length, total: names.length })}
        </p>
      </header>
      {visited.length === 0 ? (
        <p className={styles.small}>{t('noStamp')}</p>
      ) : (
        <ol className={styles.pages}>
          {visited.map((n) => {
            const page = pages.get(n.iso3)!;
            return (
              <li key={n.iso3} className={styles.page}>
                <h2 className={styles.pageTitle}>{n.name}</h2>
                <div className={styles.slots}>
                  {TIERS.map((tier, i) => {
                    const fresh = page.fresh.some((f) => f.tier === tier);
                    const filled = page.slots.has(tier);
                    return (
                      <div key={tier} className={styles.slot}>
                        {filled || fresh ? (
                          <Stamp
                            tier={tier}
                            code={n.iso3}
                            size={56}
                            rotationDeg={((i * 41 + n.iso3.charCodeAt(0)) % 15) - 7}
                            caption={filled ? undefined : t('freshInk')}
                            className={filled ? undefined : styles.freshStamp}
                          />
                        ) : (
                          <span className={styles.slotEmpty} aria-hidden="true" />
                        )}
                        <span className={styles.slotLabel}>{t(TIER_KEY[tier])}</span>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
