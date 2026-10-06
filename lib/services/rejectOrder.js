import { withTx } from '../db.js';
import { HttpError } from '../http.js';
import { expectedPieces } from '../domain/multiplier.js';
import { trafficLight } from '../domain/trafficLight.js';
import { computeWastage } from '../domain/wastage.js';
import { parseOrderId } from './verificationDetail.js';

export async function rejectOrder({
  orderId,
  user,
  rejectionNote,
}) {
  const id = parseOrderId(orderId);

  return withTx(async (client) => {
    const run = client.query.bind(client);

    // Lock the order so approve and reject cannot both succeed.
    const { rows } = await run(
      `SELECT id, status, recipe_id, target_qty,
              actual_fabric_yds::text AS yards
         FROM cutting_orders
        WHERE id = $1
        FOR UPDATE`,
      [id],
    );

    const order = rows[0];

    if (!order) {
      throw new HttpError(
        404,
        'NOT_FOUND',
        'Order not found.',
      );
    }

    // Only orders waiting for verification can be rejected.
    if (order.status !== 'PENDING_VERIFICATION') {
      throw new HttpError(
        409,
        'ILLEGAL_TRANSITION',
        `Cannot reject an order that is ${order.status}.`,
      );
    }

    // Get recipe information for the audit snapshot.
    const { rows: recipeRows } = await run(
      `SELECT std_fabric_yards::text AS std,
              wastage_cap::text AS cap
         FROM recipes
        WHERE id = $1`,
      [order.recipe_id],
    );

    const recipe = recipeRows[0];

    const { rows: components } = await run(
      `SELECT id::text AS "componentId",
              component_name AS name,
              pieces_per_garment AS pieces
         FROM recipe_components
        WHERE recipe_id = $1
        ORDER BY id`,
      [order.recipe_id],
    );

    // Get the counts already recorded by the verifier.
    const { rows: stored } = await run(
      `SELECT component_id::text AS "componentId",
              actual_qty AS "actualQty"
         FROM verification_items
        WHERE order_id = $1`,
      [id],
    );

    const byComponent = new Map(
      stored.map((s) => [s.componentId, s]),
    );

    // Build an immutable snapshot for the audit log.
    const snapshot = components.map((component) => {
      const expected = expectedPieces(
        order.target_qty,
        component.pieces,
      );

      const row = byComponent.get(
        component.componentId,
      );

      const actual = row
        ? row.actualQty
        : null;

      return {
        component: component.name,
        expected,
        actual,
        variance:
          actual === null
            ? null
            : actual - expected,
        light:
          actual === null
            ? null
            : trafficLight(
                expected,
                actual,
              ),
      };
    });

    // Calculate the fabric information for the audit record.
    const wastage = computeWastage({
      targetQty: order.target_qty,
      stdFabricYards: recipe.std,
      wastageCap: recipe.cap,
      actualYards: order.yards,
    });

    // IMPORTANT:
    // Write the rejection audit record BEFORE changing
    // the order status. The database requires the log
    // to exist before an order becomes REJECTED.
    await run(
      `INSERT INTO verification_logs
         (order_id, verifier_id, decision,
          rejection_note, wastage_pct,
          expected_fabric_yds, wastage_over_cap,
          acknowledged_over_cap, items_snapshot)
       VALUES (
         $1, $2, 'REJECTED', $3, $4, $5,
         $6, false, $7::jsonb
       )`,
      [
        id,
        user.id,
        rejectionNote,
        String(wastage.wastagePct),
        wastage.expectedYards,
        wastage.overCap,
        JSON.stringify(snapshot),
      ],
    );

    // Now move the order into REJECTED.
    await run(
      `UPDATE cutting_orders
          SET status = 'REJECTED'
        WHERE id = $1`,
      [id],
    );

    return {
      id: String(order.id),
      status: 'REJECTED',
    };
  });
}