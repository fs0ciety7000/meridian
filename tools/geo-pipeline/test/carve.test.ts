import type { MultiPolygon, Polygon, Position } from 'geojson';
import { describe, expect, it } from 'vitest';
import { carve, polygonsOf, type Unit } from '../src/carve';
import type { Classification, NeProps } from '../src/classify';

/** Clockwise (d3-geo) axis-aligned rectangle. */
const rect = (w: number, s: number, e: number, n: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [w, s],
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ],
  ],
});

const unit = (id: string, geometry: Polygon, c: Classification): Unit => ({
  feature: { type: 'Feature', properties: { ADM0_A3: id } as NeProps, geometry },
  c,
});
const playable = (id: string, g: Polygon) => unit(id, g, { kind: 'playable', entity: id });
const disputed = (id: string, g: Polygon) =>
  unit(id, g, { kind: 'unplantable', sovereign: null, reason: 'disputed' });

/** Planar area in square degrees (holes subtracted): exact for rectilinear test shapes. */
const ringArea = (ring: Position[]) =>
  Math.abs(
    ring.reduce((s, [x, y], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length]!;
      return s + x! * y2! - x2! * y!;
    }, 0) / 2,
  );
const planar = (g: Polygon | MultiPolygon) =>
  polygonsOf(g).reduce(
    (s, [outer, ...holes]) => s + ringArea(outer!) - holes.reduce((t, h) => t + ringArea(h), 0),
    0,
  );
const get = (units: Unit[], id: string) =>
  units.find((u) => u.feature.properties.ADM0_A3 === id)!.feature.geometry;

describe('carve', () => {
  it('moves the area from the victim to a new unit, clipped to the victim', async () => {
    const { units } = await carve(
      [playable('AAA', rect(0, 0, 10, 10))],
      [
        {
          geometry: rect(6, 2, 12, 8), // overhangs into the sea east of x = 10
          dest: disputed('B00', rect(6, 2, 12, 8)),
          victim: () => true,
        },
      ],
    );
    expect(units.map((u) => [u.feature.properties.ADM0_A3, u.c.kind])).toEqual([
      ['AAA', 'playable'],
      ['B00', 'unplantable'],
    ]);
    expect(planar(get(units, 'B00'))).toBeCloseTo(4 * 6, 9);
    expect(planar(get(units, 'AAA'))).toBeCloseTo(100 - 24, 9);
  });

  it('gives detached coastal slivers left by a finer cut polygon to the destination', async () => {
    // The cut's coastline (x = 9.95) lies inside the victim's coarser one (x = 10).
    const { units } = await carve(
      [playable('AAA', rect(0, 0, 10, 10))],
      [
        {
          geometry: rect(5, -1, 9.95, 11),
          dest: disputed('B00', rect(5, -1, 9.95, 11)),
          victim: () => true,
        },
      ],
    );
    expect(polygonsOf(get(units, 'AAA'))).toHaveLength(1);
    expect(planar(get(units, 'AAA'))).toBeCloseTo(50, 9);
    expect(planar(get(units, 'B00'))).toBeCloseTo(50, 9);
  });

  it('merges the area into an existing unit and leaves non-victims untouched', async () => {
    const sah = disputed('SAH', rect(10, 0, 12, 10));
    const other = playable('BBB', rect(-5, 0, 0, 10));
    const { units } = await carve(
      [playable('AAA', rect(0, 0, 10, 10)), other, sah],
      [{ geometry: rect(5, 0, 10, 10), dest: sah, victim: (u) => u.c.kind === 'playable' }],
    );
    expect(units).toHaveLength(3);
    expect(units.find((u) => u.feature.properties.ADM0_A3 === 'BBB')).toBe(other);
    expect(polygonsOf(get(units, 'SAH'))).toHaveLength(1);
    expect(planar(get(units, 'SAH'))).toBeCloseTo(70, 9);
    expect(planar(get(units, 'AAA'))).toBeCloseTo(50, 9);
  });
});
