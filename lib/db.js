import pg from 'pg';

const pool = globalThis.__pool ?? (globalThis.__pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
}));

export const query = (text, params) => pool.query(text, params);