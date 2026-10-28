import type { EntitiesFile } from '@meridian/content-schema';
import entitiesUrl from '@meridian/content/geo/entities.json?url';
import micro10Url from '@meridian/content/geo/micro-10m.topo.json?url';
import world110Url from '@meridian/content/geo/world-110m.topo.json?url';
import world50Url from '@meridian/content/geo/world-50m.topo.json?url';
import {
  buildEntities,
  buildLayer,
  type GeoData,
  type GeoLayer,
  type UnitsTopology,
} from './geodata';

const json = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return (await res.json()) as T;
};

/** World view data (≈ 60 KB gz): 110m + micro-states + entity metadata. */
export async function loadGeoData(): Promise<GeoData> {
  const [w110, micro, entities] = await Promise.all([
    json<UnitsTopology>(world110Url),
    json<UnitsTopology>(micro10Url),
    // Validated at build time (tools/geo-pipeline + tests): no runtime schema in the bundle.
    json<EntitiesFile>(entitiesUrl),
  ]);
  return {
    layers: { '110m': buildLayer(w110) },
    micro: buildLayer(micro),
    entities: buildEntities(entities),
  };
}

/** Detail layer (≈ 220 KB gz), loaded after first paint. */
export async function loadDetailLayer(): Promise<GeoLayer> {
  return buildLayer(await json<UnitsTopology>(world50Url));
}
