import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers });

export function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  console.error('Unhandled error:', err); // full detail stays in the server log
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, 500);
}

// 400 = not JSON at all. 422 = JSON, but the fields break the rules.
// Zod drops keys the schema doesn't list, so a forged "role" or "status" never gets through.
export async function parseBody(request, schema) {
  let raw;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'Request body must be valid JSON.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(422, 'VALIDATION', 'Some fields are invalid.', z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}