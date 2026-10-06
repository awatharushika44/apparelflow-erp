import bcrypt from 'bcryptjs';
import { createTestDb } from './db.js';
import { seedBasics } from './fixtures.js';
import { useTestAdapter } from '../../lib/db.js';
import { POST as login } from '../../app/api/auth/login/route.js';

process.env.JWT_SECRET = 'test-secret-' + 'x'.repeat(40);

export const PASSWORD = 'Test@2026';

const BASE = 'http://localhost';

// Creates a fresh test database with:
// - 3 users
// - the Blouse recipe
// - recipe components
export async function setupApi() {
  const db = await createTestDb();

  await seedBasics(db);

  await db.query(
    'UPDATE users SET password_hash = $1',
    [bcrypt.hashSync(PASSWORD, 4)],
  );

  useTestAdapter({
    query: (text, params) => db.query(text, params),
    withTx: (fn) => db.transaction(fn),
  });

  return db;
}

export async function teardownApi(db) {
  useTestAdapter(null);
  await db.close();
}

// Log in and return only the session cookie.
export async function cookieFor(email) {
  const res = await call(
    login,
    'POST',
    '/api/auth/login',
    {
      body: {
        email,
        password: PASSWORD,
      },
    },
  );

  return res.headers.get('set-cookie').split(';')[0];
}

// Builds a real Request and calls the route directly.
// No running Next.js server is needed.
export function call(
  handler,
  method,
  path,
  {
    cookie,
    body,
    headers = {},
    ctx,
  } = {},
) {
  const init = {
    method,
    headers: {
      ...headers,
    },
  };

  if (cookie) {
    init.headers.cookie = cookie;
  }

  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';

    init.body =
      typeof body === 'string'
        ? body
        : JSON.stringify(body);
  }

  return handler(
    new Request(BASE + path, init),
    ctx,
  );
}