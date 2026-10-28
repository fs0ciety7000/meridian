import Dexie, { type EntityTable } from 'dexie';
import type { RunState } from '@meridian/engine';

/**
 * Local-first persistence (data-model §6.1). Runs are the source of truth: passport, atlas and
 * lifetime totals are derived from finished first attempts, so they can never disagree.
 */
interface StoredRun {
  runId: string;
  expeditionCode: string;
  status: RunState['status'];
  attempt: RunState['attempt'];
  startedAt: string;
  state: RunState;
}

class MeridianDb extends Dexie {
  runs!: EntityTable<StoredRun, 'runId'>;
  constructor() {
    super('meridian');
    this.version(1).stores({ runs: 'runId, expeditionCode, status, startedAt' });
  }
}

let db: MeridianDb | null = null;
const open = () => (db ??= new MeridianDb());

export async function loadRuns(): Promise<RunState[]> {
  try {
    return (await open().runs.orderBy('startedAt').toArray()).map((r) => r.state);
  } catch {
    // Private mode or blocked storage: play without persistence.
    return [];
  }
}

export async function saveRun(state: RunState): Promise<void> {
  try {
    await open().runs.put({
      runId: state.runId,
      expeditionCode: state.expedition.code,
      status: state.status,
      attempt: state.attempt,
      startedAt: state.startedAt,
      state,
    });
  } catch {
    /* storage unavailable: the run lives in memory only */
  }
}
