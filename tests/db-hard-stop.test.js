import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from './helpers/db.js';

let db;
beforeAll(async () => {
  db = await createTestDb();
}, 30000);
afterAll(async () => {
  await db.close();
});

describe('test database harness', () => {
  it('has the six PDF tables plus allowed_transitions', async () => {
    const { rows } = await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`);
    expect(rows.map((r) => r.table_name)).toEqual([
      'allowed_transitions', 'cutting_orders', 'recipe_components',
      'recipes', 'users', 'verification_items', 'verification_logs',
    ]);
  });

  it('has exactly the 5 legal transitions', async () => {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM allowed_transitions');
    expect(rows[0].n).toBe(5);
  });
});