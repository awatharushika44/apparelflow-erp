import { withGuard } from '../../../../lib/guard.js';
import { query } from '../../../../lib/db.js';
import { json } from '../../../../lib/http.js';

export const runtime = 'nodejs';

export const GET = withGuard(
  'GET /api/verification/orders',
  async () => {
    const { rows } = await query(
      `SELECT co.id::text AS id,
              co.order_no AS "orderNo",
              r.name AS "recipeName",
              co.target_qty AS "targetQty",
              co.fabric_roll_id AS "fabricRollId",

              (SELECT count(*)::int
                 FROM verification_items vi
                WHERE vi.order_id = co.id) AS "componentCount",

              (SELECT count(*)::int
                 FROM verification_items vi
                WHERE vi.order_id = co.id
                  AND vi.actual_qty IS NOT NULL) AS "countedCount"

         FROM cutting_orders co
         JOIN recipes r ON r.id = co.recipe_id

        WHERE co.status = 'PENDING_VERIFICATION'

        ORDER BY co.id`,
    );

    return json({ orders: rows });
  },
);