import { describe, it, expect } from 'vitest';
import {
  expectedPieces,
  expectedForComponents,
} from '../lib/domain/multiplier.js';

const BLOUSE = [
  { name: 'Front Body Panel', piecesPerGarment: 1 },
  { name: 'Back Body Panel', piecesPerGarment: 1 },
  { name: 'Sleeves (Left & Right)', piecesPerGarment: 2 },
  { name: 'Collar & Stand', piecesPerGarment: 1 },
  { name: 'Sleeve Cuffs', piecesPerGarment: 2 },
];

const CROP_TOP = [
  { name: 'Front Chest Panel', piecesPerGarment: 1 },
  { name: 'Back Support Panel', piecesPerGarment: 1 },
  { name: 'Neck Binding Strip', piecesPerGarment: 1 },
  { name: 'Hem Elastic Casing', piecesPerGarment: 1 },
  { name: 'Side Strap Accents', piecesPerGarment: 2 },
];

describe('multiplier engine (PDF 7.2)', () => {
  it('50 Blouses expect 50 / 50 / 100 / 50 / 100 pieces', () => {
    const result = expectedForComponents(50, BLOUSE)
      .map((component) => component.expectedQty);

    expect(result).toEqual([50, 50, 100, 50, 100]);
  });

  it('60 Crop Tops expect 60 / 60 / 60 / 60 / 120 pieces', () => {
    const result = expectedForComponents(60, CROP_TOP)
      .map((component) => component.expectedQty);

    expect(result).toEqual([60, 60, 60, 60, 120]);
  });

  it('one garment expects exactly the pieces per garment', () => {
    expect(expectedPieces(1, 2)).toBe(2);
  });

  it('rejects a target quantity that is not a whole number from 1 to 100000', () => {
    for (const bad of [
      0,
      -3,
      2.5,
      '50',
      NaN,
      null,
      undefined,
      100001,
    ]) {
      expect(() => expectedPieces(bad, 2)).toThrow(RangeError);
    }
  });

  it('rejects pieces per garment that are not whole numbers of at least 1', () => {
    for (const bad of [
      0,
      -1,
      1.5,
      '2',
      NaN,
    ]) {
      expect(() => expectedPieces(50, bad)).toThrow(RangeError);
    }
  });
});
