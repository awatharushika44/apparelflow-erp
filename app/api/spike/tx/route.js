import { withTx } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(request) {
  const fail = new URL(request.url).searchParams.get('fail');

  const n = await withTx(async (client) => {
    await client.query('SELECT * FROM spike_lock WHERE id = 1 FOR UPDATE');
    await client.query('SELECT pg_sleep(2)');
    const { rows } = await client.query(
      'UPDATE spike_lock SET n = n + 1 WHERE id = 1 RETURNING n'
    );
    if (fail) throw new Error('boom');
    return rows[0].n;
  });

  return Response.json({ n });
}