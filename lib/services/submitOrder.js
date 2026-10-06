import { withTx } from '../db.js';
import { HttpError } from '../http.js';

// Submit an order to QC as one atomic database transaction.
export async function submitOrder({ orderId }) {
  if (!/^\d{1,18}$/.test(String(orderId))) {
    throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
  }

  return withTx(async (client) => {
    // Lock the order so two submit requests cannot process it simultaneously.
    const { rows } = await client.query(
      'SELECT id, status FROM cutting_orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );

    const order = rows[0];

    if (!order) {
      throw new HttpError(404, 'NOT_FOUND', 'Order not found.');
    }

    // An order can only be submitted while cutting is in progress.
    if (order.status !== 'CUTTING_IN_PROGRESS') {
      throw new HttpError(
        409,
        'ILLEGAL_TRANSITION',
        `Cannot submit an order that is ${order.status}.`,
      );
    }

    // Move the order into the QC queue.
    await client.query(
      `UPDATE cutting_orders
       SET status = 'PENDING_VERIFICATION'
       WHERE id = $1`,
      [orderId],
    );

    // Create one verification item for every recipe component.
    await client.query(
      `INSERT INTO verification_items (order_id, component_id, expected_qty)
       SELECT co.id, rc.id, co.target_qty * rc.pieces_per_garment
         FROM cutting_orders co
         JOIN recipe_components rc ON rc.recipe_id = co.recipe_id
        WHERE co.id = $1`,
      [orderId],
    );

    return {
      id: String(order.id),
      status: 'PENDING_VERIFICATION',
    };
  });
}