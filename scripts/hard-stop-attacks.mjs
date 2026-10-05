import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const files = fs.readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  await db.exec(fs.readFileSync(`db/migrations/${file}`, 'utf8').replace(/^\uFEFF/, ''));
}

// recipe: Cuffs x2 per garment, Collar x1. Three orders of 50 -> expected 100 and 50.
await db.exec(`
  INSERT INTO users (email, password_hash, role, full_name) VALUES
    ('sup@x.com', 'h', 'cutting_supervisor', 'Sup'),
    ('ver@x.com', 'h', 'cutting_verifier', 'Ver');
  INSERT INTO recipes (recipe_code, name, category, std_fabric_yards, wastage_cap)
    VALUES ('REC-T', 'Test', 'Blouse', 1.8, 5.0);
  INSERT INTO recipe_components (recipe_id, component_name, pieces_per_garment)
    VALUES (1, 'Cuffs', 2), (1, 'Collar', 1);
  INSERT INTO cutting_orders (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, created_by)
    VALUES (1, 50, 'F1', 94, 1), (1, 50, 'F2', 94, 1), (1, 50, 'F3', 94, 1);
  UPDATE cutting_orders SET status = 'PENDING_VERIFICATION';
`);

let bad = 0;
async function attempt(expect, name, sql, pattern) {
  let error = null;
  try { await db.query(sql); } catch (err) { error = err.message; }
  const ok = expect === 'ALLOW' ? error === null : error !== null && (!pattern || pattern.test(error));
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${expect === 'ALLOW' ? 'allowed:' : 'blocked:'} ${name}${ok ? '' : `   (${error ?? 'no error'})`}`);
}

const row = (o, c, expected) =>
  `INSERT INTO verification_items (order_id, component_id, expected_qty) VALUES (${o}, ${c}, ${expected})`;
const count = (o, c, n, light) =>
  `UPDATE verification_items SET actual_qty = ${n}, status = '${light}' WHERE order_id = ${o} AND component_id = ${c}`;
const approve = (id) =>
  `INSERT INTO verification_logs (order_id, verifier_id, decision, rejection_note,
     wastage_pct, expected_fabric_yds, wastage_over_cap, items_snapshot)
   VALUES (${id}, 2, 'APPROVED', NULL, 4.44, 90, false, '[{"component":"Cuffs"}]')`;
const verify = (id) => `UPDATE cutting_orders SET status = 'VERIFIED' WHERE id = ${id}`;

// order 1: correct rows, walked from uncounted to RED to YELLOW
await db.exec(row(1, 1, 100));
await db.exec(row(1, 2, 50));
await db.exec(approve(1));
await attempt('BLOCK', 'verify with every component uncounted', verify(1), /RED or uncounted/);
await attempt('ALLOW', 'count cuffs 98 of 100 (RED)', count(1, 1, 98, 'RED'));
await attempt('ALLOW', 'count collar 50 of 50 (GREEN)', count(1, 2, 50, 'GREEN'));
await attempt('BLOCK', 'verify with one RED component', verify(1), /RED or uncounted/);
await attempt('ALLOW', 'recount cuffs 103 of 100 (YELLOW)', count(1, 1, 103, 'YELLOW'));
await attempt('ALLOW', 'verify with GREEN + YELLOW (surplus is allowed)', verify(1));

// order 2: a component row is missing
await db.exec(row(2, 1, 100));
await db.exec(approve(2));
await attempt('ALLOW', 'order 2: count cuffs 100 (GREEN)', count(2, 1, 100, 'GREEN'));
await attempt('BLOCK', 'verify with the collar row missing', verify(2), /component rows exist/);

// order 3: expected quantity tampered (10 instead of 100)
await db.exec(row(3, 1, 10));
await db.exec(row(3, 2, 50));
await db.exec(approve(3));
await attempt('ALLOW', 'order 3: count cuffs 10 (GREEN against the fake expected 10)', count(3, 1, 10, 'GREEN'));
await attempt('ALLOW', 'order 3: count collar 50 (GREEN)', count(3, 2, 50, 'GREEN'));
await attempt('BLOCK', 'verify when expected does not match recipe x target', verify(3), /do not match the recipe/);

console.log(bad === 0 ? '\nAll hard-stop checks passed.' : `\n${bad} check(s) failed.`);
await db.close();
process.exit(bad === 0 ? 0 : 1);