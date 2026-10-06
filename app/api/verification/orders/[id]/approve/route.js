import { withGuard } from '../../../../../../lib/guard.js';
import {
  json,
  parseOptionalBody,
} from '../../../../../../lib/http.js';
import { approveSchema } from '../../../../../../lib/validation/schemas.js';
import { approveOrder } from '../../../../../../lib/services/approveOrder.js';

export const runtime = 'nodejs';

export const POST = withGuard(
  'POST /api/verification/orders/[id]/approve',
  async (request, { user, params }) => {
    const input = await parseOptionalBody(
      request,
      approveSchema,
    );

    const order = await approveOrder({
      orderId: params.id,
      user,
      ...input,
    });

    return json({ order });
  },
);