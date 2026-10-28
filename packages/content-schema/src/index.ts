import { z } from 'zod';

export const Iso3 = z.string().regex(/^[A-Z]{3}$/, 'ISO 3166-1 alpha-3, uppercase');
export type Iso3 = z.infer<typeof Iso3>;

export const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LonLat = z.infer<typeof LonLat>;

export const ContinentCode = z.enum(['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA']);
export type ContinentCode = z.infer<typeof ContinentCode>;

/** data-model §2.1 — a state that can be given as an answer. */
export const PlayableEntity = z.object({
  iso3: Iso3,
  iso2: z.string().regex(/^[A-Z]{2}$/),
  m49: z.string().regex(/^\d{3}$/),
  subregionM49: z.string().regex(/^\d{3}$/),
  continent: ContinentCode,
  continents: z.array(ContinentCode).min(1),
  geomIds: z.array(z.string()).min(1),
  aimPoint: LonLat,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
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
