import { withTx, query } from '../db.js';
import { HttpError } from '../http.js';
import { parseOrderId } from './verificationDetail.js';

const LIST_SQL = `
  SELECT o.id::text AS id,
         o.order_no AS "orderNo",
         r.recipe_code AS "recipeCode",
         r.name AS "recipeName",
         o.target_qty AS "targetQty",
         l.decided_at AS "verifiedAt",
         u.full_name AS "verifiedBy",
         o.sewing_started_at AS "sewingStartedAt"
    FROM cutting_orders o
    JOIN recipes r ON r.id = o.recipe_id
    JOIN verification_logs l
      ON l.order_id = o.id
     AND l.decision = 'APPROVED'
    JOIN users u ON u.id = l.verifier_id
`;

export async function listQueue() {
  const { rows } = await query(
    `${LIST_SQL}
     WHERE o.status = 'VERIFIED'
     ORDER BY l.decided_at, o.id`,
  );

  return rows;
}

export async function listActive() {
  const { rows } = await query(
    `${LIST_SQL}
     WHERE o.status = 'SEWING_STARTED'
     ORDER BY o.sewing_started_at, o.id`,
  );

  return rows;
}

export async function sewingDetail(orderId) {
  const id = parseOrderId(orderId);

  const { rows } = await query(
    `SELECT o.id::text AS id,
            o.order_no AS "orderNo",
            o.status,
            o.target_qty AS "targetQty",
            o.fabric_roll_id AS "fabricRollId",
            o.actual_fabric_yds::text AS yards,
            r.recipe_code AS "recipeCode",
            r.name AS "recipeName",
            u.full_name AS "verifiedBy",
            l.decided_at AS "verifiedAt",
            l.audit_note AS "auditNote",
            l.wastage_pct::text AS "wastagePct",
            l.expected_fabric_yds::text AS "expectedYards",
            l.wastage_over_cap AS "overCap",
            l.items_snapshot AS items,
            s.full_name AS "sewingStartedBy",
            o.sewing_started_at AS "sewingStartedAt"
       FROM cutting_orders o
       JOIN recipes r ON r.id = o.recipe_id
       JOIN verification_logs l
         ON l.order_id = o.id
        AND l.decision = 'APPROVED'
       JOIN users u ON u.id = l.verifier_id
       LEFT JOIN users s ON s.id = o.sewing_started_by
      WHERE o.id = $1
        AND o.status IN ('VERIFIED', 'SEWING_STARTED')`,
    [id],
  );

  const row = rows[0];

  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
  }

  return {
    ...row,
    actualFabricYards: Number(row.yards),
    wastagePct: Number(row.wastagePct),
    expectedYards: Number(row.expectedYards),
  };
}

export async function startSewing({ orderId, user }) {
  const id = parseOrderId(orderId);

  return withTx(async (client) => {
    const run = client.query.bind(client);

    const { rows } = await run(
      'SELECT id, status FROM cutting_orders WHERE id = $1 FOR UPDATE',
      [id],
    );

    const order = rows[0];

    if (!order) {
      throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
    }

    if (order.status !== 'VERIFIED') {
      throw new HttpError(
        409,
        'ILLEGAL_TRANSITION',
        'Only a VERIFIED order can start sewing.',
      );
    }

    await run(
      `UPDATE cutting_orders
          SET status = 'SEWING_STARTED',
              sewing_started_by = $2,
              sewing_started_at = now()
        WHERE id = $1`,
      [id, user.id],
    );

    return {
      id: String(order.id),
      status: 'SEWING_STARTED',
    };
  });
}