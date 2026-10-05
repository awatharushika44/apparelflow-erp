import { PGlite } from '@electric-sql/pglite';

const db = new PGlite(); // an in-memory Postgres running inside Node
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${name}  -> ${err.message}`);
  }
}

// The statement MUST throw. If it succeeds, the check fails.
async function mustFail(sql) {
  try {
    await db.query(sql);
  } catch (err) {
    return err.message;
  }
  throw new Error('expected an error but the statement succeeded');
}

await check('1 enum rejects a bad value', async () => {
  await db.exec(`
    CREATE TYPE order_status AS ENUM ('IN_PROGRESS', 'VERIFIED');
    CREATE TABLE t1 (id INT, s order_status);
    INSERT INTO t1 VALUES (1, 'VERIFIED');
  `);
  await mustFail(`INSERT INTO t1 VALUES (2, 'VERFIED')`);
});

await check('2 identity column', async () => {
  await db.exec(`CREATE TABLE t2 (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT)`);
  await db.query(`INSERT INTO t2 (name) VALUES ('a')`);
  const { rows } = await db.query(`SELECT id FROM t2`);
  if (Number(rows[0].id) !== 1) throw new Error('id was not 1');
});

await check('3 row trigger blocks UPDATE and DELETE', async () => {
  await db.exec(`
    CREATE TABLE logs (id INT PRIMARY KEY, note TEXT);
    CREATE FUNCTION block_change() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit rows are immutable';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER logs_no_change BEFORE UPDATE OR DELETE ON logs
      FOR EACH ROW EXECUTE FUNCTION block_change();
    INSERT INTO logs VALUES (1, 'first');
  `);
  const a = await mustFail(`UPDATE logs SET note = 'x' WHERE id = 1`);
  const b = await mustFail(`DELETE FROM logs WHERE id = 1`);
  if (!/immutable/.test(a + b)) throw new Error('wrong error message');
});

await check('4 TRUNCATE needs its own statement trigger', async () => {
  // a table with ONLY a row trigger: TRUNCATE sneaks through
  await db.exec(`
    CREATE TABLE logs2 (id INT);
    CREATE TRIGGER logs2_row BEFORE UPDATE OR DELETE ON logs2
      FOR EACH ROW EXECUTE FUNCTION block_change();
    INSERT INTO logs2 VALUES (1);
  `);
  await db.query(`TRUNCATE logs2`); // must succeed, proving row triggers do not fire on TRUNCATE
  // the statement-level trigger on logs blocks it
  await db.exec(`
    CREATE TRIGGER logs_no_truncate BEFORE TRUNCATE ON logs
      FOR EACH STATEMENT EXECUTE FUNCTION block_change();
  `);
  await mustFail(`TRUNCATE logs`);
});

await check('5 role with only SELECT + INSERT cannot UPDATE', async () => {
  await db.exec(`
    CREATE TABLE t5 (id INT, note TEXT);
    CREATE ROLE app_role;
    GRANT SELECT, INSERT ON t5 TO app_role;
    INSERT INTO t5 VALUES (1, 'a');
    SET ROLE app_role;
  `);
  try {
    await db.query(`INSERT INTO t5 VALUES (2, 'b')`); // allowed
    const msg = await mustFail(`UPDATE t5 SET note = 'x'`); // must be denied
    if (!/permission denied/i.test(msg)) throw new Error(`unexpected error: ${msg}`);
  } finally {
    await db.exec(`RESET ROLE`);
  }
});

await check('6 jsonb', async () => {
  await db.exec(`CREATE TABLE t6 (snap JSONB)`);
  await db.query(`INSERT INTO t6 VALUES ($1)`, [
    JSON.stringify([{ component: 'Sleeves', expected: 100, actual: 98 }]),
  ]);
  const { rows } = await db.query(`SELECT snap->0->>'component' AS c FROM t6`);
  if (rows[0].c !== 'Sleeves') throw new Error('jsonb read failed');
});

await check('7 SELECT ... FOR UPDATE inside a transaction', async () => {
  await db.exec(`CREATE TABLE t7 (id INT PRIMARY KEY, n INT); INSERT INTO t7 VALUES (1, 0);`);
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(`SELECT n FROM t7 WHERE id = 1 FOR UPDATE`);
    if (rows.length !== 1) throw new Error('row not found');
    await tx.query(`UPDATE t7 SET n = n + 1 WHERE id = 1`);
  });
});

await check('8 counted/status NULL-together CHECK (D14)', async () => {
  await db.exec(`
    CREATE TYPE light AS ENUM ('GREEN', 'YELLOW', 'RED');
    CREATE TABLE items (
      id INT PRIMARY KEY,
      actual_qty INT,
      status light,
      CHECK ((actual_qty IS NULL) = (status IS NULL)),
      CHECK (actual_qty IS NULL OR actual_qty >= 0)
    );
    INSERT INTO items VALUES (1, NULL, NULL), (2, 50, 'GREEN');
  `);
  await mustFail(`INSERT INTO items VALUES (3, 5, NULL)`);
  await mustFail(`INSERT INTO items VALUES (4, NULL, 'RED')`);
  await mustFail(`INSERT INTO items VALUES (5, -1, 'RED')`);
});

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
await db.close();
process.exit(failures === 0 ? 0 : 1);