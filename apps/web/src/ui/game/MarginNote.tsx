import { useEffect, useState } from 'react';
import styles from './game.module.css';

export interface Note {
  id: number;
  text: string;
  /** Stays until replaced (onboarding coach), instead of fading after ≥ 3.5 s. */
  sticky?: boolean;
}

function NoteBody({ text, sticky }: { text: string; sticky: boolean }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (sticky) return;
    const t = window.setTimeout(() => setVisible(false), Math.max(3500, text.length * 45));
    return () => clearTimeout(t);
  }, [text, sticky]);
  return visible ? (
    <p className={styles.marginNote} role="status" aria-live="polite" data-map-chrome>
      {/* The clamp lives on the inner text box so the padding and rule stay clear (AD B1). */}
      <span className={styles.marginNoteText}>{text}</span>
    </p>
  ) : null;
}

/** Handwritten margin note, one at a time (design-system §6.14) — replaces toasts. */
export function MarginNote({ note, hidden = false }: { note: Note | null; hidden?: boolean }) {
  return note && !hidden ? (
    <NoteBody key={note.id} text={note.text} sticky={!!note.sticky} />
  ) : null;
}
