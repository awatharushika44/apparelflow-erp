import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const sql = fs.readFileSync('db/migrations/001_schema.sql', 'utf8').replace(/^\uFEFF/, '');
await db.exec(sql);

// minimal parent rows so we can attack the child tables
await db.exec(`
  INSERT INTO users (email, password_hash, role, full_name) VALUES
    ('sup@x.com', 'h', 'cutting_supervisor', 'Sup'),
    ('ver@x.com', 'h', 'cutting_verifier', 'Ver');
  INSERT INTO recipes (recipe_code, name, category, std_fabric_yards, wastage_cap)
    VALUES ('REC-T', 'Test', 'Blouse', 1.8, 5.0);
  INSERT INTO recipe_components (recipe_id, component_name, pieces_per_garment)
    VALUES (1, 'Cuffs', 2);
  INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, created_by)
    VALUES (1, 50, 'FAB-1', 94, 1);
`);

const order = (qty, roll, yds, recipe = 1) =>
  `INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, created_by)
   VALUES (${recipe}, ${qty}, '${roll}', ${yds}, 1)`;
const item = (expected, actual, status) =>
  `INSERT INTO verification_items (order_id, component_id, expected_qty, actual_qty, status)
   VALUES (1, 1, ${expected}, ${actual}, ${status})`;
const log = (decision, note, snap = `'[{"component":"Cuffs"}]'`) =>
  `INSERT INTO verification_logs (order_id, verifier_id, decision, rejection_note,
     wastage_pct, expected_fabric_yds, wastage_over_cap, items_snapshot)
   VALUES (1, 2, '${decision}', ${note}, 4.44, 90, false, ${snap})`;

const tests = [
  ['BLOCK', 'negative target quantity', order(-5, 'F', 94)],
  ['BLOCK', 'zero target quantity', order(0, 'F', 94)],
  ['BLOCK', 'blank fabric roll id', order(10, '   ', 94)],
  ['BLOCK', 'negative fabric yards', order(10, 'F', -3)],
  ['BLOCK', 'order for a recipe that does not exist', order(10, 'F', 94, 999)],
  ['BLOCK', 'misspelt status VERFIED', `UPDATE cutting_orders SET status = 'VERFIED' WHERE id = 1`],
  ['BLOCK', 'SEWING_STARTED without who and when', `UPDATE cutting_orders SET status = 'SEWING_STARTED' WHERE id = 1`],
  ['BLOCK', 'uppercase email', `INSERT INTO users (email, password_hash, role, full_name) VALUES ('A@X.COM', 'h', 'cutting_verifier', 'A')`],
  ['BLOCK', 'GREEN but only 98 of 100', item(100, 98, `'GREEN'`)],
  ['BLOCK', 'a count with no status', item(100, 98, 'NULL')],
  ['BLOCK', 'a status with no count', item(100, 'NULL', `'RED'`)],
  ['BLOCK', 'negative count', item(100, -1, `'RED'`)],
  ['ALLOW', 'RED for 98 of 100 (valid)', item(100, 98, `'RED'`)],
  ['BLOCK', 'second row for the same component', item(100, 100, `'GREEN'`)],
  ['BLOCK', 'reject with no note', log('REJECTED', 'NULL')],
  ['BLOCK', 'reject with a whitespace-only note', log('REJECTED', `'   '`)],
  ['ALLOW', 'reject with a real note', log('REJECTED', `'2 sleeves short'`)],
  ['BLOCK', 'approval carrying a rejection note', log('APPROVED', `'oops'`)],
  ['BLOCK', 'empty items snapshot', log('APPROVED', 'NULL', `'[]'`)],
  ['ALLOW', 'first approval', log('APPROVED', 'NULL')],
  ['BLOCK', 'second approval of the same order', log('APPROVED', 'NULL')],
];

let bad = 0;
for (const [expect, name, statement] of tests) {
  let failed = false;
  try { await db.query(statement); } catch { failed = true; }
  const ok = expect === 'BLOCK' ? failed : !failed;
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${expect === 'BLOCK' ? 'blocked' : 'allowed'}: ${name}`);
}

const { rows } = await db.query('SELECT count(*)::int AS n FROM allowed_transitions');
if (rows[0].n !== 5) { bad += 1; console.log(`FAIL  allowed_transitions has ${rows[0].n} rows, expected 5`); }
else console.log('PASS  allowed_transitions has the 5 legal moves');

console.log(bad === 0 ? '\nAll schema checks passed.' : `\n${bad} check(s) failed.`);
await db.close();
process.exit(bad === 0 ? 0 : 1);