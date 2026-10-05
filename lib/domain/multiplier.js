// Pure functions: no database, no network. Same input, same output, always.

export const MAX_TARGET_QTY = 100000; // same limit as the database CHECK

export function expectedPieces(targetQty, piecesPerGarment) {
  if (!Number.isInteger(targetQty) || targetQty < 1 || targetQty > MAX_TARGET_QTY) {
    throw new RangeError(`targetQty must be a whole number from 1 to ${MAX_TARGET_QTY}`);
  }
  if (!Number.isInteger(piecesPerGarment) || piecesPerGarment < 1) {
    throw new RangeError('piecesPerGarment must be a whole number of at least 1');
  }
 return targetQty * piecesPerGarment;
}

// components: [{ name, piecesPerGarment }] -> same list plus expectedQty
export function expectedForComponents(targetQty, components) {
  return components.map((c) => ({
    ...c,
    expectedQty: expectedPieces(targetQty, c.piecesPerGarment),
  }));
}