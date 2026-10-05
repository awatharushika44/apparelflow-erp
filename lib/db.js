import pg from 'pg';

const pool = globalThis.__pool ?? (globalThis.__pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
}));

export const query = (text, params) => pool.query(text, params);

export async function withTx(fn) {
  const client = await pool.connect();
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