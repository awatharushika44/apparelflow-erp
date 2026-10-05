-- 004_hard_stop.sql: the database refuses to verify a short, uncounted or tampered batch.

CREATE FUNCTION check_hard_stop() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  needed   INT;
  have     INT;
  matching INT;
  blocking INT;
BEGIN
  SELECT count(*) INTO needed FROM recipe_components WHERE recipe_id = NEW.recipe_id;
  SELECT count(*) INTO have   FROM verification_items WHERE order_id = NEW.id;

  SELECT count(*) INTO matching
    FROM verification_items vi
    JOIN recipe_components rc ON rc.id = vi.component_id
   WHERE vi.order_id = NEW.id
     AND rc.recipe_id = NEW.recipe_id
     AND vi.expected_qty = NEW.target_qty * rc.pieces_per_garment;

  SELECT count(*) INTO blocking
    FROM verification_items
   WHERE order_id = NEW.id AND (status IS NULL OR status = 'RED');

  IF have <> needed THEN
    RAISE EXCEPTION 'hard stop: % of % component rows exist', have, needed
      USING ERRCODE = 'check_violation';
  END IF;
  IF matching <> needed THEN
    RAISE EXCEPTION 'hard stop: expected quantities do not match the recipe times the target'
      USING ERRCODE = 'check_violation';
  END IF;
  IF blocking > 0 THEN
    RAISE EXCEPTION 'hard stop: % component(s) are RED or uncounted', blocking
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cutting_orders_hard_stop
  BEFORE UPDATE ON cutting_orders
  FOR EACH ROW
  WHEN (NEW.status = 'VERIFIED' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION check_hard_stop();