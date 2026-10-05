import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

export async function POST(request) {
  const { password } = await request.json();
  if (password !== 'demo') {
    return Response.json({ error: 'bad credentials' }, { status: 401 });
  }

  const token = jwt.sign({ sub: '1' }, process.env.JWT_SECRET, { expiresIn: '8h' });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookie = `af_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${secure}`;

  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie } });
}