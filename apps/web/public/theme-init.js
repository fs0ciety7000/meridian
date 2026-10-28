/* global document */
// Theme chosen by the player, applied before the first paint so the static shell follows it.
// A file rather than an inline script: the Content-Security-Policy forbids inline scripts.
try {
  var theme = localStorage.getItem('meridian.theme');
  if (theme === 'atlas' || theme === 'nocturne') document.documentElement.dataset.theme = theme;
} catch {
  /* storage unavailable */
}
