import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupApi, teardownApi, cookieFor, call } from './helpers/api.js';
import { GET as listOrders, POST as createOrder } from '../app/api/orders/route.js';
import { POST as submit } from '../app/api/orders/[id]/submit/route.js';

let db, supervisor, verifier, sewing;

beforeAll(async () => {
  db = await setupApi();
  supervisor = await cookieFor('sup@test.local');
  verifier = await cookieFor('ver@test.local');
  sewing = await cookieFor('sew@test.local');
}, 30000);

afterAll(() => teardownApi(db));

const body = {
  recipeCode: 'REC-BL01',
  targetQty: 50,
  fabricRollId: 'FAB-1',
  actualFabricYards: 94,
};

const newOrder = async () =>
  (
    await (
      await call(createOrder, 'POST', '/api/orders', {
        cookie: supervisor,
        body,
      })
    ).json()
  ).order.id;

const doSubmit = (id, cookie) =>
  call(submit, 'POST', `/api/orders/${id}/submit`, {
    cookie,
    ctx: { params: Promise.resolve({ id }) },
  });

const statusOf = async (id) =>
  (await db.query(
    'SELECT status FROM cutting_orders WHERE id = $1',
    [id],
  )).rows[0].status;

const itemCount = async (id) =>
  (
    await db.query(
      'SELECT count(*)::int AS n FROM verification_items WHERE order_id = $1',
      [id],
    )
  ).rows[0].n;

describe('POST /api/orders/[id]/submit', () => {
  it('moves the order to PENDING_VERIFICATION and creates 5 uncounted rows (50 Blouses)', async () => {
    const id = await newOrder();

    const res = await doSubmit(id, supervisor);

    expect(res.status).toBe(200);
    expect(await statusOf(id)).toBe('PENDING_VERIFICATION');

    const { rows } = await db.query(
      'SELECT expected_qty, actual_qty, status FROM verification_items WHERE order_id = $1 ORDER BY component_id',
      [id],
    );

    expect(rows.map((r) => r.expected_qty)).toEqual([
      50,
      50,
      100,
      50,
      100,
    ]);

    expect(
      rows.every(
        (r) => r.actual_qty === null && r.status === null,
      ),
    ).toBe(true);
  });

  it('submitting twice gives 409 and creates no extra rows', async () => {
    const id = await newOrder();

    expect((await doSubmit(id, supervisor)).status).toBe(200);
    expect((await doSubmit(id, supervisor)).status).toBe(409);

    expect(await itemCount(id)).toBe(5);
  });

  it('anonymous gets 401, verifier and sewing get 403, and the order stays IN_PROGRESS', async () => {
    const id = await newOrder();

    expect((await doSubmit(id, null)).status).toBe(401);
    expect((await doSubmit(id, verifier)).status).toBe(403);
    expect((await doSubmit(id, sewing)).status).toBe(403);

    expect(await statusOf(id)).toBe('CUTTING_IN_PROGRESS');
  });

  it('an unknown or non-numeric id gives 404', async () => {
    expect((await doSubmit('999999', supervisor)).status).toBe(404);
    expect((await doSubmit('abc', supervisor)).status).toBe(404);
  });
});

describe('GET /api/orders', () => {
  it('a supervisor sees orders with their status', async () => {
    await newOrder();

    const res = await call(
      listOrders,
      'GET',
      '/api/orders',
      { cookie: supervisor },
    );

    expect(res.status).toBe(200);

    const { orders } = await res.json();

    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0]).toHaveProperty('status');
    expect(orders[0]).toHaveProperty('recipeName');
  });

  it('verifier and sewing get 403', async () => {
    expect(
      (
        await call(
          listOrders,
          'GET',
          '/api/orders',
          { cookie: verifier },
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await call(
          listOrders,
          'GET',
          '/api/orders',
          { cookie: sewing },
        )
      ).status,
    ).toBe(403);
  });
});