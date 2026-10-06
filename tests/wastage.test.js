import { describe, it, expect } from 'vitest';
import { computeWastage, toHundredths } from '../lib/domain/wastage.js';

const blouse = (targetQty, actualYards) =>
  computeWastage({
    targetQty,
    stdFabricYards: '1.8',
    wastageCap: '5.0',
    actualYards,
  });

describe('wastage (PDF 7.5)', () => {
  it('50 Blouses, 94 yds: expected 90.00, 4.44%, under the 5% cap', () => {
    expect(blouse(50, 94)).toEqual({
      expectedYards: '90.00',
      wastagePct: 4.44,
      overCap: false,
    });
  });

  it('less fabric than the standard gives a negative percentage, not over the cap', () => {
    expect(blouse(50, 85)).toEqual({
      expectedYards: '90.00',
      wastagePct: -5.56,
      overCap: false,
    });
  });

  it('exactly on the cap (5.00%) is NOT over', () => {
    expect(blouse(100, 189)).toEqual({
      expectedYards: '180.00',
      wastagePct: 5,
      overCap: false,
    });
  });

  it('just above the cap (5.01%) IS over', () => {
    expect(blouse(100, '189.02')).toEqual({
      expectedYards: '180.00',
      wastagePct: 5.01,
      overCap: true,
    });
  });

  it('stored value rounds to 5.00 but the exact value is over the cap', () => {
    const r = computeWastage({
      targetQty: 1000,
      stdFabricYards: '2',
      wastageCap: '5',
      actualYards: '2100.05',
    });

    expect(r).toEqual({
      expectedYards: '2000.00',
      wastagePct: 5,
      overCap: true,
    });
  });

  it('40 Crop Tops, 48 yds: 9.09%, over the 8% cap', () => {
    const r = computeWastage({
      targetQty: 40,
      stdFabricYards: '1.1',
      wastageCap: '8.0',
      actualYards: 48,
    });

    expect(r).toEqual({
      expectedYards: '44.00',
      wastagePct: 9.09,
      overCap: true,
    });
  });

  it('matches the percentages stored by the seed (3.03, 4.17, 2.22, 0.00)', () => {
    const crop = computeWastage({
      targetQty: 60,
      stdFabricYards: '1.1',
      wastageCap: '8.0',
      actualYards: 68,
    });

    expect(crop.wastagePct).toBe(3.03);
    expect(blouse(40, 75).wastagePct).toBe(4.17);
    expect(blouse(25, 46).wastagePct).toBe(2.22);
    expect(blouse(35, 63).wastagePct).toBe(0);
  });

  it('avoids floating-point surprises by converting decimal fabric amounts to exact hundredths', () => {
    expect(1.1 * 3).not.toBe(3.3);

    const r = computeWastage({
      targetQty: 40,
      stdFabricYards: 1.1,
      wastageCap: 8,
      actualYards: 44,
    });

    expect(r.expectedYards).toBe('44.00');
    expect(r.wastagePct).toBe(0);
  });

  it('rejects amounts that are negative, have too many decimals, or are not numbers', () => {
    for (const bad of [-1, '1.234', 'abc', '', null, undefined, NaN]) {
      expect(() => toHundredths(bad)).toThrow(RangeError);
    }
  });
});