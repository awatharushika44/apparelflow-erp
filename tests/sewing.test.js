import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupApi, teardownApi, cookieFor, call } from './helpers/api.js';
import { POST as createOrder } from '../app/api/orders/route.js';
import { POST as submit } from '../app/api/orders/[id]/submit/route.js';
import { GET as getDetail } from '../app/api/verification/orders/[id]/route.js';
import { PUT as saveCounts } from '../app/api/verification/orders/[id]/counts/route.js';
import { POST as approve } from '../app/api/verification/orders/[id]/approve/route.js';
import { POST as reject } from '../app/api/verification/orders/[id]/reject/route.js';
import { GET as queue } from '../app/api/sewing/queue/route.js';
import { GET as active } from '../app/api/sewing/active/route.js';
import { GET as sewDetail } from '../app/api/sewing/orders/[id]/route.js';
import { POST as start } from '../app/api/sewing/orders/[id]/start/route.js';

let db, supervisor, verifier, sewing;
beforeAll(async () => {
  db = await setupApi();
  supervisor = await cookieFor('sup@test.local');
  verifier = await cookieFor('ver@test.local');
  sewing = await cookieFor('sew@test.local');
}, 30000);
afterAll(() => teardownApi(db));

const ctx = (id) => ({ params: Promise.resolve({ id }) });
const GOOD = {
  'Front Body Panel': 50,
  'Back Body Panel': 50,
  'Sleeves (Left & Right)': 100,
  'Collar & Stand': 50,
  'Sleeve Cuffs': 103,
};

// Creates an order and moves it to the wanted stage, using only real endpoints.
async function makeOrder(stage, overrides = {}) {
  const created = await call(createOrder, 'POST', '/api/orders', {
    cookie: supervisor,
    body: { recipeCode: 'REC-BL01', targetQty: 50, fabricRollId: 'FAB-S', actualFabricYards: 94, ...overrides },
  });
  const id = (await created.json()).order.id;
  if (stage === 'draft') return id;
  await call(submit, 'POST', `/api/orders/${id}/submit`, { cookie: supervisor, ctx: ctx(id) });
  if (stage === 'pending') return id;
  if (stage === 'rejected') {
    await call(reject, 'POST', `/api/verification/orders/${id}/reject`, {
      cookie: verifier, body: { rejectionNote: 'Short sleeves' }, ctx: ctx(id),
    });
    return id;
  }
  const detail = await call(getDetail, 'GET', `/api/verification/orders/${id}`, { cookie: verifier, ctx: ctx(id) });
  const { order } = await detail.json();
  const counts = order.items.map((i) => ({ componentId: i.componentId, actualQty: GOOD[i.name] }));
  await call(saveCounts, 'PUT', `/api/verification/orders/${id}/counts`, {
    cookie: verifier, body: { counts }, ctx: ctx(id),
  });
  const res = await call(approve, 'POST', `/api/verification/orders/${id}/approve`, {
    cookie: verifier, body: { auditNote: 'Cuffs slightly high' }, ctx: ctx(id),
  });
  expect(res.status).toBe(200);
  return id;
}

const statusOf = async (id) =>
  (await db.query('SELECT status FROM cutting_orders WHERE id = $1', [id])).rows[0].status;
const getQueue = async (path = '/api/sewing/queue') =>
  (await (await call(queue, 'GET', path, { cookie: sewing })).json()).orders;
const doStart = (id, cookie = sewing, body) =>
  call(start, 'POST', `/api/sewing/orders/${id}/start`, { cookie, body, ctx: ctx(id) });

describe('sewing queue and start', () => {
  it('T5: the queue returns only VERIFIED orders, even with hostile query params', async () => {
    const draft = await makeOrder('draft');
    const pending = await makeOrder('pending');
    const rejected = await makeOrder('rejected');
    const verified = await makeOrder('verified');

    const dbIds = (await db.query(`SELECT id::text AS id FROM cutting_orders WHERE status = 'VERIFIED'`)).rows
      .map((r) => r.id).sort();
    for (const path of [
      '/api/sewing/queue',
      '/api/sewing/queue?status=PENDING_VERIFICATION',
      '/api/sewing/queue?status=ALL&all=1&id=1%20OR%201=1',
    ]) {
      const ids = (await getQueue(path)).map((o) => o.id).sort();
      expect(ids, path).toEqual(dbIds);
      expect(ids).toContain(verified);
      for (const hidden of [draft, pending, rejected]) expect(ids).not.toContain(hidden);
    }
  });

  it('anonymous gets 401, supervisor and verifier get 403, on all four endpoints', async () => {
    const id = await makeOrder('verified');
    const attempts = (cookie) => [
      call(queue, 'GET', '/api/sewing/queue', { cookie }),
      call(active, 'GET', '/api/sewing/active', { cookie }),
      call(sewDetail, 'GET', `/api/sewing/orders/${id}`, { cookie, ctx: ctx(id) }),
      doStart(id, cookie),
    ];
    for (const res of await Promise.all(attempts(null))) expect(res.status).toBe(401);
    for (const res of await Promise.all(attempts(supervisor))) expect(res.status).toBe(403);
    for (const res of await Promise.all(attempts(verifier))) expect(res.status).toBe(403);
    expect(await statusOf(id)).toBe('VERIFIED');
  });

  it('sewing cannot open draft, pending, rejected or unknown orders by ID (404)', async () => {
    for (const stage of ['draft', 'pending', 'rejected']) {
      const id = await makeOrder(stage);
      const res = await call(sewDetail, 'GET', `/api/sewing/orders/${id}`, { cookie: sewing, ctx: ctx(id) });
      expect(res.status, stage).toBe(404);
    }
    for (const bad of ['999999', 'abc']) {
      const res = await call(sewDetail, 'GET', `/api/sewing/orders/${bad}`, { cookie: sewing, ctx: ctx(bad) });
      expect(res.status, bad).toBe(404);
    }
  });

  it('detail shows verifier, audit note, wastage and component variances', async () => {
    const id = await makeOrder('verified');
    const res = await call(sewDetail, 'GET', `/api/sewing/orders/${id}`, { cookie: sewing, ctx: ctx(id) });
    expect(res.status).toBe(200);
    const { order } = await res.json();
    expect(order).toMatchObject({
      status: 'VERIFIED',
      auditNote: 'Cuffs slightly high',
      wastagePct: 4.44,
      expectedYards: 90,
      overCap: false,
      sewingStartedBy: null,
    });
    expect(order.verifiedBy).toBeTruthy();
    expect(order.verifiedAt).toBeTruthy();
    expect(order.items).toHaveLength(5);
    expect(order.items.find((i) => i.component === 'Sleeve Cuffs')).toMatchObject({ variance: 3, light: 'YELLOW' });
  });

  it('start moves VERIFIED to SEWING_STARTED, records who and when, and leaves the queue', async () => {
    const id = await makeOrder('verified');
    const res = await doStart(id);
    expect(res.status).toBe(200);
    expect((await res.json()).order.status).toBe('SEWING_STARTED');

    const row = (
      await db.query(
        `SELECT o.status, u.email, (o.sewing_started_at > now() - interval '1 minute') AS fresh
           FROM cutting_orders o JOIN users u ON u.id = o.sewing_started_by WHERE o.id = $1`,
        [id],
      )
    ).rows[0];
    expect(row).toMatchObject({ status: 'SEWING_STARTED', email: 'sew@test.local', fresh: true });

    expect((await getQueue()).map((o) => o.id)).not.toContain(id);
    const act = (await (await call(active, 'GET', '/api/sewing/active', { cookie: sewing })).json()).orders;
    expect(act.map((o) => o.id)).toContain(id);
  });

  it('starting twice gives 409', async () => {
    const id = await makeOrder('verified');
    expect((await doStart(id)).status).toBe(200);
    expect((await doStart(id)).status).toBe(409);
  });

  it('starting an order that is not VERIFIED gives 409 and changes nothing', async () => {
    for (const stage of ['draft', 'pending', 'rejected']) {
      const id = await makeOrder(stage);
      const before = await statusOf(id);
      expect((await doStart(id)).status, stage).toBe(409);
      expect(await statusOf(id)).toBe(before);
    }
    expect((await doStart('999999')).status).toBe(404);
  });

  it('a forged body cannot choose who started sewing', async () => {
    const id = await makeOrder('verified');
    const res = await doStart(id, sewing, { sewingStartedBy: '1', status: 'REJECTED', sewing_started_at: '2000-01-01' });
    expect(res.status).toBe(200);
    const row = (
      await db.query(
        `SELECT o.status, u.email FROM cutting_orders o JOIN users u ON u.id = o.sewing_started_by WHERE o.id = $1`,
        [id],
      )
    ).rows[0];
    expect(row).toEqual({ status: 'SEWING_STARTED', email: 'sew@test.local' });
  });

  it('the queue is empty-safe: a queue with nothing verified still returns 200', async () => {
    const res = await call(queue, 'GET', '/api/sewing/queue', { cookie: sewing });
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).orders)).toBe(true);
  });
});