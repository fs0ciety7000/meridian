import { describe, expect, it } from 'vitest';
import { bestCenterLon, cutLegs } from '../projection';

const lisbon: [number, number] = [-9.14, 38.72];
const fiji: [number, number] = [178.0, -17.8];
const samoa: [number, number] = [-172.1, -13.8];
const brazil: [number, number] = [-50, -10];

describe('route-aware projection centre (architecture §4.2)', () => {
  it('keeps the Greenwich-centred map when no leg crosses the edge', () => {
    expect(bestCenterLon('equalEarth', [[lisbon, brazil]], 0)).toBe(0);
  });

  it('detects the Fiji → Samoa leg being cut by a Greenwich-centred map', () => {
    expect(cutLegs('equalEarth', 0, [[fiji, samoa]])).toBe(1);
  });

  it('rotates the world so the whole Lisbon → Fiji → Samoa route is in one piece', () => {
    const legs = [
      [lisbon, fiji],
      [fiji, samoa],
    ];
    const centre = bestCenterLon('equalEarth', legs, 0);
    expect(cutLegs('equalEarth', centre, legs)).toBe(0);
  });
});
