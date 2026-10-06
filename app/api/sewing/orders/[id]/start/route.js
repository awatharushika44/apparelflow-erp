import { withGuard } from '../../../../../../lib/guard.js';
import { json } from '../../../../../../lib/http.js';
import { startSewing } from '../../../../../../lib/services/sewing.js';

export const runtime = 'nodejs';

export const POST = withGuard(
  'POST /api/sewing/orders/[id]/start',
  async (request, { user, params }) =>
    json({
      order: await startSewing({
        orderId: params.id,
        user,
      }),
    }),
);
