import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify, continentOf, type GeoPolicy, type NeProps } from '../src/classify';

const policy = JSON.parse(
  readFileSync(new URL('../../../content/geo/policy.json', import.meta.url), 'utf8'),
) as GeoPolicy;

const unit = (p: Partial<NeProps>): NeProps => ({
  ADM0_A3: p.ISO_A3_EH ?? 'XXX',
  ISO_A3_EH: 'XXX',
  ISO_A2_EH: 'XX',
  ISO_N3_EH: '000',
  TYPE: 'Sovereign country',
  SOV_A3: p.ISO_A3_EH ?? 'XXX',
  ADMIN: 'Test',
  CONTINENT: 'Europe',
  SUBREGION: 'Western Europe',
  ...p,
});

describe('geo policy', () => {
  it('lists 193 UN members and 2 observers', () => {
    expect(new Set(policy.unMembers).size).toBe(193);
    expect(policy.unObservers).toEqual(['PSE', 'VAT']);
  });

  it('makes France playable despite ISO_A3 = -99 (uses ISO_A3_EH)', () => {
    expect(
      classify(unit({ ADM0_A3: 'FRA', ISO_A3_EH: 'FRA', TYPE: 'Country', SOV_A3: 'FR1' }), policy),
    ).toEqual({
      kind: 'playable',
      entity: 'FRA',
    });
  });

  it('keeps UN members playable even when Natural Earth types them as disputed', () => {
    expect(
      classify(unit({ ADM0_A3: 'ISR', ISO_A3_EH: 'ISR', TYPE: 'Disputed', SOV_A3: 'IS1' }), policy)
        .kind,
    ).toBe('playable');
    expect(
      classify(
        unit({ ADM0_A3: 'PSX', ISO_A3_EH: 'PSE', TYPE: 'Indeterminate', SOV_A3: 'IS1' }),
        policy,
      ),
    ).toEqual({
      kind: 'playable',
      entity: 'PSE',
    });
  });

  it('attaches dependencies to their sovereign state', () => {
    expect(
      classify(unit({ ADM0_A3: 'GRL', ISO_A3_EH: 'GRL', TYPE: 'Country', SOV_A3: 'DN1' }), policy),
    ).toEqual({
      kind: 'territory',
      entity: 'DNK',
      reason: 'dependency',
    });
    expect(
      classify(unit({ ADM0_A3: 'USG', ISO_A3_EH: '-99', TYPE: 'Lease', SOV_A3: 'CU1' }), policy),
    ).toMatchObject({
      kind: 'territory',
      entity: 'CUB',
    });
  });

  it('does not let a dependency sharing its sovereign ISO code become the home unit', () => {
    expect(
      classify(
        unit({ ADM0_A3: 'CLP', ISO_A3_EH: 'FRA', TYPE: 'Dependency', SOV_A3: 'FR1' }),
        policy,
      ),
    ).toMatchObject({
      kind: 'territory',
      entity: 'FRA',
    });
  });

  it.each([
    ['TWN', 'TWN', 'Sovereign country', 'TWN', 'non-member'],
    ['KOS', '-99', 'Disputed', 'KOS', 'disputed'],
    ['SAH', 'ESH', 'Indeterminate', 'SAH', 'disputed'],
    ['SOL', '-99', 'Sovereign country', 'SOL', 'non-member'],
    ['FLK', 'FLK', 'Disputed', 'GB1', 'disputed'],
    ['BRI', 'BRA', 'Indeterminate', 'BRI', 'disputed'],
  ])('%s is not plantable (%s)', (adm0, iso, type, sov, reason) => {
    expect(
      classify(unit({ ADM0_A3: adm0, ISO_A3_EH: iso, TYPE: type, SOV_A3: sov }), policy),
    ).toMatchObject({
      kind: 'unplantable',
      reason,
    });
  });

  it('never makes Antarctica plantable', () => {
    expect(
      classify(
        unit({ ADM0_A3: 'ATA', ISO_A3_EH: 'ATA', TYPE: 'Indeterminate', SOV_A3: 'ATA' }),
        policy,
      ).kind,
    ).toBe('unplantable');
  });

  it('resolves "Seven seas" island states through overrides', () => {
    expect(
      continentOf(unit({ ISO_A3_EH: 'MDV', CONTINENT: 'Seven seas (open ocean)' }), policy),
    ).toBe('AS');
    expect(
      continentOf(unit({ ISO_A3_EH: 'XXX', CONTINENT: 'Seven seas (open ocean)' }), policy),
    ).toBeNull();
  });
});
