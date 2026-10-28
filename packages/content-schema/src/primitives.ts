import { z } from 'zod';

export const Iso3 = z.string().regex(/^[A-Z]{3}$/, 'ISO 3166-1 alpha-3, uppercase');
export type Iso3 = z.infer<typeof Iso3>;

export const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LonLat = z.infer<typeof LonLat>;

export const ContinentCode = z.enum(['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA']);
export type ContinentCode = z.infer<typeof ContinentCode>;
