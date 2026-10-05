import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const dir = path.join(process.cwd(), 'db', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
await client.connect();

try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await client.query('SELECT filename FROM schema_migrations');
  const done = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (done.has(file)) { console.log(`skip   ${file}`); continue; }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/^\uFEFF/, '');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`apply  ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file} failed: ${err.message}`);
    }
  }
} finally {
  await client.end();
}