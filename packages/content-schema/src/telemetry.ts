import { z } from 'zod';

import { Difficulty, ExpeditionCode, PromptDef } from './game';

/**
 * Anonymous design telemetry (gameplay-systems §16, plan 3.6).
 *
 * Privacy contract: no personal data. No IP, no stable identifier, no free text — every field is a
 * bounded number, a boolean, an enum or a short slug. The only correlation key is `session`, a
 * random id regenerated each time the app starts (never persisted).
 */

/** Short machine slug (no free text, so nothing personal can leak through it). */
const Slug = z.string().regex(/^[a-z0-9_-]{1,32}$/);
const Count = (max: number) => z.number().int().min(0).max(max);
/** Durations are capped at 24 h: anything longer is a suspended tab, not play time. */
const Millis = Count(86_400_000);

export const TelemetryTier = z.enum(['known', 'trail', 'frontier', 'incognita']);
export type TelemetryTier = z.infer<typeof TelemetryTier>;

/** `LegDef.index` (1-based); 0 = before the first leg (e.g. abandoned at the port). */
const Leg = Count(63);

export const TelemetryEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('expedition_started'),
    code: ExpeditionCode,
    difficulty: Difficulty,
    source: z.enum(['catalog', 'generated', 'challenge']),
  }),
  z.object({
    type: z.literal('leg_resolved'),
    code: ExpeditionCode,
    leg: Leg,
    promptId: PromptDef.shape.id,
    /** false = false trail. */
    valid: z.boolean(),
    /** Time from prompt reveal to confirmation. */
    ms: Millis,
    /** Moves of the provisional camp before confirming. */
    provisionalMoves: Count(1000),
    spyglass: z.boolean(),
    /** Rarity tier awarded (null on a false trail or when unknown). */
    tier: TelemetryTier.nullable(),
  }),
  z.object({
    type: z.literal('expedition_finished'),
    code: ExpeditionCode,
    distanceKm: z.number().min(0).max(1_000_000),
    renown: z.number().int().min(-1_000_000).max(1_000_000),
    durationMs: Millis,
    falseTrails: Count(64),
    attempt: z.enum(['first', 'replay']),
  }),
  z.object({ type: z.literal('abandoned'), code: ExpeditionCode, leg: Leg }),
  /** kind: e.g. 'native', 'clipboard', 'challenge'. */
  z.object({ type: z.literal('share'), code: ExpeditionCode, kind: Slug }),
  /** reason: e.g. engine CAMP_REFUSED reasons ('not_playable', 'disputed'…) or 'sea', 'no_unit'. */
  z.object({ type: z.literal('plant_failed'), reason: Slug }),
]);
export type TelemetryEvent = z.infer<typeof TelemetryEvent>;
export type TelemetryEventType = TelemetryEvent['type'];

export const TELEMETRY_MAX_EVENTS = 50;
/** Hard cap on the request body, checked before parsing. */
export const TELEMETRY_MAX_BYTES = 32 * 1024;

/**
 * Envelope of `POST /api/telemetry`. Events are validated one by one by the server so that a
 * single malformed event (e.g. from a newer client) does not drop the whole batch.
 */
export const TelemetryBatch = z.object({
  v: z.literal(1),
  session: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  events: z.array(z.unknown()).min(1).max(TELEMETRY_MAX_EVENTS),
});
export type TelemetryBatch = Omit<z.infer<typeof TelemetryBatch>, 'events'> & {
  events: TelemetryEvent[];
};
