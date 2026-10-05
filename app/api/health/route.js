import { withGuard } from '../../../lib/guard.js';
import { query } from '../../../lib/db.js';
import { json } from '../../../lib/http.js';

export const runtime = 'nodejs';

export const GET = withGuard(
  'GET /api/health',
  async () => {
    try {
      await query('SELECT 1');

      return json({
        status: 'ok',
        db: 'up',
      });
    } catch {
      return json(
        {
          status: 'degraded',
          db: 'down',
        },
        503,
      );
    }
  },
);