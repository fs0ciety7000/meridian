import { z } from 'zod';

import { ContinentCode, Iso3, LonLat } from './primitives';

export * from './primitives';
export * from './game';

/** data-model §2.1 — a state that can be given as an answer. */
export const PlayableEntity = z.object({
  iso3: Iso3,
  iso2: z.string().regex(/^[A-Z]{2}$/),
  m49: z.string().regex(/^\d{3}$/),
  subregionM49: z.string().regex(/^\d{3}$/),
  continent: ContinentCode,
  /**
   * Continents touched by the entity's map units. Known limitation (phase 0): overseas parts merged
   * into the home unit's MultiPolygon (e.g. French Guiana) are not classified per polygon yet.
   */
  continents: z.array(ContinentCode).min(1),
  geomIds: z.array(z.string()).min(1),
  aimPoint: LonLat,
  /** Full extent of the home unit (overseas parts included); west > east across the antimeridian. */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  /** Extent of the largest polygon only — what the camera frames when flying to the entity. */
  mainBbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  areaKm2: z.number().positive(),
  isMicroState: z.boolean(),
  neighbors: z.array(Iso3),
  dataVersion: z.string(),
});
export type PlayableEntity = z.infer<typeof PlayableEntity>;

/** data-model §2.2 — every map unit that is not itself a playable entity. */
export const Territory = z.object({
  id: z.string(),
  name: z.string(),
  sovereign: Iso3.nullable(),
  geomId: z.string(),
  plantable: z.boolean(),
  reason: z.enum(['dependency', 'disputed', 'non-member', 'antarctica']),
});
export type Territory = z.infer<typeof Territory>;

export const GeoLod = z.enum(['110m', '50m', '10m-micro']);
export type GeoLod = z.infer<typeof GeoLod>;

/** data-model §2.4 */
export const GeoManifest = z.object({
  version: z.string(),
  source: z.object({ name: z.literal('Natural Earth'), version: z.string() }),
  files: z.array(
    z.object({
      lod: GeoLod,
      file: z.string(),
      sha256: z.string(),
      bytes: z.number(),
      bytesGz: z.number(),
    }),
  ),
});
export type GeoManifest = z.infer<typeof GeoManifest>;

/** Feature properties written into every TopoJSON object by tools/geo-pipeline. */
export const GeoFeatureProps = z.object({
  /** Natural Earth ADM0_A3 of the map unit (stable geometry id). */
  id: z.string(),
  /** Playable entity the unit counts for, or null when it cannot be planted on. */
  entity: Iso3.nullable(),
  kind: z.enum(['playable', 'territory', 'unplantable']),
  disputed: z.boolean(),
});
export type GeoFeatureProps = z.infer<typeof GeoFeatureProps>;

export const EntitiesFile = z.object({
  dataVersion: z.string(),
  entities: z.array(PlayableEntity),
  territories: z.array(Territory),
});
export type EntitiesFile = z.infer<typeof EntitiesFile>;
