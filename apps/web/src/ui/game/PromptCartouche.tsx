import type { PromptCategory } from '@meridian/content-schema';
import type { RarityTier } from '@meridian/engine';
import { Stamp } from '../Stamp';
import { CategoryIcon } from './CategoryIcon';
import styles from './game.module.css';

export interface CartoucheProps {
  overline: string;
  text: string;
  category: PromptCategory;
  /** Folded to one line with the result of the leg (design-system §6.1 `resolved`). */
  resolved?: { tier: RarityTier | null; iso3: string; label: string; pending?: boolean } | null;
  onClick?: () => void;
  /** Small italic hint under a resolved leg ("tap to skip"). */
  hint?: string | null;
}

export function PromptCartouche({
  overline,
  text,
  category,
  resolved,
  onClick,
  hint,
}: CartoucheProps) {
  return (
    <header
      className={`${styles.cartouche} ${resolved ? styles.cartoucheResolved : ''}`}
      data-map-chrome
      onClick={onClick}
    >
      <div className={styles.cartoucheBody}>
        <p className={styles.overline}>{overline}</p>
        <h1 className={styles.prompt} aria-live="polite">
          {text}
        </h1>
        {resolved && <p className={styles.resolvedLabel}>{resolved.label}</p>}
        {hint && <p className={styles.cartoucheHint}>{hint}</p>}
      </div>
      <div className={styles.cartoucheSide}>
        {resolved?.pending ? (
          <CategoryIcon category={category} />
        ) : resolved?.tier ? (
          <Stamp
            tier={resolved.tier}
            code={resolved.iso3}
            size={52}
            rotationDeg={-8}
            className={styles.stampIn}
          />
        ) : resolved ? (
          <span className={styles.falseMark} aria-hidden="true">
            ✕
          </span>
        ) : (
          <CategoryIcon category={category} />
        )}
      </div>
    </header>
  );
}
