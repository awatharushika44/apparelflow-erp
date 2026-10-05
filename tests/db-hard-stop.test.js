import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { seedBasics, createPendingOrder, setCounts, tryVerify, statusOf } from './helpers/fixtures.js';

let db;
beforeAll(async () => {
  db = await createTestDb();
  await seedBasics(db);
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

// 20 Blouses expect 20 / 20 / 40 / 20 / 40 pieces.
describe('database hard stop (PDF sections 3, 7.3, 9)', () => {
  it('GREEN and YELLOW together can be verified', async () => {
    const id = await createPendingOrder(db);
    await setCounts(db, id, [20, 20, 40, 20, 43]); // cuffs 43 of 40 = YELLOW
    await tryVerify(db, id);
    expect(await statusOf(db, id)).toBe('VERIFIED');
  });

  it('one RED component blocks verification', async () => {
    const id = await createPendingOrder(db);
    await setCounts(db, id, [20, 20, 38, 20, 40]); // sleeves 38 of 40 = RED
    await expect(tryVerify(db, id)).rejects.toThrow(/hard stop/);
    expect(await statusOf(db, id)).toBe('PENDING_VERIFICATION');
  });

  it('an uncounted component blocks verification', async () => {
    const id = await createPendingOrder(db);
    await setCounts(db, id, [20, 20, 40, null, 40]); // collar never counted
    await expect(tryVerify(db, id)).rejects.toThrow(/hard stop/);
    expect(await statusOf(db, id)).toBe('PENDING_VERIFICATION');
  });

  it('a missing component row blocks verification', async () => {
    const id = await createPendingOrder(db);
    await setCounts(db, id, [20, 20, 40, 20, 40]);
    await db.query(
      `DELETE FROM verification_items
        WHERE order_id = $1 AND component_id = (SELECT max(id) FROM recipe_components)`,
      [id],
    );
    await expect(tryVerify(db, id)).rejects.toThrow(/hard stop/);
    expect(await statusOf(db, id)).toBe('PENDING_VERIFICATION');
  });
});