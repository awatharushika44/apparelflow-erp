import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupApi,
  teardownApi,
  cookieFor,
  call,
} from './helpers/api.js';

import { POST as createOrder } from '../app/api/orders/route.js';
import { POST as submit } from '../app/api/orders/[id]/submit/route.js';
import { GET as getDetail } from '../app/api/verification/orders/[id]/route.js';
import { PUT as saveCounts } from '../app/api/verification/orders/[id]/counts/route.js';
import { POST as approve } from '../app/api/verification/orders/[id]/approve/route.js';

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

const ctx = (id) => ({
  params: Promise.resolve({ id }),
});

const orderBody = {
  recipeCode: 'REC-BL01',
  targetQty: 50,
  fabricRollId: 'FAB-1',
  actualFabricYards: 94,
};

async function newOrder({
  submitIt = true,
  ...overrides
} = {}) {
  const created = await call(
    createOrder,
    'POST',
    '/api/orders',
    {
      cookie: supervisor,
      body: {
        ...orderBody,
        ...overrides,
      },
    },
  );

  const id = (await created.json()).order.id;

  if (submitIt) {
    await call(
      submit,
      'POST',
      `/api/orders/${id}/submit`,
      {
        cookie: supervisor,
        ctx: ctx(id),
      },
    );
  }

  return id;
}

// 50 Blouses expect:
// 50 / 50 / 100 / 50 / 100
//
// Cuffs = 103 is YELLOW.
// Everything else is GREEN.
const GOOD = {
  'Front Body Panel': 50,
  'Back Body Panel': 50,
  'Sleeves (Left & Right)': 100,
  'Collar & Stand': 50,
  'Sleeve Cuffs': 103,
};

async function countThem(id, counts) {
  const detail = await call(
    getDetail,
    'GET',
    `/api/verification/orders/${id}`,
    {
      cookie: verifier,
      ctx: ctx(id),
    },
  );

  const { order } = await detail.json();

  const list = order.items
    .filter(
      (i) => counts[i.name] !== undefined,
    )
    .map((i) => ({
      componentId: i.componentId,
      actualQty: counts[i.name],
    }));

  if (list.length === 0) {
    return;
  }

  const res = await call(
    saveCounts,
    'PUT',
    `/api/verification/orders/${id}/counts`,
    {
      cookie: verifier,
      body: {
        counts: list,
      },
      ctx: ctx(id),
    },
  );

  expect(res.status).toBe(200);
}

const doApprove = (
  id,
  cookie = verifier,
  body,
) =>
  call(
    approve,
    'POST',
    `/api/verification/orders/${id}/approve`,
    {
      cookie,
      body,
      ctx: ctx(id),
    },
  );

const statusOf = async (id) =>
  (
    await db.query(
      'SELECT status FROM cutting_orders WHERE id = $1',
      [id],
    )
  ).rows[0].status;

const logsOf = async (id) =>
  (
    await db.query(
      `SELECT
         l.decision,
         u.email,
         l.audit_note,
         l.wastage_pct::text AS wastage_pct,
         l.expected_fabric_yds::text AS expected_yards,
         l.wastage_over_cap,
         l.acknowledged_over_cap,
         l.items_snapshot,
         (l.decided_at > now() - interval '1 minute') AS fresh
       FROM verification_logs l
       JOIN users u ON u.id = l.verifier_id
       WHERE l.order_id = $1`,
      [id],
    )
  ).rows;

const blockersOf = async (res) =>
  (await res.json()).error.details.blockers;

describe(
  'POST /api/verification/orders/[id]/approve',
  () => {
    it(
      'T1: GREEN plus YELLOW is approved, and the audit row is written',
      async () => {
        const id = await newOrder();

        await countThem(id, GOOD);

        const res = await doApprove(id);

        expect(res.status).toBe(200);

        expect(
          (await res.json()).order,
        ).toMatchObject({
          status: 'VERIFIED',
          wastagePct: 4.44,
          overCap: false,
        });

        expect(await statusOf(id)).toBe(
          'VERIFIED',
        );

        const logs = await logsOf(id);

        expect(logs).toHaveLength(1);

        expect(logs[0]).toMatchObject({
          decision: 'APPROVED',
          email: 'ver@test.local',
          wastage_pct: '4.44',
          expected_yards: '90.00',
          wastage_over_cap: false,
          acknowledged_over_cap: false,
          audit_note: null,
          fresh: true,
        });

        expect(
          logs[0].items_snapshot,
        ).toHaveLength(5);

        expect(
          logs[0].items_snapshot.find(
            (i) =>
              i.component === 'Sleeve Cuffs',
          ),
        ).toMatchObject({
          expected: 100,
          actual: 103,
          variance: 3,
          light: 'YELLOW',
        });
      },
    );

    it(
      'T2: one RED component blocks approval with 422 and writes nothing',
      async () => {
        const id = await newOrder();

        await countThem(id, {
          ...GOOD,
          'Sleeves (Left & Right)': 98,
        });

        const res = await doApprove(id);

        expect(res.status).toBe(422);

        const blockers = await blockersOf(res);

        expect(blockers).toHaveLength(1);

        expect(blockers[0]).toMatchObject({
          name: 'Sleeves (Left & Right)',
          reason: 'RED',
          expectedQty: 100,
          actualQty: 98,
        });

        expect(await statusOf(id)).toBe(
          'PENDING_VERIFICATION',
        );

        expect(await logsOf(id)).toHaveLength(0);
      },
    );

    it(
      'components that were never counted block approval with 422',
      async () => {
        const id = await newOrder();

        await countThem(id, {});

        const res = await doApprove(id);

        expect(res.status).toBe(422);

        const blockers = await blockersOf(res);

        expect(blockers).toHaveLength(5);

        expect(
          blockers.every(
            (b) => b.reason === 'UNCOUNTED',
          ),
        ).toBe(true);

        expect(await statusOf(id)).toBe(
          'PENDING_VERIFICATION',
        );

        expect(await logsOf(id)).toHaveLength(0);
      },
    );

    it(
      'a missing component row blocks approval with 422',
      async () => {
        const id = await newOrder();

        await countThem(id, GOOD);

        await db.query(
          `DELETE FROM verification_items
            WHERE order_id = $1
              AND component_id = (
                SELECT max(id)
                FROM recipe_components
              )`,
          [id],
        );

        const res = await doApprove(id);

        expect(res.status).toBe(422);

        const blockers = await blockersOf(res);

        expect(blockers).toEqual([
          expect.objectContaining({
            name: 'Sleeve Cuffs',
            reason: 'MISSING',
          }),
        ]);

        expect(await statusOf(id)).toBe(
          'PENDING_VERIFICATION',
        );
      },
    );

    it(
      'T4: anonymous gets 401, supervisor and sewing get 403, and nothing changes',
      async () => {
        const id = await newOrder();

        await countThem(id, GOOD);

        expect(
          (await doApprove(id, null)).status,
        ).toBe(401);

        expect(
          (await doApprove(id, supervisor)).status,
        ).toBe(403);

        expect(
          (await doApprove(id, sewing)).status,
        ).toBe(403);

        expect(await statusOf(id)).toBe(
          'PENDING_VERIFICATION',
        );

        expect(await logsOf(id)).toHaveLength(0);
      },
    );

    it(
      'forged verifier, status, decision and time in the body are ignored',
      async () => {
        const id = await newOrder();

        await countThem(id, GOOD);

        const res = await doApprove(
          id,
          verifier,
          {
            verifierId: '1',
            status: 'REJECTED',
            decision: 'REJECTED',
            decidedAt:
              '2000-01-01T00:00:00Z',
            wastagePct: 0,
          },
        );

        expect(res.status).toBe(200);

        const logs = await logsOf(id);

        expect(logs[0]).toMatchObject({
          decision: 'APPROVED',
          email: 'ver@test.local',
          wastage_pct: '4.44',
          fresh: true,
        });
      },
    );

    it(
      'approving twice gives 409 the second time and leaves exactly one log',
      async () => {
        const id = await newOrder();

        await countThem(id, GOOD);

        expect(
          (await doApprove(id)).status,
        ).toBe(200);

        expect(
          (await doApprove(id)).status,
        ).toBe(409);

        expect(await logsOf(id)).toHaveLength(1);
      },
    );

    it(
      'unknown ids give 404, and an order not yet submitted gives 409',
      async () => {
        expect(
          (await doApprove('999999')).status,
        ).toBe(404);

        expect(
          (await doApprove('abc')).status,
        ).toBe(404);

        const draft = await newOrder({
          submitIt: false,
        });

        expect(
          (await doApprove(draft)).status,
        ).toBe(409);

        expect(await statusOf(draft)).toBe(
          'CUTTING_IN_PROGRESS',
        );
      },
    );

    it(
      'wastage over the cap warns but does not block, and the note is stored trimmed',
      async () => {
        const id = await newOrder({
          actualFabricYards: 95,
        });

        await countThem(id, GOOD);

        const res = await doApprove(
          id,
          verifier,
          {
            auditNote:
              '  Counted twice.  ',
            acknowledgedOverCap: true,
          },
        );

        expect(res.status).toBe(200);

        expect(
          (await res.json()).order,
        ).toMatchObject({
          wastagePct: 5.56,
          overCap: true,
        });

        const logs = await logsOf(id);

        expect(logs[0]).toMatchObject({
          wastage_pct: '5.56',
          wastage_over_cap: true,
          acknowledged_over_cap: true,
          audit_note: 'Counted twice.',
        });
      },
    );

    it(
      'a bad body gives 422 (or 400 for broken JSON) and stores nothing',
      async () => {
        const id = await newOrder();

        await countThem(id, GOOD);

        for (const body of [
          { auditNote: 123 },
          { auditNote: 'x'.repeat(501) },
          { acknowledgedOverCap: 'yes' },
        ]) {
          expect(
            (
              await doApprove(
                id,
                verifier,
                body,
              )
            ).status,
            JSON.stringify(body),
          ).toBe(422);
        }

        expect(
          (
            await doApprove(
              id,
              verifier,
              '{bad',
            )
          ).status,
        ).toBe(400);

        expect(await statusOf(id)).toBe(
          'PENDING_VERIFICATION',
        );

        expect(await logsOf(id)).toHaveLength(0);
      },
    );
  },
);