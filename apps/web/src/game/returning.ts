/**
 * Whether this browser has played before, readable synchronously before the first render: the
 * launcher must show its final actions at once, not reshuffle when saved runs arrive (AD B4).
 */
const KEY = 'meridian.returning';

export function isReturning(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markReturning() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable */
  }
}
