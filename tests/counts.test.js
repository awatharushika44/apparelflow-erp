import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupApi, teardownApi, cookieFor, call } from './helpers/api.js';

import { POST as createOrder } from '../app/api/orders/route.js';
import { POST as submit } from '../app/api/orders/[id]/submit/route.js';

import { GET as listPending } from '../app/api/verification/orders/route.js';
import { GET as getDetail } from '../app/api/verification/orders/[id]/route.js';
import { PUT as saveCounts } from '../app/api/verification/orders/[id]/counts/route.js';

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

async function newOrder({ submitIt = true } = {}) {
  const created = await call(
    createOrder,
    'POST',
    '/api/orders',
    {
      cookie: supervisor,
      body: orderBody,
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

const detail = (id, cookie = verifier) =>
  call(
    getDetail,
    'GET',
    `/api/verification/orders/${id}`,
    {
      cookie,
      ctx: ctx(id),
    },
  );

const put = (id, body, cookie = verifier) =>
  call(
    saveCounts,
    'PUT',
    `/api/verification/orders/${id}/counts`,
    {
      cookie,
      body,
      ctx: ctx(id),
    },
  );

const idsByName = async (id) => {
  const { order } = await (
    await detail(id)
  ).json();

  return Object.fromEntries(
    order.items.map((item) => [
      item.name,
      item.componentId,
    ]),
  );
};

const storedCounts = async (id) =>
  (
    await db.query(
      `SELECT actual_qty
         FROM verification_items
        WHERE order_id = $1
        ORDER BY component_id`,
      [id],
    )
  ).rows.map((row) => row.actual_qty);

const FRONT = 'Front Body Panel';
const BACK = 'Back Body Panel';
const SLEEVES = 'Sleeves (Left & Right)';
const COLLAR = 'Collar & Stand';
const CUFFS = 'Sleeve Cuffs';

describe(
  'PUT /api/verification/orders/[id]/counts',
  () => {
    it(
      'saves counts and the server computes the lights (50 Blouses)',
      async () => {
        const id = await newOrder();
        const c = await idsByName(id);

        const res = await put(id, {
          counts: [
            {
              componentId: c[FRONT],
              actualQty: 50,
            },
            {
              componentId: c[BACK],
              actualQty: 50,
            },
            {
              componentId: c[SLEEVES],
              actualQty: 98,
            },
            {
              componentId: c[COLLAR],
              actualQty: 50,
            },
            {
              componentId: c[CUFFS],
              actualQty: 103,
            },
          ],
        });

        expect(res.status).toBe(200);

        const { order } = await res.json();

        expect(
          order.items.map((i) => i.light),
        ).toEqual([
          'GREEN',
          'GREEN',
          'RED',
          'GREEN',
          'YELLOW',
        ]);

        expect(order.canApprove).toBe(false);

        expect(
          order.blockers.map((b) => b.name),
        ).toEqual([SLEEVES]);
      },
    );

    it(
      'GREEN plus YELLOW does not block (canApprove is true)',
      async () => {
        const id = await newOrder();
        const c = await idsByName(id);

        const res = await put(id, {
          counts: [
            {
              componentId: c[FRONT],
              actualQty: 50,
            },
            {
              componentId: c[BACK],
              actualQty: 50,
            },
            {
              componentId: c[SLEEVES],
              actualQty: 100,
            },
            {
              componentId: c[COLLAR],
              actualQty: 50,
            },
            {
              componentId: c[CUFFS],
              actualQty: 103,
            },
          ],
        });

        expect(
          (await res.json()).order.canApprove,
        ).toBe(true);
      },
    );

    it(
      'a forged status is ignored: the server recomputes RED',
      async () => {
        const id = await newOrder();
        const c = await idsByName(id);

        const res = await put(id, {
          status: 'VERIFIED',
          counts: [
            {
              componentId: c[SLEEVES],
              actualQty: 98,
              status: 'GREEN',
            },
          ],
        });

        expect(res.status).toBe(200);

        const { order } = await res.json();

        expect(order.status).toBe(
          'PENDING_VERIFICATION',
        );

        expect(
          order.items.find(
            (i) => i.name === SLEEVES,
          ).light,
        ).toBe('RED');

        const { rows } = await db.query(
          `SELECT status
             FROM verification_items
            WHERE order_id = $1
              AND component_id = $2`,
          [id, c[SLEEVES]],
        );

        expect(rows[0].status).toBe('RED');
      },
    );

    it(
      'components never counted stay uncounted and block approval',
      async () => {
        const id = await newOrder();
        const c = await idsByName(id);

        const res = await put(id, {
          counts: [
            {
              componentId: c[FRONT],
              actualQty: 50,
            },
          ],
        });

        const { order } = await res.json();

        expect(order.canApprove).toBe(false);
        expect(order.blockers).toHaveLength(4);

        expect(
          order.blockers.every(
            (b) => b.reason === 'UNCOUNTED',
          ),
        ).toBe(true);
      },
    );

    it(
      'negative, decimal, string, null, missing and duplicate counts give 422 and store nothing',
      async () => {
        const id = await newOrder();

        const s = (await idsByName(id))[SLEEVES];

        const bad = [
          {
            counts: [
              {
                componentId: s,
                actualQty: -1,
              },
            ],
          },
          {
            counts: [
              {
                componentId: s,
                actualQty: 2.5,
              },
            ],
          },
          {
            counts: [
              {
                componentId: s,
                actualQty: '98',
              },
            ],
          },
          {
            counts: [
              {
                componentId: s,
                actualQty: null,
              },
            ],
          },
          {
            counts: [
              {
                componentId: s,
              },
            ],
          },
          {
            counts: [
              {
                componentId: s,
                actualQty: 10000001,
              },
            ],
          },
          {
            counts: [
              {
                componentId: 'abc',
                actualQty: 1,
              },
            ],
          },
          {
            counts: [],
          },
          {},
          {
            counts: [
              {
                componentId: s,
                actualQty: 1,
              },
              {
                componentId: s,
                actualQty: 2,
              },
            ],
          },
        ];

        for (const body of bad) {
          expect(
            (await put(id, body)).status,
            JSON.stringify(body),
          ).toBe(422);
        }

        expect(
          (await storedCounts(id)).every(
            (n) => n === null,
          ),
        ).toBe(true);
      },
    );

    it(
      'one unknown component rejects the whole request: nothing is saved',
      async () => {
        const id = await newOrder();

        const front = (await idsByName(id))[FRONT];

        const res = await put(id, {
          counts: [
            {
              componentId: front,
              actualQty: 50,
            },
            {
              componentId: '999999',
              actualQty: 5,
            },
          ],
        });

        expect(res.status).toBe(422);

        expect(
          (await storedCounts(id)).every(
            (n) => n === null,
          ),
        ).toBe(true);
      },
    );

    it(
      'anonymous gets 401; supervisor and sewing get 403 on every verifier endpoint',
      async () => {
        const id = await newOrder();

        const s = (await idsByName(id))[SLEEVES];

        const body = {
          counts: [
            {
              componentId: s,
              actualQty: 98,
            },
          ],
        };

        expect(
          (await put(id, body, null)).status,
        ).toBe(401);

        for (const cookie of [
          supervisor,
          sewing,
        ]) {
          expect(
            (await put(id, body, cookie)).status,
          ).toBe(403);

          expect(
            (await detail(id, cookie)).status,
          ).toBe(403);

          expect(
            (
              await call(
                listPending,
                'GET',
                '/api/verification/orders',
                { cookie },
              )
            ).status,
          ).toBe(403);
        }

        expect(
          (await storedCounts(id)).every(
            (n) => n === null,
          ),
        ).toBe(true);
      },
    );

    it(
      'a not-yet-submitted order gives 409 on save and 404 on detail; unknown ids give 404',
      async () => {
        const id = await newOrder({
          submitIt: false,
        });

        const body = {
          counts: [
            {
              componentId: '1',
              actualQty: 5,
            },
          ],
        };

        expect(
          (await put(id, body)).status,
        ).toBe(409);

        expect(
          (await detail(id)).status,
        ).toBe(404);

        expect(
          (await put('999999', body)).status,
        ).toBe(404);

        expect(
          (await detail('abc')).status,
        ).toBe(404);
      },
    );
  },
);

describe(
  'GET /api/verification/orders',
  () => {
    it(
      'lists only pending orders, with counting progress',
      async () => {
        const pending = await newOrder();

        const draft = await newOrder({
          submitIt: false,
        });

        const front = (await idsByName(pending))[FRONT];

        await put(pending, {
          counts: [
            {
              componentId: front,
              actualQty: 50,
            },
          ],
        });

        const res = await call(
          listPending,
          'GET',
          '/api/verification/orders',
          {
            cookie: verifier,
          },
        );

        expect(res.status).toBe(200);

        const { orders } = await res.json();

        const row = orders.find(
          (o) => o.id === pending,
        );

        expect(row.componentCount).toBe(5);
        expect(row.countedCount).toBe(1);

        expect(
          orders.some((o) => o.id === draft),
        ).toBe(false);
      },
    );
  },
);