import type { Difficulty, Expedition } from '@meridian/content-schema';
import {
  dryInk,
  encodeGeneratedCode,
  reduce,
  type Action,
  type EngineEvent,
  type RunState,
} from '@meridian/engine';
import { create } from 'zustand';
import type { GeoData } from '../map/geodata';
import { loadGeoData } from '../map/loadGeoData';
import { loadGameContent, newSeed, resolveExpedition, type GameContent } from './content';
import { loadRuns, saveRun } from './db';
import { useLocale } from './i18n';

interface GameStore {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  geo: GeoData | null;
  content: GameContent | null;
  runs: RunState[];
  /** Events of the last dispatch: the expedition screen choreographs them. */
  events: { id: number; list: EngineEvent[] };
  /** Stamps that dried since the last visit (played once, grouped). */
  dried: EngineEvent[];
  init: () => Promise<void>;
  start: (expedition: Expedition, challengeFrom?: string) => RunState;
  dispatch: (runId: string, action: Action) => EngineEvent[];
  newCode: (difficulty: Difficulty) => string | null;
  expedition: (code: string) => Promise<Expedition | null>;
}

const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

export const useGame = create<GameStore>((set, get) => ({
  status: 'idle',
  error: null,
  geo: null,
  content: null,
  runs: [],
  events: { id: 0, list: [] },
  dried: [],

  init: async () => {
    if (get().status !== 'idle') return;
    set({ status: 'loading' });
    try {
      const [geo, content, stored] = await Promise.all([
        loadGeoData(),
        loadGameContent(),
        loadRuns(),
      ]);
      // Ink dries offline 24 h after play (gameplay-systems §6.4).
      const now = nowIso();
      const dried: EngineEvent[] = [];
      const runs = stored.map((r) => {
        if (r.status === 'in_progress') return r;
        const d = dryInk(r, content.deps, now);
        if (d.state !== r) {
          dried.push(...d.events);
          void saveRun(d.state);
        }
        return d.state;
      });
      set({ status: 'ready', geo, content, runs, dried });
    } catch (e) {
      set({ status: 'error', error: (e as Error).message });
    }
  },

  start: (expedition, challengeFrom) => {
    const { content, runs } = get();
    if (!content) throw new Error('content not loaded');
    // Only the first finished run of a code counts (gameplay-systems §3.4).
    const done = runs.some(
      (r) =>
        r.expedition.code === expedition.code && r.status === 'completed' && r.attempt === 'first',
    );
    const { state } = reduce(
      null,
      {
        type: 'START',
        runId: uuid(),
        expedition,
        mode: challengeFrom ? 'challenge' : 'expedition',
        attempt: done ? 'replay' : 'first',
        locale: useLocale.getState().locale,
        now: nowIso(),
        ...(challengeFrom ? { challengeFrom } : {}),
      },
      content.deps,
    );
    set({ runs: [...runs, state] });
    void saveRun(state);
    return state;
  },

  dispatch: (runId, action) => {
    const { content, runs, events } = get();
    const run = runs.find((r) => r.runId === runId);
    if (!content || !run) return [];
    const r = reduce(run, action, content.deps);
    if (r.state !== run) {
      set({ runs: runs.map((x) => (x.runId === runId ? r.state : x)) });
      void saveRun(r.state);
    }
    set({ events: { id: events.id + 1, list: r.events } });
    return r.events;
  },

  newCode: (difficulty) => {
    const v = get().content?.latestLibrary;
    return v ? encodeGeneratedCode(newSeed(), difficulty, v) : null;
  },

  expedition: async (code) => {
    const { content } = get();
    return content ? resolveExpedition(content, code) : null;
  },
}));

/** First attempts (finished or not): what the passport and the atlas are made of. */
export const countingRuns = (runs: RunState[]) => runs.filter((r) => r.attempt === 'first');
