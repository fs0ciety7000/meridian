// The specimen shows every Fraunces axis (SOFT, WONK): the full font, for this page only.
import '@fontsource-variable/fraunces/full.css';
import { tokens, type ColorToken, type ThemeName } from '@meridian/design-tokens';
import { useEffect, useState } from 'react';
import { Stamp, TIER_LABEL, type RarityTier } from '../ui/Stamp';
import styles from './Specimen.module.css';

const TIERS: RarityTier[] = ['known', 'trail', 'frontier', 'incognita'];
const ROTATIONS = [-4, 3, -2, 5];

const SWATCH_GROUPS: { title: string; tokens: ColorToken[] }[] = [
  { title: 'Papier & terres', tokens: ['paper-100', 'paper-200', 'paper-300', 'paper-400'] },
  { title: 'Mer', tokens: ['sea-100', 'sea-200', 'sea-300'] },
  { title: 'Encres', tokens: ['ink-900', 'ink-700', 'ink-500', 'sepia-600'] },
  { title: 'Sens réservés', tokens: ['vermilion-600', 'vermilion-700', 'meridian-500'] },
  {
    title: 'Rareté',
    tokens: ['rarity-known', 'rarity-trail', 'rarity-frontier', 'rarity-incognita'],
  },
];

/**
 * Phase 0 specimen sheet: lets the Art Director review tokens, type, materials and stamps
 * in both themes before the map exists (development-plan 0.3 / 0.6).
 */
export function Specimen() {
  const [theme, setTheme] = useState<ThemeName>('atlas');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <main className={`${styles.sheet} paper`}>
      <header className={styles.cartouche}>
        <p className={styles.overline}>Planche d'épreuve · Phase 0</p>
        <h1 className={styles.display}>Meridian</h1>
        <p className={styles.lede}>Atlas d'expédition — matières, encres et lettrage</p>
        <div className={styles.themeSwitch} role="radiogroup" aria-label="Thème">
          {(Object.keys(tokens.themes) as ThemeName[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              className={styles.themeOption}
              onClick={() => setTheme(t)}
            >
              {t === 'atlas' ? 'Atlas' : 'Nocturne'}
            </button>
          ))}
        </div>
      </header>

      <section className={styles.section} aria-labelledby="palette">
        <h2 id="palette" className={styles.sectionTitle}>
          Palette
        </h2>
        {SWATCH_GROUPS.map((group) => (
          <div key={group.title} className={styles.swatchGroup}>
            <h3 className={styles.overline}>{group.title}</h3>
            <ul className={styles.swatches}>
              {group.tokens.map((name) => (
                <li key={name} className={styles.swatch}>
                  <span className={styles.chip} style={{ background: `var(--color-${name})` }} />
                  <code className={styles.coord}>{name}</code>
                  <code className={styles.coord}>{tokens.themes[theme][name]}</code>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className={styles.section} aria-labelledby="type">
        <h2 id="type" className={styles.sectionTitle}>
          Lettrage
        </h2>
        <p className={styles.overline}>Étape 3 / 6 · Consigne</p>
        <p className={styles.cartoucheText}>Un pays où le soleil de midi passe au nord</p>
        <p className={styles.mapLabels}>
          <span className={styles.countryLabel}>Mongolie</span>
          <span className={styles.waterLabel}>Océan Pacifique</span>
          <span className={styles.countryLabel}>Nouvelle-Zélande</span>
        </p>
        <p className={styles.odometer}>
          31 480<span className={styles.unit}> km</span>
        </p>
        <p className={styles.coord}>47,92° N · 106,91° E — échelle 1:40 000 000</p>
        <p className={styles.body}>
          Instrument Sans porte l'interface : réglages, aides, boutons. Sobre, très lisible en
          petite taille, elle laisse les serifs parler pour la carte.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="stamps">
        <h2 id="stamps" className={styles.sectionTitle}>
          Tampons de rareté
        </h2>
        <ul className={styles.stamps}>
          {TIERS.map((tier, i) => (
            <li key={tier} className={styles.stampItem}>
              <Stamp tier={tier} code="MNG" caption="28·X·2026" rotationDeg={ROTATIONS[i] ?? 0} />
              <span className={styles.stampLabel}>{TIER_LABEL[tier].fr}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="instruments">
        <h2 id="instruments" className={styles.sectionTitle}>
          Instruments
        </h2>
        <div className={styles.instruments}>
          <button type="button" className={styles.seal}>
            <span className="visually-hidden">Planter le camp</span>
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <path
                d="M12 3 2 20h20L12 3Zm0 8.5L8.6 20h6.8L12 11.5Z"
                fill="currentColor"
                fillRule="evenodd"
              />
            </svg>
          </button>
          <span className={styles.sealCaption}>Planter le camp</span>
          <p className={styles.marginNote}>
            Fausse piste&#8239;: le Népal n'a pas de littoral… mais il est bien enclavé&#8239;!
          </p>
        </div>
      </section>
    </main>
  );
}
