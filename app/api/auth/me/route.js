import { withGuard } from '../../../../lib/guard.js';
import { json } from '../../../../lib/http.js';

export const runtime = 'nodejs';

export const GET = withGuard(
  'GET /api/auth/me',
  async (_request, { user }) =>
    json({ user }),
);