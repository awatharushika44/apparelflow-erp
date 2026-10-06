import { withTx } from '../db.js';
import { HttpError } from '../http.js';
import { trafficLight } from '../domain/trafficLight.js';
import {
  loadVerificationDetail,
  parseOrderId,
} from './verificationDetail.js';

// One transaction:
// 1. Lock the order
// 2. Check its state
// 3. Check every component
// 4. Save all counts
// 5. Recalculate the lights
//
// If anything fails, the whole transaction rolls back.
export async function saveCounts({ orderId, counts }) {
  const id = parseOrderId(orderId);

  // Prevent the same component appearing twice in one request.
  const ids = counts.map((c) => c.componentId);

  if (new Set(ids).size !== ids.length) {
    throw new HttpError(
      422,
      'DUPLICATE_COMPONENT',
      'Each component may appear only once.',
      {
        counts: ['Duplicate component'],
      },
    );
  }

  return withTx(async (client) => {
    const run = client.query.bind(client);

    // Lock the order so two verifier requests cannot modify it
    // at the same time.
    const { rows } = await run(
      'SELECT status FROM cutting_orders WHERE id = $1 FOR UPDATE',
      [id],
    );

    if (!rows[0]) {
      throw new HttpError(
        404,
        'NOT_FOUND',
        'Order not found.',
      );
    }

    if (rows[0].status !== 'PENDING_VERIFICATION') {
      throw new HttpError(
        409,
        'ILLEGAL_STATE',
        `Counts can only be saved while PENDING_VERIFICATION (it is ${rows[0].status}).`,
      );
    }

    // Load the components that actually belong to this order.
    const { rows: items } = await run(
      `SELECT component_id::text AS "componentId",
              expected_qty AS "expectedQty"
         FROM verification_items
        WHERE order_id = $1`,
      [id],
    );

    const expected = new Map(
      items.map((item) => [
        item.componentId,
        item.expectedQty,
      ]),
    );

    // Make sure every submitted component belongs to this order.
    for (const c of counts) {
      if (!expected.has(c.componentId)) {
        throw new HttpError(
          422,
          'UNKNOWN_COMPONENT',
          'A component does not belong to this order.',
          {
            counts: [`Unknown component ${c.componentId}`],
          },
        );
      }
    }

    // Save every count.
    //
    // The server calculates the traffic light itself.
    // A status supplied by the browser is never used.
    for (const c of counts) {
      await run(
        `UPDATE verification_items
            SET actual_qty = $1,
                status = $2
          WHERE order_id = $3
            AND component_id = $4`,
        [
          c.actualQty,
          trafficLight(
            expected.get(c.componentId),
            c.actualQty,
          ),
          id,
          c.componentId,
        ],
      );
    }

    // Return the complete verification detail with
    // lights recalculated from the saved counts.
    return loadVerificationDetail(run, id);
  });
}