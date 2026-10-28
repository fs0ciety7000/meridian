import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts';
import '@meridian/design-tokens/tokens.css';
import './styles/global.css';
import { App } from './app/App';

// Theme chosen by the player (else prefers-color-scheme decides).
try {
  const theme = localStorage.getItem('meridian.theme');
  if (theme === 'atlas' || theme === 'nocturne') document.documentElement.dataset.theme = theme;
} catch {
  /* storage unavailable */
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
