import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const { rows } = await query('SELECT now() AS server_time, current_user AS db_user');
  return Response.json(rows[0]);
}