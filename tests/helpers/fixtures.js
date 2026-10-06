export async function seedBasics(db) {
  await db.exec(`
    INSERT INTO users (email, password_hash, role, full_name) VALUES
      ('sup@test.local', 'x', 'cutting_supervisor', 'Test Supervisor'),
      ('ver@test.local', 'x', 'cutting_verifier',   'Test Verifier'),
      ('sew@test.local', 'x', 'sewing_supervisor',  'Test Sewing');

    INSERT INTO recipes (recipe_code, name, category, std_fabric_yards, wastage_cap)
      VALUES ('REC-BL01', 'Casual Blouse', 'Blouse', 1.8, 5.0);

    INSERT INTO recipe_components (recipe_id, component_name, pieces_per_garment)
      SELECT r.id, c.name, c.n
        FROM recipes r,
             (VALUES
                ('Front Body Panel', 1),
                ('Back Body Panel', 1),
                ('Sleeves (Left & Right)', 2),
                ('Collar & Stand', 1),
                ('Sleeve Cuffs', 2)
             ) AS c(name, n)
       WHERE r.recipe_code = 'REC-BL01';
  `);
}

export const light = (actual, expected) =>
  actual === expected
    ? 'GREEN'
    : actual > expected
      ? 'YELLOW'
      : 'RED';

export async function createPendingOrder(
  db,
  { qty = 20, yards = 37 } = {},
) {
  const { rows } = await db.query(
    `INSERT INTO cutting_orders
       (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, created_by)
     SELECT r.id,
            $1::int,
            'ROLL-TEST',
            $2::numeric,
            u.id
       FROM recipes r, users u
      WHERE r.recipe_code = 'REC-BL01'
        AND u.role = 'cutting_supervisor'
     RETURNING id::int AS id`,
    [qty, yards],
  );

  const id = rows[0].id;

  await db.query(
    `UPDATE cutting_orders
        SET status = 'PENDING_VERIFICATION'
      WHERE id = $1`,
    [id],
  );

  await db.query(
    `INSERT INTO verification_items
       (order_id, component_id, expected_qty)
     SELECT co.id,
            rc.id,
            co.target_qty * rc.pieces_per_garment
       FROM cutting_orders co
       JOIN recipe_components rc
         ON rc.recipe_id = co.recipe_id
      WHERE co.id = $1`,
    [id],
  );

  return id;
}

export async function setCounts(db, orderId, counts) {
  const { rows } = await db.query(
    `SELECT id::int AS id,
            expected_qty
       FROM verification_items
      WHERE order_id = $1
      ORDER BY component_id`,
    [orderId],
  );

  for (const [i, item] of rows.entries()) {
    if (counts[i] === null || counts[i] === undefined) {
      continue;
    }

    await db.query(
      `UPDATE verification_items
          SET actual_qty = $1,
              status = $2
        WHERE id = $3`,
      [
        counts[i],
        light(counts[i], item.expected_qty),
        item.id,
      ],
    );
  }
}

export async function tryVerify(db, orderId) {
  // Give every verification component its expected quantity.
  // This makes every component GREEN so the database hard-stop
  // does not reject the test approval.
  await db.query(
    `UPDATE verification_items
        SET actual_qty = expected_qty,
            status = 'GREEN'
      WHERE order_id = $1`,
    [orderId],
  );

  await db.query(
    `INSERT INTO verification_logs
       (order_id,
        verifier_id,
        decision,
        wastage_pct,
        expected_fabric_yds,
        wastage_over_cap,
        items_snapshot)
     SELECT $1::bigint,
            u.id,
            'APPROVED'::verification_decision,
            2.78,
            36,
            false,
            '[{"component":"test"}]'::jsonb
       FROM users u
      WHERE u.role = 'cutting_verifier'`,
    [orderId],
  );

  await db.query(
    `UPDATE cutting_orders
        SET status = 'VERIFIED'
      WHERE id = $1`,
    [orderId],
  );
}

export async function statusOf(db, orderId) {
  const { rows } = await db.query(
    `SELECT status
       FROM cutting_orders
      WHERE id = $1`,
    [orderId],
  );

  return rows[0].status;
}