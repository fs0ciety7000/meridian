import type { EntitiesFile, GeoFeatureProps, PlayableEntity } from '@meridian/content-schema';
import { geoBounds } from 'd3-geo';
import type { Geometry, MultiLineString } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

export type Lod = '110m' | '50m';
export type UnitsTopology = Topology<{ units: GeometryCollection<GeoFeatureProps> }>;

/** One Natural Earth map unit with its precomputed geographic bounds. */
export interface GeoUnit extends GeoFeatureProps {
  geometry: Geometry;
  /** [west, south, east, north]; west > east when crossing the antimeridian. */
  bounds: [number, number, number, number];
}

export interface GeoLayer {
  units: GeoUnit[];
  /** Coastlines: arcs used by a single unit. */
  coast: MultiLineString;
  /** Land borders between two units, undisputed. */
  borders: MultiLineString;
  /** Borders touching a disputed / unplantable unit (drawn dotted). */
  disputedBorders: MultiLineString;
}

export interface GeoData {
  layers: { '110m': GeoLayer; '50m'?: GeoLayer };
  micro: GeoLayer;
  entities: Map<string, PlayableEntity>;
}

export function buildLayer(topology: UnitsTopology): GeoLayer {
  const object = topology.objects.units;
  const fc = feature(topology, object);
  const units: GeoUnit[] = fc.features.map((f) => {
    const [[w, s], [e, n]] = geoBounds(f);
    return { ...(f.properties as GeoFeatureProps), geometry: f.geometry, bounds: [w, s, e, n] };
  });
  const isDisputed = (g: unknown) => {
    const p = (g as { properties?: GeoFeatureProps }).properties;
    return !!p && (p.disputed || p.kind === 'unplantable');
  };
  return {
    units,
    coast: mesh(topology, object, (a, b) => a === b),
    borders: mesh(topology, object, (a, b) => a !== b && !isDisputed(a) && !isDisputed(b)),
    disputedBorders: mesh(topology, object, (a, b) => a !== b && (isDisputed(a) || isDisputed(b))),
  };
}

export function buildEntities(file: EntitiesFile): Map<string, PlayableEntity> {
  return new Map(file.entities.map((e) => [e.iso3, e]));
}

/** True when the lon/lat point lies inside geographic bounds (antimeridian aware). */
export function inBounds(
  [lon, lat]: readonly [number, number],
  [w, s, e, n]: GeoUnit['bounds'],
): boolean {
  if (lat < s || lat > n) return false;
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
}
