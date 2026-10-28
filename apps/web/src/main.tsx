import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts';
import '@meridian/design-tokens/tokens.css';
import './styles/global.css';
import { App } from './app/App';
import { applyMaterial } from './game/material';

// Theme chosen by the player (else prefers-color-scheme decides).
try {
  const theme = localStorage.getItem('meridian.theme');
  if (theme === 'atlas' || theme === 'nocturne') document.documentElement.dataset.theme = theme;
} catch {
  /* storage unavailable */
}

applyMaterial();

const root = document.getElementById('root');
if (!root) throw new Error('#root missing in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline play: the service worker precaches the whole game (generated at build time).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is a bonus, never a failure */
    });
  });
}
