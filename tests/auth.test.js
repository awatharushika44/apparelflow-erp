import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { setTestAdapter } from '../lib/db.js';
import { POST as login } from '../app/api/auth/login/route.js';
import { GET as me } from '../app/api/auth/me/route.js';

process.env.JWT_SECRET = 'test-secret-' + 'x'.repeat(40);

const BASE = 'http://localhost';
const PW = 'Verify@2026';

const post = (path, body, headers = {}) =>
  new Request(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const meRequest = (cookie) =>
  new Request(BASE + '/api/auth/me', {
    headers: cookie ? { cookie } : {},
  });

const loginAs = (email, password) =>
  login(post('/api/auth/login', { email, password }));

const cookieFrom = (res) =>
  res.headers.get('set-cookie').split(';')[0];

let db;

beforeAll(async () => {
  db = await createTestDb();

  setTestAdapter({
    query: (text, params) => db.query(text, params),
    withTx: (fn) => db.transaction(fn),
  });

  const hash = bcrypt.hashSync(PW, 4);

  await db.query(
    `INSERT INTO users (email, password_hash, role, full_name) VALUES
      ('sup@test.local', $1, 'cutting_supervisor', 'Test Supervisor'),
      ('ver@test.local', $1, 'cutting_verifier',   'Test Verifier'),
      ('sew@test.local', $1, 'sewing_supervisor',  'Test Sewing')`,
    [hash],
  );
}, 30000);

afterAll(async () => {
  setTestAdapter(null);
  await db.close();
});

describe('login', () => {
  it('correct password gives 200, a safe cookie and no password hash', async () => {
    const res = await loginAs('ver@test.local', PW);

    expect(res.status).toBe(200);

    const cookie = res.headers.get('set-cookie');

    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const body = await res.json();

    expect(body.user.role).toBe('cutting_verifier');
    expect(JSON.stringify(body)).not.toMatch(/password/i);
  });

  it('wrong password gives 401', async () => {
    const res = await loginAs('ver@test.local', 'nope');

    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('unknown email gives the same 401 message as a wrong password', async () => {
    const wrongPw = await (await loginAs('ver@test.local', 'nope')).json();

    const noUser = await loginAs('ghost@test.local', 'nope');

    expect(noUser.status).toBe(401);
    expect((await noUser.json()).error.message).toBe(
      wrongPw.error.message,
    );
  });

  it('empty fields give 422', async () => {
    const res = await loginAs('', '');

    expect(res.status).toBe(422);
  });

  it('broken JSON gives 400', async () => {
    const res = await login(post('/api/auth/login', '{bad'));

    expect(res.status).toBe(400);
  });

  it('a request from a foreign Origin gives 403', async () => {
    const res = await login(
      post(
        '/api/auth/login',
        { email: 'ver@test.local', password: PW },
        { origin: 'https://evil.example' },
      ),
    );

    expect(res.status).toBe(403);
  });
});

describe('session', () => {
  it('/me without a cookie gives 401', async () => {
    expect((await me(meRequest(null))).status).toBe(401);
  });

  it('/me with a valid cookie returns the user', async () => {
    const cookie = cookieFrom(
      await loginAs('sew@test.local', PW),
    );

    const res = await me(meRequest(cookie));

    expect(res.status).toBe(200);
    expect((await res.json()).user.role).toBe('sewing_supervisor');
  });

  it('a garbage cookie gives 401', async () => {
    expect(
      (await me(meRequest('af_session=abc.def.ghi'))).status,
    ).toBe(401);
  });

  it('a token signed with the wrong secret gives 401', async () => {
    const forged = jwt.sign(
      { sub: '1' },
      'a-completely-different-secret-value-123',
    );

    expect(
      (await me(meRequest(`af_session=${forged}`))).status,
    ).toBe(401);
  });

  it('the role comes from the database, not from the token', async () => {
    const cookie = cookieFrom(
      await loginAs('sup@test.local', PW),
    );

    expect(
      (await (await me(meRequest(cookie))).json()).user.role,
    ).toBe('cutting_supervisor');

    await db.query(
      `UPDATE users
          SET role = 'sewing_supervisor'
        WHERE email = 'sup@test.local'`,
    );

    expect(
      (await (await me(meRequest(cookie))).json()).user.role,
    ).toBe('sewing_supervisor');
  });
});