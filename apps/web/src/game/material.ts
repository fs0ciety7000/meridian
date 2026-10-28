import { useSyncExternalStore } from 'react';

/**
 * "Matière allégée" (design-system §10, development-plan 3.7): no paper grain nor textures.
 * Chosen by the player, or switched on automatically when gestures run below 45 fps.
 */
export type Material = 'full' | 'light';
const KEY = 'meridian.material';
const listeners = new Set<() => void>();

function read(): Material {
  try {
    return localStorage.getItem(KEY)?.startsWith('light') ? 'light' : 'full';
  } catch {
    return 'full';
  }
}

export function applyMaterial(m: Material = read()) {
  document.documentElement.dataset.material = m;
}

export function setMaterial(m: Material, auto = false) {
  try {
    localStorage.setItem(KEY, m === 'light' && auto ? 'light-auto' : m);
  } catch {
    /* storage unavailable */
  }
  applyMaterial(m);
  listeners.forEach((l) => l());
}

/** Called by the map when the device struggles; never overrides an explicit choice. */
export function reportSlowDevice() {
  try {
    if (localStorage.getItem(KEY) === 'full') return;
  } catch {
    /* storage unavailable */
  }
  setMaterial('light', true);
}

export function useMaterial(): Material {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, read);
}
