import pg from 'pg';

// Tests can plug in a PGlite adapter here.
// Production leaves this as null.
let testAdapter = null;

export function setTestAdapter(adapter) {
  testAdapter = adapter;
}

// Created on first use and cached during Next.js hot reloads.
function pool() {
  return (globalThis.__pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  }));
}

export const query = (text, params) =>
  testAdapter ? testAdapter.query(text, params) : pool().query(text, params);

// BEGIN, work, COMMIT all use ONE checked-out connection.
export async function withTx(fn) {
  if (testAdapter) return testAdapter.withTx(fn);

  const client = await pool().connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}