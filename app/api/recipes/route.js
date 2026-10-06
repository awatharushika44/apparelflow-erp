import { withGuard } from '../../../lib/guard.js';
import { query } from '../../../lib/db.js';
import { json } from '../../../lib/http.js';

export const runtime = 'nodejs';

// Read-only on purpose.
// There is no route that writes recipes.
export const GET = withGuard(
  'GET /api/recipes',
  async () => {
    const { rows } = await query(
      `SELECT
         r.recipe_code AS "recipeCode",
         r.name,
         r.category,
         r.std_fabric_yards::text AS "stdFabricYards",
         r.wastage_cap::text AS "wastageCap",
         (
           SELECT json_agg(
             json_build_object(
               'name', rc.component_name,
               'piecesPerGarment', rc.pieces_per_garment,
               'imageUrl', rc.image_url
             )
             ORDER BY rc.id
           )
           FROM recipe_components rc
           WHERE rc.recipe_id = r.id
         ) AS components
       FROM recipes r
       ORDER BY r.id`,
    );

    return json({ recipes: rows });
  },
);