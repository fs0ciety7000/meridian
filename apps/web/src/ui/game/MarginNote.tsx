import { useEffect, useState } from 'react';
import styles from './game.module.css';

function Note({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(false), Math.max(3500, text.length * 45));
    return () => clearTimeout(t);
  }, [text]);
  return visible ? (
    <p className={styles.marginNote} role="status" aria-live="polite" data-map-chrome>
      {text}
    </p>
  ) : null;
}

/** Handwritten margin note, one at a time, ≥ 3.5 s (design-system §6.14) — replaces toasts. */
export function MarginNote({ note }: { note: { id: number; text: string } | null }) {
  return note ? <Note key={note.id} text={note.text} /> : null;
}
