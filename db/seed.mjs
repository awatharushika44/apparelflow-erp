import bcrypt from 'bcryptjs';
import pg from 'pg';
import { DEMO_USERS, RECIPES, ORDERS } from './demo-data.mjs';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
await client.connect();

// Same rule as the PDF section 7.3 matrix. The database CHECK also verifies every status we write.
const light = (actual, expected) =>
  actual === expected ? 'GREEN' : actual > expected ? 'YELLOW' : 'RED';

const setStatus = (id, status) =>
  client.query('UPDATE cutting_orders SET status = $2 WHERE id = $1', [id, status]);

async function seed() {
  const { rows: existing } = await client.query('SELECT count(*)::int AS n FROM users');
  if (existing[0].n > 0) {
    console.log('Already seeded: the users table is not empty. Nothing to do.');
    return;
  }

  await client.query('BEGIN');
  try {
    // users
    const userIds = {};
    for (const u of DEMO_USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      const { rows } = await client.query(
        'INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, $3, $4) RETURNING id',
        [u.email, hash, u.role, u.name],
      );
      userIds[u.role] = rows[0].id;
    }

    // recipes and their components
    const recipeIds = {};
    for (const r of RECIPES) {
      const { rows } = await client.query(
        `INSERT INTO recipes (recipe_code, name, category, std_fabric_yards, wastage_cap)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [r.code, r.name, r.category, r.yards, r.cap],
      );
      recipeIds[r.code] = rows[0].id;
      for (const [name, pieces] of r.components) {
        await client.query(
          'INSERT INTO recipe_components (recipe_id, component_name, pieces_per_garment) VALUES ($1, $2, $3)',
          [rows[0].id, name, pieces],
        );
      }
    }

    // orders, walked through the real legal transitions
    for (const o of ORDERS) {
      const { rows } = await client.query(
        `INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [recipeIds[o.recipe], o.qty, o.roll, o.yds, userIds.cutting_supervisor],
      );
      const id = rows[0].id;
      if (o.state === 'CUTTING_IN_PROGRESS') continue;

      // submit to QC, then create one uncounted row per recipe component
      await setStatus(id, 'PENDING_VERIFICATION');
      await client.query(
        `INSERT INTO verification_items (order_id, component_id, expected_qty)
         SELECT $1::bigint, rc.id, $2::int * rc.pieces_per_garment
           FROM recipe_components rc
           JOIN cutting_orders co ON co.recipe_id = rc.recipe_id
          WHERE co.id = $1::bigint`,
        [id, o.qty],
      );

      // the verifier's counts
      if (o.counts) {
        const { rows: items } = await client.query(
          `SELECT vi.id, vi.expected_qty
             FROM verification_items vi
             JOIN recipe_components rc ON rc.id = vi.component_id
            WHERE vi.order_id = $1 ORDER BY rc.id`,
          [id],
        );
        for (const [i, item] of items.entries()) {
          await client.query(
            'UPDATE verification_items SET actual_qty = $1, status = $2 WHERE id = $3',
            [o.counts[i], light(o.counts[i], item.expected_qty), item.id],
          );
        }
      }
      if (o.state === 'PENDING_VERIFICATION') continue;

      // the verifier's decision. Wastage is computed in exact SQL decimals.
      const decision = o.state === 'REJECTED' ? 'REJECTED' : 'APPROVED';
      await client.query(
        `INSERT INTO verification_logs
           (order_id, verifier_id, decision, rejection_note, audit_note,
            wastage_pct, expected_fabric_yds, wastage_over_cap, acknowledged_over_cap, items_snapshot)
         SELECT co.id, $2::bigint, $3::verification_decision, $4::text, $5::text,
                round((co.actual_fabric_yds - e.expected_yds) * 100 / e.expected_yds, 2),
                e.expected_yds,
                (co.actual_fabric_yds - e.expected_yds) * 100 > r.wastage_cap * e.expected_yds,
                false,
                (SELECT jsonb_agg(jsonb_build_object(
                          'component', rc.component_name,
                          'expected',  vi.expected_qty,
                          'actual',    vi.actual_qty,
                          'variance',  vi.actual_qty - vi.expected_qty,
                          'light',     vi.status) ORDER BY rc.id)
                   FROM verification_items vi
                   JOIN recipe_components rc ON rc.id = vi.component_id
                  WHERE vi.order_id = co.id)
           FROM cutting_orders co
           JOIN recipes r ON r.id = co.recipe_id
          CROSS JOIN LATERAL (SELECT co.target_qty * r.std_fabric_yards AS expected_yds) e
          WHERE co.id = $1`,
        [id, userIds.cutting_verifier, decision, o.reason ?? null, o.note ?? null],
      );

      await setStatus(id, o.state === 'REJECTED' ? 'REJECTED' : 'VERIFIED');

      if (o.state === 'SEWING_STARTED') {
        await client.query(
          `UPDATE cutting_orders
              SET status = 'SEWING_STARTED', sewing_started_by = $2, sewing_started_at = now()
            WHERE id = $1`,
          [id, userIds.sewing_supervisor],
        );
      }
    }

    await client.query('COMMIT');
    console.log(`Seeded ${DEMO_USERS.length} users, ${RECIPES.length} recipes, ${ORDERS.length} demo orders.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

try {
  await seed();
} finally {
  await client.end();
}