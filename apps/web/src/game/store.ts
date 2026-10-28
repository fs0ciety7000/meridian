import type { Difficulty, Expedition } from '@meridian/content-schema';
import {
  dryInk,
  remainingAnswers,
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
import { track } from './telemetry';

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
      (window as unknown as { __meridianIso2?: Record<string, string> }).__meridianIso2 =
        Object.fromEntries([...content.deps.entities.values()].map((e) => [e.iso3, e.iso2]));
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
    track({
      type: 'expedition_started',
      code: expedition.code,
      difficulty: expedition.difficulty,
      source: challengeFrom ? 'challenge' : expedition.source,
    });
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
    report(r.state, action, r.events);
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

declare global {
  interface Window {
    /** Test hook (Playwright): answers of the current leg, to play a run end to end. */
    __meridianTest?: { answers: (runId?: string) => string[]; wrong: (runId?: string) => string[] };
  }
}

const currentRun = (runId?: string) => {
  const { runs } = useGame.getState();
  return runId
    ? runs.find((r) => r.runId === runId)
    : runs.filter((r) => r.status === 'in_progress').at(-1);
};

window.__meridianTest = {
  answers: (runId) => {
    const { content } = useGame.getState();
    const run = currentRun(runId);
    return run && content ? remainingAnswers(run, content.deps) : [];
  },
  wrong: (runId) => {
    const { content } = useGame.getState();
    const run = currentRun(runId);
    if (!run || !content) return [];
    const ok = new Set(remainingAnswers(run, content.deps));
    return [...content.deps.entities.keys()].filter((c) => !ok.has(c) && !run.usedIso3.includes(c));
  },
};

/** Anonymous balancing statistics (gameplay-systems §16), derived from engine events. */
function report(state: RunState, action: Action, events: EngineEvent[]) {
  const code = state.expedition.code;
  for (const e of events) {
    if (e.type === 'CAMP_REFUSED') track({ type: 'plant_failed', reason: e.reason });
    else if (e.type === 'EXPEDITION_COMPLETED' || e.type === 'EXPEDITION_ABANDONED') {
      if (e.type === 'EXPEDITION_ABANDONED')
        track({ type: 'abandoned', code, leg: state.currentLeg });
      else
        track({
          type: 'expedition_finished',
          code,
          distanceKm: e.score.distanceKm,
          renown: e.score.renown,
          durationMs:
            Math.max(0, Date.parse(state.finishedAt ?? '') - Date.parse(state.startedAt)) || 0,
          falseTrails: state.legs.filter((l) => !l.valid).length,
          attempt: state.attempt,
        });
    }
  }
  if (
    action.type === 'CONFIRM_CAMP' &&
    events.some((e) => e.type === 'CAMP_PLANTED' || e.type === 'FALSE_TRAIL')
  ) {
    const leg = state.legs.at(-1)!;
    track({
      type: 'leg_resolved',
      code,
      leg: leg.leg,
      promptId: leg.promptId,
      valid: leg.valid,
      ms: Math.min(leg.ms, 86_400_000),
      provisionalMoves: Math.min(leg.provisionalMoves, 1000),
      spyglass: leg.spyglass,
      tier: leg.rarity?.tier ?? null,
    });
  }
}
