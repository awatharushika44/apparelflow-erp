import { withTx } from '../db.js';
import { HttpError } from '../http.js';
import { expectedPieces } from '../domain/multiplier.js';
import {
  trafficLight,
  blockingComponents,
} from '../domain/trafficLight.js';
import { computeWastage } from '../domain/wastage.js';
import { parseOrderId } from './verificationDetail.js';

// The whole approval is ONE transaction on ONE connection.
// The verifier is `user`, which came from the session.
// Nothing about identity or time comes from the request body.
export async function approveOrder({
  orderId,
  user,
  auditNote,
  acknowledgedOverCap,
}) {
  const id = parseOrderId(orderId);

  return withTx(async (client) => {
    const run = client.query.bind(client);

    // 1. Lock the order row.
    // A second approval waits here until the first one finishes.
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

    // 2. Only PENDING_VERIFICATION can be approved.
    // This also prevents double approval.
    if (order.status !== 'PENDING_VERIFICATION') {
      throw new HttpError(
        409,
        'ILLEGAL_TRANSITION',
        `Cannot approve an order that is ${order.status}.`,
      );
    }

    // 3. Recompute everything from stored data.
    // The stored status column is never trusted.
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

    const { rows: stored } = await run(
      `SELECT component_id::text AS "componentId",
              expected_qty AS "expectedQty",
              actual_qty AS "actualQty"
         FROM verification_items
        WHERE order_id = $1`,
      [id],
    );

    const byComponent = new Map(
      stored.map((s) => [s.componentId, s]),
    );

    const blockers = [];
    const items = [];

    for (const c of components) {
      const expectedQty = expectedPieces(
        order.target_qty,
        c.pieces,
      );

      const row = byComponent.get(c.componentId);

      if (!row) {
        blockers.push({
          name: c.name,
          reason: 'MISSING',
          expectedQty,
          actualQty: null,
        });
      } else if (row.expectedQty !== expectedQty) {
        blockers.push({
          name: c.name,
          reason: 'EXPECTED_MISMATCH',
          expectedQty,
          actualQty: row.actualQty,
        });
      } else {
        items.push({
          name: c.name,
          expectedQty,
          actualQty: row.actualQty,
        });
      }
    }

    // RED and UNCOUNTED components are blockers.
    blockers.push(...blockingComponents(items));

    // 4. THE HARD STOP.
    // Any RED, uncounted or missing component blocks approval.
    if (blockers.length > 0) {
      throw new HttpError(
        422,
        'HARD_STOP',
        `Approval blocked: ${blockers.length} component(s) are short, uncounted or missing.`,
        { blockers },
      );
    }

    // 5. Calculate wastage on the server using exact integer maths.
    // Going over the cap warns but does not block approval.
    const wastage = computeWastage({
      targetQty: order.target_qty,
      stdFabricYards: recipe.std,
      wastageCap: recipe.cap,
      actualYards: order.yards,
    });

    const snapshot = items.map((i) => ({
      component: i.name,
      expected: i.expectedQty,
      actual: i.actualQty,
      variance: i.actualQty - i.expectedQty,
      light: trafficLight(
        i.expectedQty,
        i.actualQty,
      ),
    }));

    // 6. Write the audit log FIRST.
    // The database requires an APPROVED log before VERIFIED.
    await run(
      `INSERT INTO verification_logs
         (order_id, verifier_id, decision, audit_note,
          wastage_pct, expected_fabric_yds,
          wastage_over_cap, acknowledged_over_cap,
          items_snapshot)
       VALUES (
         $1, $2, 'APPROVED', $3, $4, $5, $6, $7, $8::jsonb
       )`,
      [
        id,
        user.id,
        auditNote || null,
        String(wastage.wastagePct),
        wastage.expectedYards,
        wastage.overCap,
        acknowledgedOverCap === true,
        JSON.stringify(snapshot),
      ],
    );

    // Then move the order to VERIFIED.
    await run(
      `UPDATE cutting_orders
          SET status = 'VERIFIED'
        WHERE id = $1`,
      [id],
    );

    return {
      id: String(order.id),
      status: 'VERIFIED',
      wastagePct: wastage.wastagePct,
      expectedYards: wastage.expectedYards,
      overCap: wastage.overCap,
    };
  });
}