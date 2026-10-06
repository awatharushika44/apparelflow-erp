import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupApi,
  teardownApi,
  cookieFor,
  call,
} from './helpers/api.js';
import { GET as listRecipes } from '../app/api/recipes/route.js';
import { POST as createOrder } from '../app/api/orders/route.js';

let db;
let supervisor;
let verifier;
let sewing;

beforeAll(async () => {
  db = await setupApi();

  supervisor = await cookieFor('sup@test.local');
  verifier = await cookieFor('ver@test.local');
  sewing = await cookieFor('sew@test.local');
}, 30000);

afterAll(() => teardownApi(db));

const valid = {
  recipeCode: 'REC-BL01',
  targetQty: 50,
  fabricRollId: 'FAB-ROLL-1',
  actualFabricYards: 94,
};

const post = (cookie, body) =>
  call(createOrder, 'POST', '/api/orders', {
    cookie,
    body,
  });

const orderCount = async () =>
  (
    await db.query(
      'SELECT count(*)::int AS n FROM cutting_orders',
    )
  ).rows[0].n;

describe('POST /api/orders', () => {
  it('a supervisor creates an order in CUTTING_IN_PROGRESS', async () => {
    const res = await post(supervisor, valid);

    expect(res.status).toBe(201);

    const { order } = await res.json();

    expect(order.status).toBe('CUTTING_IN_PROGRESS');
    expect(order.orderNo).toMatch(/^CO-\d{4}$/);
    expect(order.targetQty).toBe(50);
  });

  it('no cookie gives 401, verifier and sewing give 403, and nothing is stored', async () => {
    const before = await orderCount();

    expect((await post(null, valid)).status).toBe(401);
    expect((await post(verifier, valid)).status).toBe(403);
    expect((await post(sewing, valid)).status).toBe(403);

    expect(await orderCount()).toBe(before);
  });

  it('bad inputs give 422 and nothing is stored', async () => {
    const before = await orderCount();

    const bad = [
      { ...valid, targetQty: -3 },
      { ...valid, targetQty: 0 },
      { ...valid, targetQty: 2.5 },
      { ...valid, targetQty: '50' },
      { ...valid, targetQty: null },
      { ...valid, targetQty: 100001 },
      { ...valid, actualFabricYards: 94.5 },
      { ...valid, actualFabricYards: -1 },
      { ...valid, actualFabricYards: '94' },
      { ...valid, fabricRollId: '' },
      { ...valid, fabricRollId: '   ' },
      { ...valid, recipeCode: 'REC-NOPE' },
      { recipeCode: 'REC-BL01' },
    ];

    for (const body of bad) {
      expect(
        (await post(supervisor, body)).status,
        JSON.stringify(body),
      ).toBe(422);
    }

    expect(await orderCount()).toBe(before);
  });

  it('forged status and createdBy are ignored; the creator comes from the login', async () => {
    const res = await post(supervisor, {
      ...valid,
      status: 'VERIFIED',
      createdBy: '2',
    });

    expect(res.status).toBe(201);

    const { order } = await res.json();

    expect(order.status).toBe('CUTTING_IN_PROGRESS');

    const { rows } = await db.query(
      `SELECT u.email
         FROM cutting_orders co
         JOIN users u ON u.id = co.created_by
        WHERE co.id = $1`,
      [order.id],
    );

    expect(rows[0].email).toBe('sup@test.local');
  });
});

describe('GET /api/recipes', () => {
  it('supervisor and verifier can read recipes with their components', async () => {
    for (const cookie of [supervisor, verifier]) {
      const res = await call(
        listRecipes,
        'GET',
        '/api/recipes',
        { cookie },
      );

      expect(res.status).toBe(200);

      const { recipes } = await res.json();

      expect(recipes[0].recipeCode).toBe('REC-BL01');
      expect(recipes[0].components).toHaveLength(5);
    }
  });

  it('sewing gets 403 and anonymous gets 401', async () => {
    expect(
      (
        await call(
          listRecipes,
          'GET',
          '/api/recipes',
          { cookie: sewing },
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await call(
          listRecipes,
          'GET',
          '/api/recipes',
          {},
        )
      ).status,
    ).toBe(401);
  });
});