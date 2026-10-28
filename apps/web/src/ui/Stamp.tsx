import type { SVGProps } from 'react';

export type RarityTier = 'known' | 'trail' | 'frontier' | 'incognita';

export const TIER_LABEL: Record<RarityTier, { fr: string; en: string }> = {
  known: { fr: 'Route connue', en: 'Known route' },
  trail: { fr: 'Sentier', en: 'Trail' },
  frontier: { fr: 'Confins', en: 'Frontier' },
  incognita: { fr: 'Terra incognita', en: 'Terra incognita' },
};

/** 16-point rosette for Terra incognita (design-system §2.1). */
function rosette(cx: number, cy: number, outer: number, inner: number, points = 16): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

function octagon(cx: number, cy: number, r: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI * (2 * i + 1)) / 8;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

const STAR = '50,38 53,47 62,47 55,52 58,61 50,55.5 42,61 45,52 38,47 47,47';

interface StampProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  tier: RarityTier;
  code: string;
  caption?: string;
  rotationDeg?: number;
  size?: number;
}

/**
 * Passport stamp: ink colour + shape + label, never colour alone (design-system §6.8, §10).
 */
export function Stamp({ tier, code, caption, rotationDeg = 0, size = 96, ...rest }: StampProps) {
  const ink = `var(--color-rarity-${tier})`;
  const common = { fill: 'none', stroke: ink, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${TIER_LABEL[tier].fr} — ${code}`}
      style={{ transform: `rotate(${rotationDeg}deg)` }}
      {...rest}
    >
      {tier === 'known' && <circle cx="50" cy="50" r="44" strokeWidth="2.5" {...common} />}
      {tier === 'trail' && (
        <polygon
          points="14,6 86,6 94,14 94,86 86,94 14,94 6,86 6,14"
          strokeWidth="2.5"
          {...common}
        />
      )}
      {tier === 'frontier' && (
        <>
          <polygon points={octagon(50, 50, 46)} strokeWidth="2.5" {...common} />
          <polygon points={octagon(50, 50, 40)} strokeWidth="1" {...common} />
        </>
      )}
      {tier === 'incognita' && (
        <>
          <polygon points={rosette(50, 50, 48, 42)} strokeWidth="2" {...common} />
          <circle cx="50" cy="50" r="36" strokeWidth="1" {...common} />
          <polygon points={STAR} fill="var(--color-meridian-500)" />
        </>
      )}
      <text
        x="50"
        y={tier === 'incognita' ? 34 : 47}
        textAnchor="middle"
        fill={ink}
        style={{
          font: '500 15px var(--font-map)',
          letterSpacing: '0.12em',
          fontVariantCaps: 'all-small-caps',
        }}
      >
        {code}
      </text>
      {caption && (
        <text
          x="50"
          y={tier === 'incognita' ? 75 : 64}
          textAnchor="middle"
          fill={ink}
          style={{ font: '400 8px var(--font-mono)', letterSpacing: '0.04em' }}
        >
          {caption}
        </text>
      )}
    </svg>
  );
}
