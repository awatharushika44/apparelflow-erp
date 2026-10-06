function assertCount(value, label, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`${label} must be a whole number of at least ${min}`);
  }
}

// PDF 7.3.
// Returns GREEN, YELLOW, RED,
// or null when the component has not been counted yet.
export function trafficLight(expectedQty, actualQty) {
  assertCount(expectedQty, 'expectedQty', 1);

  // null/undefined means QC hasn't counted it yet.
  if (actualQty === null || actualQty === undefined) {
    return null;
  }

  assertCount(actualQty, 'actualQty', 0);

  if (actualQty === expectedQty) {
    return 'GREEN';
  }

  return actualQty > expectedQty ? 'YELLOW' : 'RED';
}

// Finds the components that prevent approval.
//
// RED components block approval.
// Uncounted components also block approval.
// YELLOW components do NOT block approval.
export function blockingComponents(items) {
  const blockers = [];

  for (const item of items) {
    const light = trafficLight(
      item.expectedQty,
      item.actualQty,
    );

    if (light === null) {
      blockers.push({
        name: item.name,
        reason: 'UNCOUNTED',
        expectedQty: item.expectedQty,
        actualQty: null,
      });
    } else if (light === 'RED') {
      blockers.push({
        name: item.name,
        reason: 'RED',
        expectedQty: item.expectedQty,
        actualQty: item.actualQty,
      });
    }
  }

  return blockers;
}