import { withGuard } from '../../../../../lib/guard.js';
import { json } from '../../../../../lib/http.js';
import { sewingDetail } from '../../../../../lib/services/sewing.js';

export const runtime = 'nodejs';

export const GET = withGuard(
  'GET /api/sewing/orders/[id]',
  async (request, { params }) =>
    json({ order: await sewingDetail(params.id) }),
);
