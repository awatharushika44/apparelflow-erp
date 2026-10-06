import { HttpError } from '../http.js';
import { trafficLight, blockingComponents } from '../domain/trafficLight.js';

export function parseOrderId(raw) {
  if (!/^\d{1,18}$/.test(String(raw))) {
    throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
  }

  return String(raw);
}

// `run` is any (sql, params) function.
// Inside a transaction, pass client.query.bind(client).
//
// Lights are RECOMPUTED here from the counts.
// The stored status column is never trusted.
export async function loadVerificationDetail(run, orderId) {
  const { rows } = await run(
    `SELECT co.id::text AS id,
            co.order_no AS "orderNo",
            co.status,
            r.recipe_code AS "recipeCode",
            r.name AS "recipeName",
            co.target_qty AS "targetQty",
            co.fabric_roll_id AS "fabricRollId",
            co.actual_fabric_yds::text AS "actualFabricYards"
       FROM cutting_orders co
       JOIN recipes r ON r.id = co.recipe_id
      WHERE co.id = $1`,
    [orderId],
  );

  const order = rows[0];

  if (!order || order.status !== 'PENDING_VERIFICATION') {
    throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
  }

  const { rows: items } = await run(
    `SELECT rc.id::text AS "componentId",
            rc.component_name AS name,
            rc.image_url AS "imageUrl",
            vi.expected_qty AS "expectedQty",
            vi.actual_qty AS "actualQty"
       FROM verification_items vi
       JOIN recipe_components rc ON rc.id = vi.component_id
      WHERE vi.order_id = $1
      ORDER BY rc.id`,
    [orderId],
  );

  // IMPORTANT:
  // The server calculates the light from expected + actual.
  // It does NOT trust vi.status.
  const withLights = items.map((item) => ({
    ...item,
    light: trafficLight(item.expectedQty, item.actualQty),
  }));

  const blockers = blockingComponents(withLights);

  return {
    ...order,
    items: withLights,
    blockers,

    // Convenience value for the UI only.
    // The real approve endpoint will perform its own checks.
    canApprove:
      withLights.length > 0 &&
      blockers.length === 0,
  };
}