const NICE = [1, 2, 5];

/**
 * Picks a round scale-bar length (1, 2 or 5 × 10ⁿ km) whose on-screen width is at most
 * `maxPx`, given the current ground resolution (design-system §5.5).
 */
export function niceScale(kmPerPx: number, maxPx = 120): { km: number; px: number } {
  const maxKm = kmPerPx * maxPx;
  const exp = Math.floor(Math.log10(maxKm));
  let km = Math.pow(10, exp);
  for (const n of NICE) {
    const candidate = n * Math.pow(10, exp);
    if (candidate <= maxKm) km = candidate;
  }
  return { km, px: km / kmPerPx };
}

export function formatKm(km: number, locale = 'fr'): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: km < 1 ? 2 : 0 }).format(km)} km`;
}
