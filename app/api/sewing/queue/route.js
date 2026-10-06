import { withGuard } from '../../../../lib/guard.js';
import { json } from '../../../../lib/http.js';
import { listQueue } from '../../../../lib/services/sewing.js';

export const runtime = 'nodejs';

export const GET = withGuard(
  'GET /api/sewing/queue',
  async () => json({ orders: await listQueue() }),
);
