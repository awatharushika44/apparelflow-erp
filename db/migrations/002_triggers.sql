-- 002_triggers.sql: the database refuses illegal changes even if app code has a bug.

-- ========== 1. audit rows are immutable (PDF section 6) ==========
CREATE FUNCTION block_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: audit rows are immutable', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER verification_logs_no_change
  BEFORE UPDATE OR DELETE ON verification_logs
  FOR EACH ROW EXECUTE FUNCTION block_change();

-- row triggers do NOT fire on TRUNCATE, so it needs its own statement-level trigger
CREATE TRIGGER verification_logs_no_truncate
  BEFORE TRUNCATE ON verification_logs
  FOR EACH STATEMENT EXECUTE FUNCTION block_change();

-- ========== 2. only a real verifier can sign a log ==========
CREATE FUNCTION check_verifier_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.verifier_id AND role = 'cutting_verifier') THEN
    RAISE EXCEPTION 'user % is not a cutting_verifier', NEW.verifier_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_logs_verifier_role
  BEFORE INSERT ON verification_logs
  FOR EACH ROW EXECUTE FUNCTION check_verifier_role();

-- ========== 3. orders: how they are born ==========
CREATE FUNCTION guard_order_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'CUTTING_IN_PROGRESS' THEN
    RAISE EXCEPTION 'new orders must start as CUTTING_IN_PROGRESS'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND role = 'cutting_supervisor') THEN
    RAISE EXCEPTION 'created_by must be a cutting_supervisor'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cutting_orders_guard_insert
  BEFORE INSERT ON cutting_orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_insert();

-- ========== 4. orders: how they may change ==========
CREATE FUNCTION guard_order_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_no <> OLD.order_no OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'order_no and created_by never change'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (NEW.recipe_id <> OLD.recipe_id OR NEW.target_qty <> OLD.target_qty)
     AND OLD.status <> 'CUTTING_IN_PROGRESS' THEN
    RAISE EXCEPTION 'recipe and target quantity are frozen once the order is submitted'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (NEW.fabric_roll_id <> OLD.fabric_roll_id OR NEW.actual_fabric_yds <> OLD.actual_fabric_yds)
     AND OLD.status NOT IN ('CUTTING_IN_PROGRESS', 'REJECTED') THEN
    RAISE EXCEPTION 'fabric roll and yards can only change while IN_PROGRESS or REJECTED'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.sewing_started_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.sewing_started_by AND role = 'sewing_supervisor') THEN
    RAISE EXCEPTION 'sewing_started_by must be a sewing_supervisor'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (SELECT 1 FROM allowed_transitions
                   WHERE from_status = OLD.status AND to_status = NEW.status) THEN
      RAISE EXCEPTION 'illegal status transition % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'VERIFIED' AND NOT EXISTS (
         SELECT 1 FROM verification_logs WHERE order_id = NEW.id AND decision = 'APPROVED') THEN
      RAISE EXCEPTION 'cannot mark VERIFIED without an APPROVED log'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'REJECTED' AND NOT EXISTS (
         SELECT 1 FROM verification_logs WHERE order_id = NEW.id AND decision = 'REJECTED') THEN
      RAISE EXCEPTION 'cannot mark REJECTED without a REJECTED log'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cutting_orders_guard_update
  BEFORE UPDATE ON cutting_orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_update();

-- ========== 5. counts can only change while the order is pending ==========
CREATE FUNCTION guard_item_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_order  BIGINT;
  parent_status order_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_order := OLD.order_id;
  ELSE
    target_order := NEW.order_id;
  END IF;

  SELECT status INTO parent_status FROM cutting_orders WHERE id = target_order;

  IF parent_status IS DISTINCT FROM 'PENDING_VERIFICATION' THEN
    RAISE EXCEPTION 'counts can only change while the order is PENDING_VERIFICATION'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.order_id <> OLD.order_id
                        OR NEW.component_id <> OLD.component_id
                        OR NEW.expected_qty <> OLD.expected_qty) THEN
    RAISE EXCEPTION 'order, component and expected quantity never change'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON verification_items
  FOR EACH ROW EXECUTE FUNCTION guard_item_change();