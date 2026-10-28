import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

/** Minimal history router: a handful of routes do not justify a dependency. */
export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  listeners.forEach((l) => l());
}

export function useLocation() {
  const href = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => location.pathname + location.search,
  );
  const url = new URL(href, location.origin);
  return { path: url.pathname.replace(/\/+$/, '') || '/', params: url.searchParams };
}
