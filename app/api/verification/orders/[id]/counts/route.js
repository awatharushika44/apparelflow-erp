import { withGuard } from '../../../../../../lib/guard.js';
import { json, parseBody } from '../../../../../../lib/http.js';
import { saveCountsSchema } from '../../../../../../lib/validation/schemas.js';
import { saveCounts } from '../../../../../../lib/services/saveCounts.js';

export const runtime = 'nodejs';

export const PUT = withGuard(
  'PUT /api/verification/orders/[id]/counts',
  async (request, { params }) => {
    const input = await parseBody(
      request,
      saveCountsSchema,
    );

    const order = await saveCounts({
      orderId: params.id,
      counts: input.counts,
    });

    return json({ order });
  },
);