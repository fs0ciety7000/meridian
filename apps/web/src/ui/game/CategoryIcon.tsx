import type { PromptCategory } from '@meridian/content-schema';

/** Engraved category pictograms for the prompt cartouche (design-system §6.1). */
const PATHS: Record<PromptCategory, string> = {
  relief: 'M2 19 9 7l4 6 3-4 6 10H2Z',
  water: 'M2 9c3-3 5 3 8 0s5 3 8 0 4 1 4 1M2 15c3-3 5 3 8 0s5 3 8 0 4 1 4 1',
  borders: 'M3 4v16M3 6h7l-1 3 1 3H3M14 4l7 3-7 3m0-6v16',
  climate:
    'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  society: 'M4 21V10l8-6 8 6v11M9 21v-6h6v6',
  flag: 'M5 21V3m0 1h12l-2 4 2 4H5',
  position: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0v18M3 12h18M5 7.5h14M5 16.5h14',
};

export function CategoryIcon({ category, size = 22 }: { category: PromptCategory; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d={PATHS[category]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
