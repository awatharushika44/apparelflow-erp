import { withGuard } from '../../../lib/guard.js';
import { json, parseBody } from '../../../lib/http.js';
import { createOrderSchema } from '../../../lib/validation/schemas.js';
import { createOrder } from '../../../lib/services/createOrder.js';

export const runtime = 'nodejs';

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