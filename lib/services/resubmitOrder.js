import { withTx } from '../db.js';
import { HttpError } from '../http.js';
import { parseOrderId } from './verificationDetail.js';

export async function resubmitOrder({
  orderId,
  fabricRollId,
  actualFabricYards,
}) {
  const id = parseOrderId(orderId);

  return withTx(async (client) => {
    const run = client.query.bind(client);

    // Lock the order so two resubmissions cannot happen at once.
    const { rows } = await run(
      `SELECT id, status
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

    // Only rejected orders can be resubmitted.
    if (order.status !== 'REJECTED') {
      throw new HttpError(
        409,
        'ILLEGAL_TRANSITION',
        `Only a REJECTED order can be resubmitted (this one is ${order.status}).`,
      );
    }

    // First move the order back to PENDING_VERIFICATION.
    await run(
      `UPDATE cutting_orders
          SET status = 'PENDING_VERIFICATION',
              fabric_roll_id =
                COALESCE($2::text, fabric_roll_id),
              actual_fabric_yds =
                COALESCE($3::numeric, actual_fabric_yds)
        WHERE id = $1`,
      [
        id,
        fabricRollId ?? null,
        actualFabricYards ?? null,
      ],
    );

    // Clear the old verification counts.
    // The verifier must count the re-cut batch again.
    await run(
      `UPDATE verification_items
          SET actual_qty = NULL,
              status = NULL
        WHERE order_id = $1`,
      [id],
    );

    return {
      id: String(order.id),
      status: 'PENDING_VERIFICATION',
    };
  });
}