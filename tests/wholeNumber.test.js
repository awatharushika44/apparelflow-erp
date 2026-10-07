import { describe, it, expect } from 'vitest';
import { parseWholeNumber } from '../lib/validation/wholeNumber.js';

describe('parseWholeNumber', () => {
  it('accepts whole numbers, trimming spaces', () => {
    expect(parseWholeNumber('50')).toEqual({ value: 50 });
    expect(parseWholeNumber('  94 ')).toEqual({ value: 94 });
    expect(parseWholeNumber('007')).toEqual({ value: 7 });
  });

  it('rejects empty and blank', () => {
    expect(parseWholeNumber('').error).toMatch(/required/);
    expect(parseWholeNumber('   ').error).toMatch(/required/);
    expect(parseWholeNumber(undefined).error).toMatch(/required/);
  });

  it('rejects negatives, decimals, text and exponents', () => {
    expect(parseWholeNumber('-5').error).toMatch(/negative/);
    expect(parseWholeNumber('2.5').error).toMatch(/no decimals/);
    expect(parseWholeNumber('2,5').error).toMatch(/no decimals/);
    expect(parseWholeNumber('abc').error).toMatch(/digits only/);
    expect(parseWholeNumber('1e3').error).toMatch(/digits only/);
    expect(parseWholeNumber('+5').error).toMatch(/digits only/);
  });

  it('rejects zero and values over the maximum', () => {
    expect(parseWholeNumber('0').error).toMatch(/greater than zero/);
    expect(
      parseWholeNumber('100001', { max: 100000 }).error,
    ).toMatch(/too large/);
    expect(
      parseWholeNumber('99999999999999999999').error,
    ).toMatch(/too large/);
  });

  it('puts the label in the message', () => {
    expect(
      parseWholeNumber('', { label: 'Garments' }).error,
    ).toBe('Garments is required.');
  });
});