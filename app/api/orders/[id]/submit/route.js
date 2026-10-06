import { withGuard } from '../../../../../lib/guard.js';
import { json } from '../../../../../lib/http.js';
import { submitOrder } from '../../../../../lib/services/submitOrder.js';

export const runtime = 'nodejs';

export const POST = withGuard('POST /api/orders/[id]/submit', async (_request, { params }) => {
  const order = await submitOrder({ orderId: params.id });
  return json({ order });
});