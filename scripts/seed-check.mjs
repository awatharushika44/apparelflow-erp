import bcrypt from 'bcryptjs';
import pg from 'pg';
import { DEMO_USERS, RECIPES } from '../db/demo-data.mjs';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = async (sql, params) => (await client.query(sql, params)).rows;

let bad = 0;
function check(name, ok, detail = '') {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   ${detail}`}`);
}

const [{ u: who }] = await q('SELECT current_user AS u');
check('connected as the least-privilege role apparelflow_app', who === 'apparelflow_app', `(got ${who})`);

// every state has a demo order (PDF section 16 audit)
const orders = await q(
  `SELECT order_no, status, target_qty, fabric_roll_id, actual_fabric_yds::text AS yards
     FROM cutting_orders ORDER BY id`);
console.table(orders);
check('8 demo orders exist', orders.length === 8, `(got ${orders.length})`);
for (const s of ['CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION', 'REJECTED', 'VERIFIED', 'SEWING_STARTED']) {
  check(`a demo order exists in ${s}`, orders.some((o) => o.status === s));
}

// PDF section 7.1: both recipes, exactly
for (const r of RECIPES) {
  const [row] = await q(
    `SELECT r.name, r.category, r.std_fabric_yards::text AS yards, r.wastage_cap::text AS cap,
            (SELECT string_agg(rc.component_name || ' x' || rc.pieces_per_garment, ', ' ORDER BY rc.id)
               FROM recipe_components rc WHERE rc.recipe_id = r.id) AS comps
       FROM recipes r WHERE r.recipe_code = $1`, [r.code]);
  const wanted = r.components.map(([n, p]) => `${n} x${p}`).join(', ');
  check(`${r.code} ${r.name}: ${r.yards} yds, ${r.cap}% cap, exact components`,
    Boolean(row) && row.name === r.name && row.category === r.category &&
    Number(row.yards) === Number(r.yards) && Number(row.cap) === Number(r.cap) && row.comps === wanted,
    JSON.stringify(row));
}

// PDF section 8: the required attributes exist (our timestamp column is decided_at)
const REQUIRED = {
  users: ['id', 'email', 'password_hash', 'role', 'full_name', 'created_at'],
  recipes: ['id', 'recipe_code', 'name', 'category', 'std_fabric_yards', 'wastage_cap'],
  recipe_components: ['id', 'recipe_id', 'component_name', 'pieces_per_garment', 'image_url'],
  cutting_orders: ['id', 'order_no', 'recipe_id', 'target_qty', 'fabric_roll_id', 'actual_fabric_yds',
                   'status', 'created_by', 'created_at', 'updated_at'],
  verification_items: ['id', 'order_id', 'component_id', 'expected_qty', 'actual_qty', 'status'],
  verification_logs: ['id', 'order_id', 'verifier_id', 'decision', 'rejection_note', 'wastage_pct', 'decided_at'],
};
const cols = await q(
  `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
for (const [table, wanted] of Object.entries(REQUIRED)) {
  const have = new Set(cols.filter((c) => c.table_name === table).map((c) => c.column_name));
  const missing = wanted.filter((c) => !have.has(c));
  check(`PDF section 8: ${table} has all ${wanted.length} required columns`,
    missing.length === 0, `missing: ${missing.join(', ')}`);
}

// the demo credentials really log in (bcrypt compare)
const users = await q('SELECT email, password_hash, role FROM users');
for (const u of DEMO_USERS) {
  const row = users.find((x) => x.email === u.email);
  const ok = row && row.role === u.role && (await bcrypt.compare(u.password, row.password_hash));
  check(`demo credentials match the stored hash for ${u.role}`, Boolean(ok));
}

// wastage figures and caps
const logs = await q(
  `SELECT o.order_no, l.decision, l.wastage_pct::text AS wastage_pct, l.wastage_over_cap,
          jsonb_array_length(l.items_snapshot) AS snapshot_items
     FROM verification_logs l JOIN cutting_orders o ON o.id = l.order_id ORDER BY l.id`);
console.table(logs);
check('no demo order is over its wastage cap', logs.every((l) => l.wastage_over_cap === false));
check('stored wastage % are 3.03, 4.17, 2.22, 0.00',
  logs.map((l) => l.wastage_pct).join(', ') === '3.03, 4.17, 2.22, 0.00',
  `(got ${logs.map((l) => l.wastage_pct).join(', ')})`);

await client.end();
console.log(bad === 0 ? '\nAll seed checks passed.' : `\n${bad} check(s) failed.`);
process.exit(bad === 0 ? 0 : 1);