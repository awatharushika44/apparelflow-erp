// One pure function for "whole number, greater than zero". Used by the forms.
// The server still validates with Zod; this only gives instant feedback.
export function parseWholeNumber(
  text,
  { label = 'Value', max = 1000000 } = {},
) {
  const t = typeof text === 'string' ? text.trim() : '';

  if (t === '') {
    return { error: `${label} is required.` };
  }

  if (t.startsWith('-')) {
    return { error: `${label} cannot be negative.` };
  }

  if (/[.,]/.test(t)) {
    return {
      error: `${label} must be a whole number, with no decimals.`,
    };
  }

  if (!/^\d+$/.test(t)) {
    return { error: `${label} must be digits only.` };
  }

  const n = Number(t);

  if (n === 0) {
    return { error: `${label} must be greater than zero.` };
  }

  if (n > max) {
    return {
      error: `${label} is too large (maximum ${max}).`,
    };
  }

  return { value: n };
}