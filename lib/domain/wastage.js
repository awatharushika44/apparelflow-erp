// Fabric amounts are stored as whole HUNDREDTHS of a yard.
//
// Example:
// 1.8 yards = 180
// 94 yards = 9400
//
// This avoids JavaScript floating-point problems.

export function toHundredths(value) {
  const text = String(value).trim();

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);

  if (!match) {
    throw new RangeError(
      `not a valid amount with at most 2 decimals: "${text}"`,
    );
  }

  return (
    Number(match[1]) * 100 +
    Number((match[2] ?? '').padEnd(2, '0'))
  );
}

export function formatHundredths(h) {
  return `${Math.trunc(h / 100)}.${String(
    Math.abs(h % 100),
  ).padStart(2, '0')}`;
}

// Round half away from zero.
//
// This matches PostgreSQL's round() behaviour.
function divideRoundHalfAway(numerator, denominator) {
  const sign = numerator < 0 ? -1 : 1;
  const a = Math.abs(numerator);

  const remainder = a % denominator;

  let quotient = (a - remainder) / denominator;

  if (2 * remainder >= denominator) {
    quotient += 1;
  }

  return quotient === 0 ? 0 : sign * quotient;
}

export function computeWastage({
  targetQty,
  stdFabricYards,
  wastageCap,
  actualYards,
}) {
  if (!Number.isInteger(targetQty) || targetQty < 1) {
    throw new RangeError(
      'targetQty must be a whole number of at least 1',
    );
  }

  const stdH = toHundredths(stdFabricYards);
  const capH = toHundredths(wastageCap);
  const actualH = toHundredths(actualYards);

  const expectedH = targetQty * stdH;

  if (expectedH < 1) {
    throw new RangeError(
      'expected fabric must be more than zero',
    );
  }

  // Positive variance = more fabric used than expected.
  // Negative variance = less fabric used.
  const varianceH = actualH - expectedH;

  return {
    expectedYards: formatHundredths(expectedH),

    // Calculate percentage and store/display it to 2 decimals.
    wastagePct:
      divideRoundHalfAway(
        varianceH * 10000,
        expectedH,
      ) / 100,

    // IMPORTANT:
    // Compare exact integer values, NOT the rounded percentage.
    overCap:
      varianceH * 10000 > capH * expectedH,
  };
}