import { withGuard } from '../../../../lib/guard.js';
import { json } from '../../../../lib/http.js';
import { listActive } from '../../../../lib/services/sewing.js';

export const runtime = 'nodejs';

export const GET = withGuard(
  'GET /api/sewing/active',
  async () => json({ orders: await listActive() }),
);
