/**
 * Anonymous design telemetry (gameplay-systems §16, plan 3.6) — client side.
 *
 * - No personal data: events are bounded numbers/enums/slugs (schema in
 *   `@meridian/content-schema` → `telemetry.ts`); the only correlation key is a random session id
 *   generated in memory at each app launch, never persisted.
 * - Opt-out: `localStorage['meridian.telemetry'] = 'off'`; also off when `navigator.doNotTrack`
 *   is '1'.
 * - Never blocking: events are queued in memory and sent in batches with `navigator.sendBeacon`
 *   when the page is hidden (or when the queue fills up). Every failure is swallowed.
 *
 * Wiring: call `initTelemetry()` once at startup, `track(event)` from the game, and
 * `setTelemetryEnabled(bool)` from the settings toggle.
 */
import type { TelemetryEvent } from '@meridian/content-schema';

export type { TelemetryEvent } from '@meridian/content-schema';

export const TELEMETRY_STORAGE_KEY = 'meridian.telemetry';
const ENDPOINT = '/api/telemetry';
/** Mirrors TELEMETRY_MAX_EVENTS (server rejects larger batches). */
const BATCH_SIZE = 50;
/** Flush early once this many events are waiting. */
const FLUSH_AT = 40;
/** Memory cap: oldest events are dropped beyond it (e.g. long offline session). */
const MAX_QUEUE = 200;

let queue: TelemetryEvent[] = [];
let session: string | null = null;
let initialised = false;

function randomSession(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function optedOut(): boolean {
  try {
    return localStorage.getItem(TELEMETRY_STORAGE_KEY) === 'off';
  } catch {
    return false;
  }
}

/** False when the player opted out or the browser sends Do Not Track. */
export function isTelemetryEnabled(): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return false;
  } catch {
    /* ignore */
  }
  return !optedOut();
}

/** Settings toggle. Turning telemetry off also discards anything still queued. */
export function setTelemetryEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(TELEMETRY_STORAGE_KEY);
    else localStorage.setItem(TELEMETRY_STORAGE_KEY, 'off');
  } catch {
    /* storage unavailable (private mode): the choice only lasts for this launch */
  }
  if (!enabled) queue = [];
}

function send(events: TelemetryEvent[]): void {
  const body = JSON.stringify({ v: 1, session: session ?? (session = randomSession()), events });
  try {
    const blob = new Blob([body], { type: 'application/json' });
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, blob)) return;
  } catch {
    /* fall through */
  }
  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    /* offline or unsupported: events are lost, by design */
  }
}

/** Sends everything queued, in batches. Safe to call at any time. */
export function flushTelemetry(): void {
  if (queue.length === 0) return;
  if (!isTelemetryEnabled()) {
    queue = [];
    return;
  }
  const pending = queue;
  queue = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) send(pending.slice(i, i + BATCH_SIZE));
}

/** Queues one event. No-op when telemetry is disabled; never throws. */
export function track(event: TelemetryEvent): void {
  try {
    if (!isTelemetryEnabled()) return;
    queue.push(event);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    if (queue.length >= FLUSH_AT) flushTelemetry();
  } catch {
    /* never blocking */
  }
}

/**
 * Starts a new anonymous session and flushes on `visibilitychange` (hidden) and `pagehide` —
 * the last reliable moments on mobile. Idempotent.
 */
export function initTelemetry(): void {
  if (initialised || typeof document === 'undefined') return;
  initialised = true;
  session = randomSession();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTelemetry();
  });
  window.addEventListener('pagehide', flushTelemetry);
}
