import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupApi, teardownApi, cookieFor, call } from './helpers/api.js';
import { POST as createOrder } from '../app/api/orders/route.js';
import { POST as submit } from '../app/api/orders/[id]/submit/route.js';
import { GET as getDetail } from '../app/api/verification/orders/[id]/route.js';
import { PUT as saveCounts } from '../app/api/verification/orders/[id]/counts/route.js';
import { POST as approve } from '../app/api/verification/orders/[id]/approve/route.js';
import { POST as reject } from '../app/api/verification/orders/[id]/reject/route.js';
import { rejectOrder } from '../lib/services/rejectOrder.js';

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

// counts is { componentName: quantity }. Components not listed stay uncounted.
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

// 50 Blouses expect 50 / 50 / 100 / 50 / 100. Cuffs 103 is YELLOW, the rest GREEN.
const GOOD = {
  'Front Body Panel': 50,
  'Back Body Panel': 50,
  'Sleeves (Left & Right)': 100,
  'Collar & Stand': 50,
  'Sleeve Cuffs': 103,
};
const SHORT = { ...GOOD, 'Sleeves (Left & Right)': 98 };

const doReject = (id, cookie = verifier, body) =>
  call(reject, 'POST', `/api/verification/orders/${id}/reject`, { cookie, body, ctx: ctx(id) });
const doApprove = (id, cookie = verifier, body) =>
  call(approve, 'POST', `/api/verification/orders/${id}/approve`, { cookie, body, ctx: ctx(id) });
const statusOf = async (id) =>
  (await db.query('SELECT status FROM cutting_orders WHERE id = $1', [id])).rows[0].status;
const logsOf = async (id) =>
  (
    await db.query(
      `SELECT l.decision, u.email, l.rejection_note, l.audit_note, l.wastage_pct::text AS wastage_pct,
              l.items_snapshot, (l.decided_at > now() - interval '1 minute') AS fresh
         FROM verification_logs l JOIN users u ON u.id = l.verifier_id
        WHERE l.order_id = $1 ORDER BY l.id`,
      [id],
    )
  ).rows;

describe('POST /api/verification/orders/[id]/reject', () => {
  it('T3: a missing, empty, blank or non-text note gives 422 and nothing changes', async () => {
    const id = await newOrder();
    await countThem(id, SHORT);
    const bad = [undefined, {}, { rejectionNote: '' }, { rejectionNote: '   ' }, { rejectionNote: 5 }, { rejectionNote: 'x'.repeat(501) }];
    for (const body of bad) {
      const res = await doReject(id, verifier, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await statusOf(id)).toBe('PENDING_VERIFICATION');
      expect(await logsOf(id)).toHaveLength(0);
    }
    // the error names the field, so the UI can show it inline
    const none = await doReject(id, verifier);
    expect((await none.json()).error.details).toHaveProperty('rejectionNote');
    // broken JSON is a different mistake: 400
    expect((await doReject(id, verifier, '{bad')).status).toBe(400);
  });

  it('a verifier can reject with a note: REJECTED log with a snapshot, verifier from the session', async () => {
    const id = await newOrder();
    await countThem(id, SHORT);
    const res = await doReject(id, verifier, { rejectionNote: '  2 sleeves short  ' });
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ status: 'REJECTED' });
    expect(await statusOf(id)).toBe('REJECTED');

    const logs = await logsOf(id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      decision: 'REJECTED',
      email: 'ver@test.local',
      rejection_note: '2 sleeves short',
      audit_note: null,
      wastage_pct: '4.44',
      fresh: true,
    });
    expect(logs[0].items_snapshot).toHaveLength(5);
    expect(logs[0].items_snapshot.find((i) => i.component === 'Sleeves (Left & Right)')).toMatchObject({
      expected: 100, actual: 98, variance: -2, light: 'RED',
    });
  });

  it('a batch where nothing was counted can still be rejected (the snapshot keeps nulls)', async () => {
    const id = await newOrder();
    const res = await doReject(id, verifier, { rejectionNote: 'Bundles damaged in transit' });
    expect(res.status).toBe(200);
    const [log] = await logsOf(id);
    expect(log.items_snapshot.every((i) => i.actual === null && i.light === null)).toBe(true);
  });

  it('T4 for reject: anonymous gets 401, supervisor and sewing get 403, and nothing changes', async () => {
    const id = await newOrder();
    const body = { rejectionNote: 'Short' };
    expect((await doReject(id, null, body)).status).toBe(401);
    expect((await doReject(id, supervisor, body)).status).toBe(403);
    expect((await doReject(id, sewing, body)).status).toBe(403);
    expect(await statusOf(id)).toBe('PENDING_VERIFICATION');
    expect(await logsOf(id)).toHaveLength(0);
  });

  it('forged verifier, decision, status and time in the body are ignored', async () => {
    const id = await newOrder();
    const res = await doReject(id, verifier, {
      rejectionNote: 'Short',
      verifierId: '1',
      decision: 'APPROVED',
      status: 'VERIFIED',
      decidedAt: '2000-01-01T00:00:00Z',
    });
    expect(res.status).toBe(200);
    expect(await statusOf(id)).toBe('REJECTED');
    const [log] = await logsOf(id);
    expect(log).toMatchObject({ decision: 'REJECTED', email: 'ver@test.local', fresh: true });
  });

  it('409 unless the order is pending, 404 for unknown ids, and nothing extra is written', async () => {
    const draft = await newOrder({ submitIt: false });
    expect((await doReject(draft, verifier, { rejectionNote: 'x' })).status).toBe(409);

    const twice = await newOrder();
    expect((await doReject(twice, verifier, { rejectionNote: 'first' })).status).toBe(200);
    expect((await doReject(twice, verifier, { rejectionNote: 'second' })).status).toBe(409);
    expect(await logsOf(twice)).toHaveLength(1);

    const approved = await newOrder();
    await countThem(approved, GOOD);
    expect((await doApprove(approved)).status).toBe(200);
    expect((await doReject(approved, verifier, { rejectionNote: 'too late' })).status).toBe(409);
    expect(await statusOf(approved)).toBe('VERIFIED');

    expect((await doReject('999999', verifier, { rejectionNote: 'x' })).status).toBe(404);
    expect((await doReject('abc', verifier, { rejectionNote: 'x' })).status).toBe(404);
  });
});

describe('the second line of defence', () => {
  it('layer 2: if route validation were bypassed, the database refuses a blank note and nothing is saved', async () => {
    const id = await newOrder();
    const { rows } = await db.query(`SELECT id::text AS id FROM users WHERE email = 'ver@test.local'`);
    await expect(
      rejectOrder({ orderId: id, user: { id: rows[0].id }, rejectionNote: '   ' }),
    ).rejects.toThrow(/logs_rejection_note_required/);
    expect(await statusOf(id)).toBe('PENDING_VERIFICATION');
    expect(await logsOf(id)).toHaveLength(0);
  });

  it('rollback proof: if the service guard were bypassed, the database refuses VERIFIED and the log row disappears', async () => {
    const id = await newOrder(); // nothing counted
    const { rows } = await db.query(`SELECT id::text AS id FROM users WHERE email = 'ver@test.local'`);
    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO verification_logs
             (order_id, verifier_id, decision, wastage_pct, expected_fabric_yds, wastage_over_cap, items_snapshot)
           VALUES ($1::bigint, $2::bigint, 'APPROVED', 4.44, 90, false, '[{"component":"x"}]'::jsonb)`,
          [id, rows[0].id],
        );
        await tx.query(`UPDATE cutting_orders SET status = 'VERIFIED' WHERE id = $1`, [id]);
      }),
    ).rejects.toThrow(/hard stop: 5 component\(s\) are RED or uncounted/);
    expect(await logsOf(id)).toHaveLength(0);
    expect(await statusOf(id)).toBe('PENDING_VERIFICATION');
  });
});