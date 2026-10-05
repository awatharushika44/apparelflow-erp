import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

export async function GET(request) {
  const raw = request.headers.get('cookie') ?? '';
  const token = raw
    .split('; ')
    .find((c) => c.startsWith('af_session='))
    ?.slice('af_session='.length);

  if (!token) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  try {
    const { sub } = jwt.verify(token, process.env.JWT_SECRET);
    return Response.json({ userId: sub });
  } catch {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }
}