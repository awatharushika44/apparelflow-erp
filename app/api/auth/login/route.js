import bcrypt from 'bcryptjs';
import { withGuard } from '../../../../lib/guard.js';
import { query } from '../../../../lib/db.js';
import { HttpError, json, parseBody } from '../../../../lib/http.js';
import { loginSchema } from '../../../../lib/validation/schemas.js';
import {
  signSession,
  sessionCookie,
  toPublicUser,
} from '../../../../lib/auth/session.js';

export const runtime = 'nodejs';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export const POST = withGuard(
  'POST /api/auth/login',
  async (request) => {
    const { email, password } = await parseBody(
      request,
      loginSchema,
    );

    const { rows } = await query(
      `SELECT id, email, role, full_name, password_hash
       FROM users
       WHERE email = $1`,
      [email],
    );

    const row = rows[0];

    const ok = await bcrypt.compare(
      password,
      row ? row.password_hash : DUMMY_HASH,
    );

    if (!row || !ok) {
      throw new HttpError(
        401,
        'BAD_CREDENTIALS',
        'Invalid email or password.',
      );
    }

    return json(
      {
        user: toPublicUser(row),
      },
      200,
      {
        'Set-Cookie': sessionCookie(
          signSession(row.id),
        ),
      },
    );
  },
);