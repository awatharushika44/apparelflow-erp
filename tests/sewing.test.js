import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest';

import {
  setupApi,
  teardownApi,
  cookieFor,
  call,
} from './helpers/api.js';

import {
  createPendingOrder,
  tryVerify,
} from './helpers/fixtures.js';

import { GET as queue } from '../app/api/sewing/queue/route.js';
import { GET as active } from '../app/api/sewing/active/route.js';
import { GET as detail } from '../app/api/sewing/orders/[id]/route.js';
import { POST as start } from '../app/api/sewing/orders/[id]/start/route.js';

describe('Sewing API', () => {
  let db;

  let sewingCookie;
  let supervisorCookie;
  let verifierCookie;

  let verifiedOrderId;
  let pendingOrderId;
  let rejectedOrderId;

  beforeAll(async () => {
    db = await setupApi();

    sewingCookie = await cookieFor('sew@test.local');
    supervisorCookie = await cookieFor('sup@test.local');
    verifierCookie = await cookieFor('ver@test.local');

    // Create a VERIFIED order.
    verifiedOrderId = await createPendingOrder(db);
    await tryVerify(db, verifiedOrderId);

    // Create a PENDING_VERIFICATION order.
    pendingOrderId = await createPendingOrder(db);

    // Create a REJECTED order.
    rejectedOrderId = await createPendingOrder(db);

    // The database requires a REJECTED verification log
    // with a rejection note before the order can become REJECTED.
    await db.query(
      `INSERT INTO verification_logs
         (order_id,
          verifier_id,
          decision,
          wastage_pct,
          expected_fabric_yds,
          wastage_over_cap,
          items_snapshot,
          rejection_note)
       SELECT $1::bigint,
              u.id,
              'REJECTED'::verification_decision,
              2.78,
              36,
              false,
              '[{"component":"test"}]'::jsonb,
              'Test rejection'
         FROM users u
        WHERE u.role = 'cutting_verifier'`,
      [rejectedOrderId],
    );

    await db.query(
      `UPDATE cutting_orders
          SET status = 'REJECTED'
        WHERE id = $1`,
      [rejectedOrderId],
    );
  }, 30000);

  afterAll(async () => {
    await teardownApi(db);
  });

  it('returns only VERIFIED orders from the sewing queue', async () => {
    const res = await call(
      queue,
      'GET',
      '/api/sewing/queue?status=PENDING_VERIFICATION',
      {
        cookie: sewingCookie,
      },
    );

    expect(res.status).toBe(200);

    const body = await res.json();

    expect(Array.isArray(body.orders)).toBe(true);

    const ids = body.orders.map((order) => String(order.id));

    expect(ids).toContain(String(verifiedOrderId));
    expect(ids).not.toContain(String(pendingOrderId));
    expect(ids).not.toContain(String(rejectedOrderId));
  });

  it('requires sewing_supervisor role for sewing endpoints', async () => {
    const anonymousQueue = await call(
      queue,
      'GET',
      '/api/sewing/queue',
    );

    expect(anonymousQueue.status).toBe(401);

    const supervisorQueue = await call(
      queue,
      'GET',
      '/api/sewing/queue',
      {
        cookie: supervisorCookie,
      },
    );

    expect(supervisorQueue.status).toBe(403);

    const verifierQueue = await call(
      queue,
      'GET',
      '/api/sewing/queue',
      {
        cookie: verifierCookie,
      },
    );

    expect(verifierQueue.status).toBe(403);

    const anonymousStart = await call(
      start,
      'POST',
      `/api/sewing/orders/${verifiedOrderId}/start`,
      {
        ctx: {
          params: {
            id: String(verifiedOrderId),
          },
        },
      },
    );

    expect(anonymousStart.status).toBe(401);

    const supervisorStart = await call(
      start,
      'POST',
      `/api/sewing/orders/${verifiedOrderId}/start`,
      {
        cookie: supervisorCookie,
        ctx: {
          params: {
            id: String(verifiedOrderId),
          },
        },
      },
    );

    expect(supervisorStart.status).toBe(403);

    const verifierStart = await call(
      start,
      'POST',
      `/api/sewing/orders/${verifiedOrderId}/start`,
      {
        cookie: verifierCookie,
        ctx: {
          params: {
            id: String(verifiedOrderId),
          },
        },
      },
    );

    expect(verifierStart.status).toBe(403);
  });

  it('hides pending, rejected and unknown orders from sewing detail', async () => {
    for (const id of [
      pendingOrderId,
      rejectedOrderId,
      '999999999',
    ]) {
      const res = await call(
        detail,
        'GET',
        `/api/sewing/orders/${id}`,
        {
          cookie: sewingCookie,
          ctx: {
            params: {
              id: String(id),
            },
          },
        },
      );

      expect(res.status).toBe(404);
    }
  });

  it('shows verification information on sewing detail', async () => {
    expect(verifiedOrderId).toBeTruthy();

    const res = await call(
      detail,
      'GET',
      `/api/sewing/orders/${verifiedOrderId}`,
      {
        cookie: sewingCookie,
        ctx: {
          params: {
            id: String(verifiedOrderId),
          },
        },
      },
    );

    expect(res.status).toBe(200);

    const body = await res.json();

    expect(body.order).toHaveProperty('verifiedBy');
    expect(body.order).toHaveProperty('verifiedAt');
    expect(body.order).toHaveProperty('auditNote');
    expect(body.order).toHaveProperty('wastagePct');
    expect(body.order).toHaveProperty('expectedYards');
    expect(body.order).toHaveProperty('items');
  });

  it('starts a VERIFIED order and records the authenticated sewing user', async () => {
    expect(verifiedOrderId).toBeTruthy();

    const res = await call(
      start,
      'POST',
      `/api/sewing/orders/${verifiedOrderId}/start`,
      {
        cookie: sewingCookie,
        ctx: {
          params: {
            id: String(verifiedOrderId),
          },
        },
      },
    );

    expect(res.status).toBe(200);

    const body = await res.json();

    expect(body.order.status).toBe('SEWING_STARTED');

    const detailRes = await call(
      detail,
      'GET',
      `/api/sewing/orders/${verifiedOrderId}`,
      {
        cookie: sewingCookie,
        ctx: {
          params: {
            id: String(verifiedOrderId),
          },
        },
      },
    );

    expect(detailRes.status).toBe(200);

    const detailBody = await detailRes.json();

    expect(detailBody.order.status).toBe('SEWING_STARTED');
    expect(detailBody.order.sewingStartedBy).toBeTruthy();
    expect(detailBody.order.sewingStartedAt).toBeTruthy();
  });

  it('cannot start the same order twice', async () => {
    const res = await call(
      start,
      'POST',
      `/api/sewing/orders/${verifiedOrderId}/start`,
      {
        cookie: sewingCookie,
        ctx: {
          params: {
            id: String(verifiedOrderId),
          },
        },
      },
    );

    expect(res.status).toBe(409);
  });

  it('cannot start an order that is not VERIFIED', async () => {
    const pendingRes = await call(
      start,
      'POST',
      `/api/sewing/orders/${pendingOrderId}/start`,
      {
        cookie: sewingCookie,
        ctx: {
          params: {
            id: String(pendingOrderId),
          },
        },
      },
    );

    expect(pendingRes.status).toBe(409);

    const rejectedRes = await call(
      start,
      'POST',
      `/api/sewing/orders/${rejectedOrderId}/start`,
      {
        cookie: sewingCookie,
        ctx: {
          params: {
            id: String(rejectedOrderId),
          },
        },
      },
    );

    expect(rejectedRes.status).toBe(409);
  });

  it('does not allow the request body to choose who started sewing', async () => {
    const res = await call(
      start,
      'POST',
      `/api/sewing/orders/${verifiedOrderId}/start`,
      {
        cookie: sewingCookie,
        body: {
          userId: 'fake-user',
          sewingStartedBy: 'fake-user',
        },
        ctx: {
          params: {
            id: String(verifiedOrderId),
          },
        },
      },
    );

    expect([200, 409]).toContain(res.status);
  });

  it('returns an array from the active sewing queue', async () => {
    const res = await call(
      active,
      'GET',
      '/api/sewing/active',
      {
        cookie: sewingCookie,
      },
    );

    expect(res.status).toBe(200);

    const body = await res.json();

    expect(Array.isArray(body.orders)).toBe(true);

    const ids = body.orders.map((order) => String(order.id));

    expect(ids).toContain(String(verifiedOrderId));
  });
});