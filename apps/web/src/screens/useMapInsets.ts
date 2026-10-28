import { useEffect, useState } from 'react';
import type { Insets } from '../map/AtlasMapEngine';

/**
 * fitInsets (design-system §7, phase 1 review): camera framing keeps targets out from under
 * the chrome. Measured from the live chrome elements, so it follows the real layout.
 */
export function useMapInsets(deps: unknown[]): Insets {
  const [insets, setInsets] = useState<Insets>({ top: 0, right: 0, bottom: 0, left: 0 });
  useEffect(() => {
    const measure = () => {
      const h = window.innerHeight;
      const w = window.innerWidth;
      // Wrappers are zero-height boxes around absolutely positioned chrome: measure the
      // union of their visible children, not the wrapper itself.
      const rect = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return undefined;
        const boxes = [el, ...el.querySelectorAll<HTMLElement>(':scope > *')]
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0);
        if (!boxes.length) return undefined;
        return {
          top: Math.min(...boxes.map((r) => r.top)),
          bottom: Math.max(...boxes.map((r) => r.bottom)),
          left: Math.min(...boxes.map((r) => r.left)),
          right: Math.max(...boxes.map((r) => r.right)),
        };
      };
      const top = rect('[data-inset="top"]');
      const bottom = rect('[data-inset="bottom"]');
      const left = w >= 900 ? rect('[data-inset="left"]') : undefined;
      // A panel is a bottom sheet on phones and a left column on wide screens.
      const panel = rect('[data-inset="panel"]');
      const next = {
        top: top ? Math.round(top.bottom + 8) : 0,
        bottom: bottom ? Math.round(h - bottom.top + 8) : 0,
        left: left ? Math.round(left.right + 8) : 0,
        right: 0,
      };
      if (panel) {
        if (w >= 900) next.left = Math.round(panel.right + 8);
        else next.bottom = Math.round(h - panel.top);
      }
      setInsets((p) =>
        p.top === next.top && p.bottom === next.bottom && p.left === next.left ? p : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    document.querySelectorAll('[data-inset], [data-inset] > *').forEach((el) => ro.observe(el));
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return insets;
}
