import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
for (const file of ['001_schema.sql', '002_triggers.sql', '003_roles.sql']) {
  const sql = fs.readFileSync(`db/migrations/${file}`, 'utf8').replace(/^\uFEFF/, '');
  await db.exec(sql);
}

// users: 1 supervisor, 2 verifier, 3 sewing. two orders (ids 1 and 2).
await db.exec(`
  INSERT INTO users (email, password_hash, role, full_name) VALUES
    ('sup@x.com', 'h', 'cutting_supervisor', 'Sup'),
    ('ver@x.com', 'h', 'cutting_verifier', 'Ver'),
    ('sew@x.com', 'h', 'sewing_supervisor', 'Sew');
  INSERT INTO recipes (recipe_code, name, category, std_fabric_yards, wastage_cap)
    VALUES ('REC-T', 'Test', 'Blouse', 1.8, 5.0);
  INSERT INTO recipe_components (recipe_id, component_name, pieces_per_garment)
    VALUES (1, 'Cuffs', 2);
  INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, created_by)
    VALUES (1, 50, 'FAB-1', 94, 1), (1, 20, 'FAB-2', 40, 1);
`);

let bad = 0;
async function attempt(expect, name, sql, pattern) {
  let error = null;
  try { await db.query(sql); } catch (err) { error = err.message; }
  const ok = expect === 'ALLOW'
    ? error === null
    : error !== null && (!pattern || pattern.test(error));
  if (!ok) bad += 1;
  const label = expect === 'ALLOW' ? 'allowed:' : 'blocked:';
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${name}${ok ? '' : `   (${error ?? 'no error'})`}`);
}

const setStatus = (id, status, extra = '') =>
  `UPDATE cutting_orders SET status = '${status}'${extra} WHERE id = ${id}`;
const log = (orderId, who, decision, note) =>
  `INSERT INTO verification_logs (order_id, verifier_id, decision, rejection_note,
     wastage_pct, expected_fabric_yds, wastage_over_cap, items_snapshot)
   VALUES (${orderId}, ${who}, '${decision}', ${note}, 4.44, 90, false, '[{"component":"Cuffs"}]')`;
const newOrder = (by, extraCols = '', extraVals = '') =>
  `INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, created_by${extraCols})
   VALUES (1, 10, 'F', 10, ${by}${extraVals})`;

// --- how orders are born ---
await attempt('BLOCK', 'new order that starts as VERIFIED', newOrder(1, ', status', `, 'VERIFIED'`), /must start as CUTTING_IN_PROGRESS/);
await attempt('BLOCK', 'new order created by a verifier', newOrder(2), /cutting_supervisor/);

// --- before submit ---
await attempt('BLOCK', 'count row while order is IN_PROGRESS',
  `INSERT INTO verification_items (order_id, component_id, expected_qty) VALUES (1, 1, 100)`, /PENDING_VERIFICATION/);
await attempt('BLOCK', 'IN_PROGRESS -> VERIFIED (skips QC)', setStatus(1, 'VERIFIED'), /illegal status transition/);
await attempt('BLOCK', 'IN_PROGRESS -> SEWING_STARTED',
  setStatus(1, 'SEWING_STARTED', `, sewing_started_by = 3, sewing_started_at = now()`), /illegal status transition/);
await attempt('ALLOW', 'edit fabric yards while IN_PROGRESS', `UPDATE cutting_orders SET actual_fabric_yds = 95 WHERE id = 1`);
await attempt('ALLOW', 'IN_PROGRESS -> PENDING_VERIFICATION', setStatus(1, 'PENDING_VERIFICATION'));

// --- while pending ---
await attempt('BLOCK', 'change target quantity while pending', `UPDATE cutting_orders SET target_qty = 10 WHERE id = 1`, /frozen/);
await attempt('BLOCK', 'change fabric yards while pending', `UPDATE cutting_orders SET actual_fabric_yds = 80 WHERE id = 1`, /can only change/);
await attempt('ALLOW', 'create an uncounted row while pending',
  `INSERT INTO verification_items (order_id, component_id, expected_qty) VALUES (1, 1, 100)`);
await attempt('ALLOW', 'save a count (98 of 100 = RED)',
  `UPDATE verification_items SET actual_qty = 98, status = 'RED' WHERE order_id = 1`);
await attempt('BLOCK', 'change the expected quantity', `UPDATE verification_items SET expected_qty = 90 WHERE order_id = 1`, /never change/);
await attempt('BLOCK', 'PENDING -> VERIFIED without an APPROVED log', setStatus(1, 'VERIFIED'), /APPROVED log/);
await attempt('BLOCK', 'approval signed by a supervisor', log(1, 1, 'APPROVED', 'NULL'), /not a cutting_verifier/);
await attempt('ALLOW', 'approval signed by the verifier', log(1, 2, 'APPROVED', 'NULL'));
await attempt('BLOCK', 'second approval of the same order', log(1, 2, 'APPROVED', 'NULL'), /one_approval_per_order/);
await attempt('ALLOW', 'PENDING -> VERIFIED (log exists)', setStatus(1, 'VERIFIED'));

// --- after approval ---
await attempt('BLOCK', 'change a count after approval',
  `UPDATE verification_items SET actual_qty = 100, status = 'GREEN' WHERE order_id = 1`, /PENDING_VERIFICATION/);
await attempt('BLOCK', 'VERIFIED -> PENDING_VERIFICATION', setStatus(1, 'PENDING_VERIFICATION'), /illegal status transition/);
await attempt('BLOCK', 'VERIFIED -> REJECTED', setStatus(1, 'REJECTED'), /illegal status transition/);
await attempt('BLOCK', 'sewing started by a supervisor',
  setStatus(1, 'SEWING_STARTED', `, sewing_started_by = 1, sewing_started_at = now()`), /sewing_supervisor/);
await attempt('ALLOW', 'sewing started by the sewing supervisor',
  setStatus(1, 'SEWING_STARTED', `, sewing_started_by = 3, sewing_started_at = now()`));
await attempt('BLOCK', 'SEWING_STARTED -> VERIFIED',
  setStatus(1, 'VERIFIED', `, sewing_started_by = NULL, sewing_started_at = NULL`), /illegal status transition/);

// --- the log can never be rewritten ---
await attempt('BLOCK', 'UPDATE a log row', `UPDATE verification_logs SET audit_note = 'x'`, /immutable/);
await attempt('BLOCK', 'DELETE a log row', `DELETE FROM verification_logs`, /immutable/);
await attempt('BLOCK', 'TRUNCATE the log table', `TRUNCATE verification_logs`, /immutable/);

// --- the reject path (order 2) ---
await attempt('ALLOW', 'order 2: IN_PROGRESS -> PENDING', setStatus(2, 'PENDING_VERIFICATION'));
await attempt('BLOCK', 'REJECTED without a REJECTED log', setStatus(2, 'REJECTED'), /REJECTED log/);
await attempt('BLOCK', 'reject log with no note', log(2, 2, 'REJECTED', 'NULL'), /logs_rejection_note_required/);
await attempt('ALLOW', 'reject log with a real note', log(2, 2, 'REJECTED', `'2 sleeves short'`));
await attempt('ALLOW', 'PENDING -> REJECTED', setStatus(2, 'REJECTED'));
await attempt('BLOCK', 'REJECTED -> VERIFIED', setStatus(2, 'VERIFIED'), /illegal status transition/);
await attempt('ALLOW', 'REJECTED -> PENDING with new yards',
  `UPDATE cutting_orders SET status = 'PENDING_VERIFICATION', actual_fabric_yds = 42 WHERE id = 2`);

// --- the app role (least privilege) ---
await db.exec('SET ROLE apparelflow_app');
try {
  await attempt('BLOCK', 'app role: UPDATE logs', `UPDATE verification_logs SET audit_note = 'x'`, /permission denied/);
  await attempt('BLOCK', 'app role: DELETE logs', `DELETE FROM verification_logs`, /permission denied/);
  await attempt('BLOCK', 'app role: TRUNCATE logs', `TRUNCATE verification_logs`, /permission denied/);
  await attempt('BLOCK', 'app role: DELETE orders', `DELETE FROM cutting_orders`, /permission denied/);
  await attempt('BLOCK', 'app role: add a legal transition',
    `INSERT INTO allowed_transitions VALUES ('VERIFIED', 'REJECTED')`, /permission denied/);
  await attempt('BLOCK', 'app role: change a user role', `UPDATE users SET role = 'cutting_verifier'`, /permission denied/);
  await attempt('ALLOW', 'app role: read logs', `SELECT * FROM verification_logs`);
  await attempt('ALLOW', 'app role: create an order (uses the order_no sequence)', newOrder(1));
} finally {
  await db.exec('RESET ROLE');
}

console.log(bad === 0 ? '\nAll trigger and role checks passed.' : `\n${bad} check(s) failed.`);
await db.close();
process.exit(bad === 0 ? 0 : 1);