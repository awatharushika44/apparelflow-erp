import { withGuard } from '../../../../../lib/guard.js';
import {
  json,
  parseOptionalBody,
} from '../../../../../lib/http.js';
import { resubmitSchema } from '../../../../../lib/validation/schemas.js';
import { resubmitOrder } from '../../../../../lib/services/resubmitOrder.js';

export const runtime = 'nodejs';

export const POST = withGuard(
  'POST /api/orders/[id]/resubmit',
  async (request, { params }) => {
    const input = await parseOptionalBody(
      request,
      resubmitSchema,
    );

    const order = await resubmitOrder({
      orderId: params.id,
      ...input,
    });

    return json({ order });
  },
);