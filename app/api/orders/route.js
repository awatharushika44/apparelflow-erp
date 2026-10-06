import { withGuard } from '../../../lib/guard.js';
import { json, parseBody } from '../../../lib/http.js';
import { query } from '../../../lib/db.js';
import { createOrderSchema } from '../../../lib/validation/schemas.js';
import { createOrder } from '../../../lib/services/createOrder.js';

export const runtime = 'nodejs';

export const GET = withGuard('GET /api/orders', async () => {
  const { rows } = await query(
    `SELECT co.id::text AS id,
            co.order_no AS "orderNo",
            r.recipe_code AS "recipeCode",
            r.name AS "recipeName",
            co.target_qty AS "targetQty",
            co.fabric_roll_id AS "fabricRollId",
            co.actual_fabric_yds::text AS "actualFabricYards",
            co.status,
            co.created_at AS "createdAt"
       FROM cutting_orders co
       JOIN recipes r ON r.id = co.recipe_id
      ORDER BY co.id DESC`,
  );

  return json({ orders: rows });
});

export const POST = withGuard(
  'POST /api/orders',
  async (request, { user }) => {
    const input = await parseBody(request, createOrderSchema);

    const order = await createOrder({
      user,
      ...input,
    });

    return json({ order }, 201);
  },
);