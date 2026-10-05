import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query('SELECT current_user AS u');
console.log('connected as', rows[0].u);
if (rows[0].u !== 'apparelflow_app') {
  console.log('ABORT: DATABASE_URL must use the apparelflow_app role');
  process.exit(1);
}

const attempts = [
  ["UPDATE verification_logs SET audit_note = 'x'", 'UPDATE logs'],
  ['DELETE FROM verification_logs', 'DELETE logs'],
  ['TRUNCATE verification_logs', 'TRUNCATE logs'],
  ['DELETE FROM cutting_orders', 'DELETE orders'],
  ["INSERT INTO allowed_transitions VALUES ('VERIFIED', 'REJECTED')", 'add a legal transition'],
  ["UPDATE users SET role = 'cutting_verifier'", 'change a user role'],
];

let bad = 0;
for (const [sql, name] of attempts) {
  try {
    await client.query(sql);
    bad += 1;
    console.log(`FAIL  ${name}: it succeeded!`);
  } catch (err) {
    const ok = /permission denied/i.test(err.message);
    if (!ok) bad += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  blocked: ${name}${ok ? '' : ` (${err.message})`}`);
  }
}

await client.end();
console.log(bad === 0 ? '\nAll Neon grant checks passed.' : `\n${bad} check(s) failed.`);
process.exit(bad === 0 ? 0 : 1);