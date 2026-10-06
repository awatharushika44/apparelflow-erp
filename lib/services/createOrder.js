import { query } from '../db.js';
import { HttpError } from '../http.js';

// The creator comes from the authenticated user.
// It is never taken from the request body.
export async function createOrder({
  user,
  recipeCode,
  targetQty,
  fabricRollId,
  actualFabricYards,
}) {
  // Find the recipe by its code.
  const { rows: recipes } = await query(
    'SELECT id FROM recipes WHERE recipe_code = $1',
    [recipeCode],
  );

  // Unknown recipe is a client/business validation error.
  if (!recipes[0]) {
    throw new HttpError(
      422,
      'UNKNOWN_RECIPE',
      'That recipe does not exist.',
      {
        recipeCode: ['Unknown recipe'],
      },
    );
  }

  // Create the order.
  // Notice that user.id is used for created_by.
  const { rows } = await query(
    `INSERT INTO cutting_orders
       (recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING
       id::text AS id,
       order_no AS "orderNo",
       status,
       target_qty AS "targetQty",
       fabric_roll_id AS "fabricRollId",
       actual_fabric_yds::text AS "actualFabricYards",
       created_at AS "createdAt"`,
    [
      recipes[0].id,
      targetQty,
      fabricRollId,
      actualFabricYards,
      user.id,
    ],
  );

  return rows[0];
}