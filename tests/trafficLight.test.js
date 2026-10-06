import { describe, it, expect } from 'vitest';
import { trafficLight, blockingComponents } from '../lib/domain/trafficLight.js';

describe('trafficLight (PDF 7.3)', () => {
  it('equal is GREEN, more is YELLOW, fewer is RED', () => {
    expect(trafficLight(100, 100)).toBe('GREEN');
    expect(trafficLight(100, 103)).toBe('YELLOW');
    expect(trafficLight(100, 98)).toBe('RED');
  });

  it('a counted zero is RED', () => {
    expect(trafficLight(50, 0)).toBe('RED');
  });

  it('not counted yet (null or undefined) gives null', () => {
    expect(trafficLight(50, null)).toBeNull();
    expect(trafficLight(50, undefined)).toBeNull();
  });

  it('rejects counts that are not whole numbers', () => {
    expect(() => trafficLight(100, -1)).toThrow(RangeError);
    expect(() => trafficLight(100, 2.5)).toThrow(RangeError);
    expect(() => trafficLight(100, '98')).toThrow(RangeError);
    expect(() => trafficLight(100, NaN)).toThrow(RangeError);
    expect(() => trafficLight(0, 5)).toThrow(RangeError);
    expect(() => trafficLight(2.5, 3)).toThrow(RangeError);
  });
});

describe('blockingComponents (PDF 7.3 and 9)', () => {
  it('one RED and one uncounted component both block', () => {
    const blockers = blockingComponents([
      { name: 'Front', expectedQty: 50, actualQty: 50 },
      { name: 'Sleeves', expectedQty: 100, actualQty: 98 },
      { name: 'Collar & Stand', expectedQty: 50, actualQty: undefined },
      { name: 'Cuffs', expectedQty: 100, actualQty: 103 },
    ]);
    expect(blockers.map((b) => `${b.name}:${b.reason}`)).toEqual(['Sleeves:RED', 'Collar & Stand:UNCOUNTED']);
  });

  it('GREEN and YELLOW only: nothing blocks', () => {
    const blockers = blockingComponents([
      { name: 'Front', expectedQty: 50, actualQty: 50 },
      { name: 'Sleeves', expectedQty: 100, actualQty: 100 },
      { name: 'Cuffs', expectedQty: 100, actualQty: 103 },
    ]);
    expect(blockers).toEqual([]);
  });
});