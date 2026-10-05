import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

export async function createTestDb() {
  const db = new PGlite();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    await db.exec(
      readFileSync(join(MIGRATIONS_DIR, file), 'utf8'),
    );
  }

  return db;
}