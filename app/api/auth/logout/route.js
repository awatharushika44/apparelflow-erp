import { withGuard } from '../../../../lib/guard.js';
import { json } from '../../../../lib/http.js';
import { clearCookie } from '../../../../lib/auth/session.js';

export const runtime = 'nodejs';

export const POST = withGuard(
  'POST /api/auth/logout',
  async () =>
    json(
      { ok: true },
      200,
      { 'Set-Cookie': clearCookie() },
    ),
);