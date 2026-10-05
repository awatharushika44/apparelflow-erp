import jwt from 'jsonwebtoken';
import { query } from '../db.js';

export const COOKIE_NAME = 'af_session';
const MAX_AGE_SECONDS = 8 * 60 * 60;

function secret() {
  const s = process.env.JWT_SECRET;

  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET is missing or shorter than 32 characters');
  }

  return s;
}

export const signSession = (userId) =>
  jwt.sign(
    { sub: String(userId) },
    secret(),
    {
      algorithm: 'HS256',
      expiresIn: MAX_AGE_SECONDS,
    },
  );

export function readCookie(request, name) {
  const header = request.headers.get('cookie') ?? '';

  for (const part of header.split(';')) {
    const i = part.indexOf('=');

    if (i !== -1 && part.slice(0, i).trim() === name) {
      return part.slice(i + 1).trim();
    }
  }

  return null;
}

const secureFlag = () =>
  process.env.NODE_ENV === 'production' ? '; Secure' : '';

export const sessionCookie = (token) =>
  `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secureFlag()}`;

export const clearCookie = () =>
  `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureFlag()}`;

export const toPublicUser = (row) => ({
  id: String(row.id),
  email: row.email,
  role: row.role,
  fullName: row.full_name,
});

export async function getSessionUser(request) {
  const token = readCookie(request, COOKIE_NAME);

  if (!token) return null;

  const key = secret();

  let payload;

  try {
    payload = jwt.verify(token, key, {
      algorithms: ['HS256'],
    });
  } catch {
    return null;
  }

  if (
    typeof payload.sub !== 'string' ||
    !/^\d+$/.test(payload.sub)
  ) {
    return null;
  }

  const { rows } = await query(
    'SELECT id, email, role, full_name FROM users WHERE id = $1',
    [payload.sub],
  );

  return rows[0] ? toPublicUser(rows[0]) : null;
}