// Read-only database audit. Every "rule" query must return ZERO rows; every "denied" statement must fail.
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = async (sql) => (await client.query(sql)).rows;

let bad = 0;
function check(name, ok, detail = '') {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   ${detail}`}`);
}

const [{ who }] = await q('SELECT current_user AS who');
check('connected as the least-privilege role apparelflow_app', who === 'apparelflow_app', `(got ${who})`);

console.log('\n--- what is in the database right now ---');
console.table(await q(`SELECT status, count(*)::int AS orders FROM cutting_orders GROUP BY status ORDER BY status`));
console.table(await q(`SELECT order_no, status, target_qty, fabric_roll_id, actual_fabric_yds::text AS yards, created_at
                         FROM cutting_orders ORDER BY id DESC LIMIT 5`));
console.table(await q(`SELECT o.order_no, l.decision, u.email AS signed_by, l.wastage_pct::text AS wastage_pct,
                              l.wastage_over_cap, l.audit_note, l.rejection_note, l.decided_at
                         FROM verification_logs l
                         JOIN cutting_orders o ON o.id = l.order_id
                         JOIN users u ON u.id = l.verifier_id
                        ORDER BY l.id DESC LIMIT 5`));

console.log('\n--- invariants (each query must return zero rows) ---');
const RULES = [
  ['released orders have an APPROVED log',
    `SELECT o.order_no FROM cutting_orders o WHERE o.status IN ('VERIFIED','SEWING_STARTED')
      AND NOT EXISTS (SELECT 1 FROM verification_logs l WHERE l.order_id = o.id AND l.decision = 'APPROVED')`],
  ['released orders have no uncounted or short component',
    `SELECT DISTINCT o.order_no FROM cutting_orders o JOIN verification_items vi ON vi.order_id = o.id
      WHERE o.status IN ('VERIFIED','SEWING_STARTED') AND (vi.actual_qty IS NULL OR vi.actual_qty < vi.expected_qty)`],
  ['released orders have one item row per recipe component',
    `SELECT o.order_no FROM cutting_orders o WHERE o.status IN ('VERIFIED','SEWING_STARTED')
      AND (SELECT count(*) FROM verification_items vi WHERE vi.order_id = o.id)
       <> (SELECT count(*) FROM recipe_components rc WHERE rc.recipe_id = o.recipe_id)`],
  ['expected_qty always equals target x pieces per garment',
    `SELECT o.order_no, rc.component_name FROM verification_items vi
       JOIN cutting_orders o ON o.id = vi.order_id JOIN recipe_components rc ON rc.id = vi.component_id
      WHERE vi.expected_qty <> o.target_qty * rc.pieces_per_garment`],
  ['stored traffic light agrees with the counts',
    `SELECT o.order_no, rc.component_name FROM verification_items vi
       JOIN cutting_orders o ON o.id = vi.order_id JOIN recipe_components rc ON rc.id = vi.component_id
      WHERE vi.actual_qty IS NOT NULL AND vi.status::text <>
        CASE WHEN vi.actual_qty = vi.expected_qty THEN 'GREEN' WHEN vi.actual_qty > vi.expected_qty THEN 'YELLOW' ELSE 'RED' END`],
  ['count and status are set together, and never negative',
    `SELECT id FROM verification_items WHERE (actual_qty IS NULL) <> (status IS NULL) OR actual_qty < 0`],
  ['every decision was signed by a cutting_verifier',
    `SELECT l.id FROM verification_logs l JOIN users u ON u.id = l.verifier_id WHERE u.role::text <> 'cutting_verifier'`],
  ['every REJECTED log has a real note',
    `SELECT id FROM verification_logs WHERE decision = 'REJECTED' AND (rejection_note IS NULL OR btrim(rejection_note) = '')`],
  ['at most one APPROVED log per order',
    `SELECT order_id FROM verification_logs WHERE decision = 'APPROVED' GROUP BY order_id HAVING count(*) > 1`],
  ['stored wastage % equals the recomputed value on approved orders',
    `SELECT o.order_no FROM verification_logs l JOIN cutting_orders o ON o.id = l.order_id JOIN recipes r ON r.id = o.recipe_id
      WHERE l.decision = 'APPROVED' AND l.wastage_pct IS DISTINCT FROM
        round((o.actual_fabric_yds - o.target_qty * r.std_fabric_yards) * 100 / (o.target_qty * r.std_fabric_yards), 2)`],
  ['SEWING_STARTED orders record who and when, by a sewing_supervisor',
    `SELECT o.order_no FROM cutting_orders o LEFT JOIN users u ON u.id = o.sewing_started_by
      WHERE o.status = 'SEWING_STARTED' AND (o.sewing_started_at IS NULL OR u.role::text IS DISTINCT FROM 'sewing_supervisor')`],
  ['sewing start is only recorded on SEWING_STARTED orders',
    `SELECT order_no FROM cutting_orders WHERE status <> 'SEWING_STARTED'
      AND (sewing_started_by IS NOT NULL OR sewing_started_at IS NOT NULL)`],
];
for (const [name, sql] of RULES) {
  const rows = await q(sql);
  check(name, rows.length === 0, JSON.stringify(rows.slice(0, 3)));
}

console.log('\n--- the app role must be refused (WHERE false, so nothing could change even if allowed) ---');
const DENIED = [
  'UPDATE verification_logs SET audit_note = audit_note WHERE false',
  'DELETE FROM verification_logs WHERE false',
  'UPDATE recipes SET name = name WHERE false',
  'UPDATE recipe_components SET component_name = component_name WHERE false',
  'DELETE FROM cutting_orders WHERE false',
];
for (const sql of DENIED) {
  try {
    await client.query(sql);
    check(`refused: ${sql}`, false, '(it was ALLOWED)');
  } catch (err) {
    check(`refused: ${sql}`, true, err.message);
  }
}

await client.end();
console.log(bad === 0 ? '\nAll database audit checks passed.' : `\n${bad} check(s) failed.`);
process.exit(bad === 0 ? 0 : 1);