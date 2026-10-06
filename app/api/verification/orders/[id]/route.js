import { withGuard } from '../../../../../lib/guard.js';
import { query } from '../../../../../lib/db.js';
import { json } from '../../../../../lib/http.js';
import {
  loadVerificationDetail,
  parseOrderId,
} from '../../../../../lib/services/verificationDetail.js';

export const runtime = 'nodejs';

export const GET = withGuard(
  'GET /api/verification/orders/[id]',
  async (_request, { params }) => {
    const order = await loadVerificationDetail(
      query,
      parseOrderId(params.id),
    );

    return json({ order });
  },
);