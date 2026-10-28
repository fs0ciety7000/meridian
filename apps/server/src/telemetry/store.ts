import { DatabaseSync } from 'node:sqlite';
import type { TelemetryEvent, TelemetryTier } from '@meridian/content-schema';

/** Raw events older than this are purged; aggregates are kept forever (ADR 0001). */
export const RAW_RETENTION_DAYS = 180;

const TIERS: readonly TelemetryTier[] = ['known', 'trail', 'frontier', 'incognita'];

/**
 * Schema migrations, applied in order and tracked with `PRAGMA user_version`.
 * Raw events carry a day (not a timestamp) and the per-launch random session id only.
 */
const MIGRATIONS = [
  `
  create table events (
    id integer primary key,
    day text not null,                       -- 'YYYY-MM-DD' (UTC), no finer timestamp
    session text not null,                   -- random per app launch, never persisted client-side
    type text not null,
    code text,
    payload text not null                    -- JSON TelemetryEvent
  );
  create index events_day on events(day);
  create index events_type_code on events(type, code);

  create table prompt_stats (
    prompt_id text primary key,
    n integer not null default 0,
    valid integer not null default 0,
    sum_ms integer not null default 0,
    sum_provisional_moves integer not null default 0,
    spyglass integer not null default 0,
    tier_known integer not null default 0,
    tier_trail integer not null default 0,
    tier_frontier integer not null default 0,
    tier_incognita integer not null default 0
  );

  create table code_stats (
    code text primary key,
    started integer not null default 0,
    finished integer not null default 0,
    finished_first integer not null default 0,
    abandoned integer not null default 0,
    shares integer not null default 0,
    legs integer not null default 0,
    valid_legs integer not null default 0,
    sum_leg_ms integer not null default 0,
    sum_duration_ms integer not null default 0,
    sum_distance_km real not null default 0,
    sum_renown integer not null default 0,
    sum_false_trails integer not null default 0
  );

  create table plant_failures (
    reason text primary key,
    n integer not null default 0
  );
  `,
];

export interface PromptSummary {
  promptId: string;
  n: number;
  valid: number;
  falseTrails: number;
  falseTrailRate: number;
  meanMs: number;
  spyglassRate: number;
  meanProvisionalMoves: number;
  tiers: Record<TelemetryTier, number>;
}

export interface ExpeditionSummary {
  code: string;
  started: number;
  finished: number;
  finishedFirst: number;
  abandoned: number;
  shares: number;
  completionRate: number | null;
  /** Median over raw events still within the retention window; null when none. */
  medianDurationMs: number | null;
  meanDurationMs: number | null;
  meanFalseTrails: number | null;
  meanRenown: number | null;
  meanDistanceKm: number | null;
  legFalseTrailRate: number | null;
}

export interface TelemetrySummary {
  generatedAt: string;
  retentionDays: number;
  totals: { events: number; sessions: number; firstDay: string | null; lastDay: string | null };
  prompts: PromptSummary[];
  expeditions: ExpeditionSummary[];
  plantFailed: { total: number; byReason: { reason: string; n: number }[] };
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const round = (x: number | null, digits = 4): number | null =>
  x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits;

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

type Row = Record<string, number | string | null>;

export class TelemetryStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec('pragma journal_mode = wal; pragma synchronous = normal;');
    this.migrate();
  }

  private migrate() {
    const { user_version: version } = this.db.prepare('pragma user_version').get() as {
      user_version: number;
    };
    for (let v = version; v < MIGRATIONS.length; v++) {
      this.transaction(() => {
        this.db.exec(MIGRATIONS[v]!);
        this.db.exec(`pragma user_version = ${v + 1}`);
      });
    }
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('begin immediate');
    try {
      const result = fn();
      this.db.exec('commit');
      return result;
    } catch (err) {
      this.db.exec('rollback');
      throw err;
    }
  }

  /** Stores raw events and updates the aggregates, atomically. */
  record(session: string, events: readonly TelemetryEvent[], now = new Date()): void {
    const day = now.toISOString().slice(0, 10);
    const insertEvent = this.db.prepare(
      'insert into events (day, session, type, code, payload) values (?, ?, ?, ?, ?)',
    );
    const ensureCode = this.db.prepare('insert or ignore into code_stats (code) values (?)');
    const bumpCode = (column: string) =>
      this.db.prepare(`update code_stats set ${column} = ${column} + 1 where code = ?`);
    const started = bumpCode('started');
    const abandoned = bumpCode('abandoned');
    const shares = bumpCode('shares');
    const leg = this.db.prepare(
      `update code_stats set legs = legs + 1, valid_legs = valid_legs + ?, sum_leg_ms = sum_leg_ms + ?
       where code = ?`,
    );
    const finished = this.db.prepare(
      `update code_stats set finished = finished + 1, finished_first = finished_first + ?,
         sum_duration_ms = sum_duration_ms + ?, sum_distance_km = sum_distance_km + ?,
         sum_renown = sum_renown + ?, sum_false_trails = sum_false_trails + ?
       where code = ?`,
    );
    const prompt = this.db.prepare(
      `insert into prompt_stats (prompt_id, n, valid, sum_ms, sum_provisional_moves, spyglass,
         tier_known, tier_trail, tier_frontier, tier_incognita)
       values (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (prompt_id) do update set
         n = n + 1, valid = valid + excluded.valid, sum_ms = sum_ms + excluded.sum_ms,
         sum_provisional_moves = sum_provisional_moves + excluded.sum_provisional_moves,
         spyglass = spyglass + excluded.spyglass,
         tier_known = tier_known + excluded.tier_known,
         tier_trail = tier_trail + excluded.tier_trail,
         tier_frontier = tier_frontier + excluded.tier_frontier,
         tier_incognita = tier_incognita + excluded.tier_incognita`,
    );
    const plant = this.db.prepare(
      `insert into plant_failures (reason, n) values (?, 1)
       on conflict (reason) do update set n = n + 1`,
    );

    this.transaction(() => {
      for (const e of events) {
        const code = 'code' in e ? e.code : null;
        insertEvent.run(day, session, e.type, code, JSON.stringify(e));
        if (code) ensureCode.run(code);
        switch (e.type) {
          case 'expedition_started':
            started.run(e.code);
            break;
          case 'leg_resolved':
            leg.run(e.valid ? 1 : 0, e.ms, e.code);
            prompt.run(
              e.promptId,
              e.valid ? 1 : 0,
              e.ms,
              e.provisionalMoves,
              e.spyglass ? 1 : 0,
              ...TIERS.map((t) => (e.tier === t ? 1 : 0)),
            );
            break;
          case 'expedition_finished':
            finished.run(
              e.attempt === 'first' ? 1 : 0,
              e.durationMs,
              e.distanceKm,
              e.renown,
              e.falseTrails,
              e.code,
            );
            break;
          case 'abandoned':
            abandoned.run(e.code);
            break;
          case 'share':
            shares.run(e.code);
            break;
          case 'plant_failed':
            plant.run(e.reason);
            break;
        }
      }
    });
  }

  /** Deletes raw events past the retention window; aggregates are untouched. */
  purge(now = new Date(), retentionDays = RAW_RETENTION_DAYS): number {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString().slice(0, 10);
    return Number(this.db.prepare('delete from events where day < ?').run(cutoff).changes);
  }

  summary(options: { minN?: number; now?: Date } = {}): TelemetrySummary {
    const minN = options.minN ?? 1;
    const totals = this.db
      .prepare(
        `select count(*) as events, count(distinct session) as sessions,
           min(day) as firstDay, max(day) as lastDay from events`,
      )
      .get() as {
      events: number;
      sessions: number;
      firstDay: string | null;
      lastDay: string | null;
    };

    const prompts = (
      this.db
        .prepare('select * from prompt_stats where n >= ? order by prompt_id')
        .all(minN) as Row[]
    )
      .map((r): PromptSummary => {
        const n = Number(r.n);
        const valid = Number(r.valid);
        return {
          promptId: String(r.prompt_id),
          n,
          valid,
          falseTrails: n - valid,
          falseTrailRate: round(ratio(n - valid, n)) ?? 0,
          meanMs: Math.round(Number(r.sum_ms) / n),
          spyglassRate: round(ratio(Number(r.spyglass), n)) ?? 0,
          meanProvisionalMoves: round(Number(r.sum_provisional_moves) / n, 2) ?? 0,
          tiers: {
            known: Number(r.tier_known),
            trail: Number(r.tier_trail),
            frontier: Number(r.tier_frontier),
            incognita: Number(r.tier_incognita),
          },
        };
      })
      .sort((a, b) => b.falseTrailRate - a.falseTrailRate || b.n - a.n);

    const durations = new Map<string, number[]>();
    const durationRows = this.db
      .prepare(
        `select code, cast(json_extract(payload, '$.durationMs') as integer) as ms from events
         where type = 'expedition_finished' order by code, ms`,
      )
      .all() as { code: string; ms: number }[];
    for (const { code, ms } of durationRows) {
      const list = durations.get(code) ?? [];
      list.push(ms);
      durations.set(code, list);
    }

    const expeditions = (
      this.db.prepare('select * from code_stats order by started desc, code').all() as Row[]
    ).map((r): ExpeditionSummary => {
      const fin = Number(r.finished);
      const mean = (column: string, digits = 2) => round(ratio(Number(r[column]), fin), digits);
      return {
        code: String(r.code),
        started: Number(r.started),
        finished: fin,
        finishedFirst: Number(r.finished_first),
        abandoned: Number(r.abandoned),
        shares: Number(r.shares),
        completionRate: round(ratio(fin, Number(r.started))),
        medianDurationMs: median(durations.get(String(r.code)) ?? []),
        meanDurationMs: round(ratio(Number(r.sum_duration_ms), fin), 0),
        meanFalseTrails: mean('sum_false_trails'),
        meanRenown: mean('sum_renown', 1),
        meanDistanceKm: mean('sum_distance_km', 0),
        legFalseTrailRate: round(ratio(Number(r.legs) - Number(r.valid_legs), Number(r.legs))),
      };
    });

    const byReason = this.db
      .prepare('select reason, n from plant_failures order by n desc, reason')
      .all() as { reason: string; n: number }[];

    return {
      generatedAt: (options.now ?? new Date()).toISOString(),
      retentionDays: RAW_RETENTION_DAYS,
      totals,
      prompts,
      expeditions,
      plantFailed: { total: byReason.reduce((s, r) => s + r.n, 0), byReason },
    };
  }

  close(): void {
    this.db.close();
  }
}
