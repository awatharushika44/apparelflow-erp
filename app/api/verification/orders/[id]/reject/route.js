import { withGuard } from '../../../../../../lib/guard.js';
import {
  json,
  parseOptionalBody,
} from '../../../../../../lib/http.js';
import { rejectSchema } from '../../../../../../lib/validation/schemas.js';
import { rejectOrder } from '../../../../../../lib/services/rejectOrder.js';

export const runtime = 'nodejs';

export const POST = withGuard(
  'POST /api/verification/orders/[id]/reject',
  async (request, { user, params }) => {
    const input = await parseOptionalBody(
      request,
      rejectSchema,
    );

    const order = await rejectOrder({
      orderId: params.id,
      user,
      ...input,
    });

    return json({ order });
  },
);