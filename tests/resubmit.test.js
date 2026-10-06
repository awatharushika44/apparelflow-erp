import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupApi, teardownApi, cookieFor, call } from './helpers/api.js';
import { POST as createOrder } from '../app/api/orders/route.js';
import { POST as submit } from '../app/api/orders/[id]/submit/route.js';
import { POST as resubmit } from '../app/api/orders/[id]/resubmit/route.js';
import { GET as getDetail } from '../app/api/verification/orders/[id]/route.js';
import { PUT as saveCounts } from '../app/api/verification/orders/[id]/counts/route.js';
import { POST as approve } from '../app/api/verification/orders/[id]/approve/route.js';
import { POST as reject } from '../app/api/verification/orders/[id]/reject/route.js';

let db, supervisor, verifier, sewing;
beforeAll(async () => {
  db = await setupApi();
  supervisor = await cookieFor('sup@test.local');
  verifier = await cookieFor('ver@test.local');
  sewing = await cookieFor('sew@test.local');
}, 30000);
afterAll(() => teardownApi(db));

const ctx = (id) => ({ params: Promise.resolve({ id }) });
const orderBody = { recipeCode: 'REC-BL01', targetQty: 50, fabricRollId: 'FAB-1', actualFabricYards: 94 };

async function newOrder({ submitIt = true, ...overrides } = {}) {
  const created = await call(createOrder, 'POST', '/api/orders', {
    cookie: supervisor,
    body: { ...orderBody, ...overrides },
  });
  const id = (await created.json()).order.id;
  if (submitIt) await call(submit, 'POST', `/api/orders/${id}/submit`, { cookie: supervisor, ctx: ctx(id) });
  return id;
}

async function countThem(id, counts) {
  const detail = await call(getDetail, 'GET', `/api/verification/orders/${id}`, { cookie: verifier, ctx: ctx(id) });
  const { order } = await detail.json();
  const list = order.items
    .filter((i) => counts[i.name] !== undefined)
    .map((i) => ({ componentId: i.componentId, actualQty: counts[i.name] }));
  if (list.length === 0) return;
  const res = await call(saveCounts, 'PUT', `/api/verification/orders/${id}/counts`, {
    cookie: verifier,
    body: { counts: list },
    ctx: ctx(id),
  });
  expect(res.status).toBe(200);
}

const GOOD = {
  'Front Body Panel': 50,
  'Back Body Panel': 50,
  'Sleeves (Left & Right)': 100,
  'Collar & Stand': 50,
  'Sleeve Cuffs': 103,
};
const SHORT = { ...GOOD, 'Sleeves (Left & Right)': 98 };

const doReject = (id, body = { rejectionNote: '2 sleeves short' }) =>
  call(reject, 'POST', `/api/verification/orders/${id}/reject`, { cookie: verifier, body, ctx: ctx(id) });
const doApprove = (id, body) =>
  call(approve, 'POST', `/api/verification/orders/${id}/approve`, { cookie: verifier, body, ctx: ctx(id) });
const doResubmit = (id, cookie = supervisor, body) =>
  call(resubmit, 'POST', `/api/orders/${id}/resubmit`, { cookie, body, ctx: ctx(id) });
const statusOf = async (id) =>
  (await db.query('SELECT status FROM cutting_orders WHERE id = $1', [id])).rows[0].status;
const fabricOf = async (id) =>
  (
    await db.query(
      'SELECT fabric_roll_id, actual_fabric_yds::text AS yards FROM cutting_orders WHERE id = $1',
      [id],
    )
  ).rows[0];
const itemsOf = async (id) =>
  (await db.query('SELECT actual_qty, status FROM verification_items WHERE order_id = $1', [id])).rows;
const decisionsOf = async (id) =>
  (await db.query('SELECT decision FROM verification_logs WHERE order_id = $1 ORDER BY id', [id])).rows.map(
    (r) => r.decision,
  );

async function rejectedOrder() {
  const id = await newOrder();
  await countThem(id, SHORT);
  expect((await doReject(id)).status).toBe(200);
  return id;
}

describe('POST /api/orders/[id]/resubmit', () => {
  it('sends the same order back to QC with new fabric details, wipes the counts, keeps the REJECTED log', async () => {
    const id = await rejectedOrder();
    const res = await doResubmit(id, supervisor, { fabricRollId: 'FAB-2', actualFabricYards: 96 });
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ id, status: 'PENDING_VERIFICATION' });
    expect(await statusOf(id)).toBe('PENDING_VERIFICATION');
    expect(await fabricOf(id)).toEqual({ fabric_roll_id: 'FAB-2', yards: '96.00' });
    const items = await itemsOf(id);
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.actual_qty === null && i.status === null)).toBe(true);
    expect(await decisionsOf(id)).toEqual(['REJECTED']);
  });

  it('works with no body at all (fabric details unchanged)', async () => {
    const id = await rejectedOrder();
    expect((await doResubmit(id)).status).toBe(200);
    expect(await fabricOf(id)).toEqual({ fabric_roll_id: 'FAB-1', yards: '94.00' });
    expect(await statusOf(id)).toBe('PENDING_VERIFICATION');
  });

  it('rejects decimal, negative, zero, text and empty values with 422 and changes nothing', async () => {
    const id = await rejectedOrder();
    const bad = [
      { actualFabricYards: 94.5 },
      { actualFabricYards: -3 },
      { actualFabricYards: 0 },
      { actualFabricYards: '96' },
      { actualFabricYards: 1e9 },
      { fabricRollId: '   ' },
      { fabricRollId: 7 },
    ];
    for (const body of bad) {
      expect((await doResubmit(id, supervisor, body)).status, JSON.stringify(body)).toBe(422);
      expect(await statusOf(id)).toBe('REJECTED');
    }
    expect((await doResubmit(id, supervisor, '{bad')).status).toBe(400);
    expect(await fabricOf(id)).toEqual({ fabric_roll_id: 'FAB-1', yards: '94.00' });
  });

  it('anonymous gets 401, verifier and sewing get 403, and the order stays REJECTED', async () => {
    const id = await rejectedOrder();
    expect((await doResubmit(id, null)).status).toBe(401);
    expect((await doResubmit(id, verifier)).status).toBe(403);
    expect((await doResubmit(id, sewing)).status).toBe(403);
    expect(await statusOf(id)).toBe('REJECTED');
  });

  it('409 unless the order is REJECTED, and 404 for unknown ids', async () => {
    const pending = await newOrder();
    expect((await doResubmit(pending)).status).toBe(409);

    const draft = await newOrder({ submitIt: false });
    expect((await doResubmit(draft)).status).toBe(409);

    const verified = await newOrder();
    await countThem(verified, GOOD);
    expect((await doApprove(verified)).status).toBe(200);
    expect((await doResubmit(verified)).status).toBe(409);
    expect(await statusOf(verified)).toBe('VERIFIED');

    expect((await doResubmit('999999')).status).toBe(404);
    expect((await doResubmit('abc')).status).toBe(404);
  });

  it('the whole story: RED blocked, rejected, re-cut and resubmitted, recounted, approved, history kept', async () => {
    const id = await newOrder();
    await countThem(id, SHORT);
    expect((await doApprove(id)).status).toBe(422);
    expect((await doReject(id, { rejectionNote: 'Sleeves short by 2' })).status).toBe(200);
    expect((await doResubmit(id, supervisor, { actualFabricYards: 95 })).status).toBe(200);

    await countThem(id, GOOD);
    const res = await doApprove(id, { acknowledgedOverCap: true }); // 95 yds is 5.56% against a 5% cap
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ status: 'VERIFIED', wastagePct: 5.56, overCap: true });
    expect(await statusOf(id)).toBe('VERIFIED');
    expect(await decisionsOf(id)).toEqual(['REJECTED', 'APPROVED']);
  });
});