-- 001_schema.sql: ApparelFlow core tables (PDF section 8).
-- Rules live in the database too, so a bug in app code cannot store bad data.

-- ---------- enums ----------
CREATE TYPE user_role AS ENUM ('cutting_supervisor', 'cutting_verifier', 'sewing_supervisor');
CREATE TYPE order_status AS ENUM (
  'CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION', 'REJECTED', 'VERIFIED', 'SEWING_STARTED'
);
CREATE TYPE light_status AS ENUM ('GREEN', 'YELLOW', 'RED');
CREATE TYPE verification_decision AS ENUM ('APPROVED', 'REJECTED');

-- ---------- users ----------
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL,
  full_name     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_name_not_blank   CHECK (full_name ~ '\S')
);

-- ---------- recipes (bill of materials) ----------
CREATE TABLE recipes (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_code      TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  std_fabric_yards NUMERIC(6,2) NOT NULL,
  wastage_cap      NUMERIC(5,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipes_std_yards_positive CHECK (std_fabric_yards > 0),
  CONSTRAINT recipes_cap_range          CHECK (wastage_cap >= 0 AND wastage_cap <= 100)
);

CREATE TABLE recipe_components (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id          BIGINT NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  component_name     TEXT NOT NULL,
  pieces_per_garment INT NOT NULL,
  image_url          TEXT,
  CONSTRAINT components_pieces_positive CHECK (pieces_per_garment > 0),
  CONSTRAINT components_unique_per_recipe UNIQUE (recipe_id, component_name)
);

-- ---------- cutting orders ----------
CREATE SEQUENCE order_no_seq START 1;

CREATE TABLE cutting_orders (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_no          TEXT NOT NULL UNIQUE
                    DEFAULT ('CO-' || lpad(nextval('order_no_seq')::text, 4, '0')),
  recipe_id         BIGINT NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  target_qty        INT NOT NULL,
  fabric_roll_id    TEXT NOT NULL,
  actual_fabric_yds NUMERIC(10,2) NOT NULL,
  status            order_status NOT NULL DEFAULT 'CUTTING_IN_PROGRESS',
  created_by        BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sewing_started_by BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  sewing_started_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orders_target_qty_range CHECK (target_qty > 0 AND target_qty <= 100000),
  CONSTRAINT orders_roll_not_blank   CHECK (fabric_roll_id ~ '\S'),
  CONSTRAINT orders_yards_range      CHECK (actual_fabric_yds > 0 AND actual_fabric_yds <= 1000000),
  CONSTRAINT orders_sewing_cols_together
    CHECK ((sewing_started_by IS NULL) = (sewing_started_at IS NULL)),
  CONSTRAINT orders_sewing_matches_status
    CHECK ((status = 'SEWING_STARTED') = (sewing_started_by IS NOT NULL))
);

-- the Sewing Queue filters on status, so index it
CREATE INDEX cutting_orders_status_idx ON cutting_orders (status);

-- ---------- live working counts ----------
CREATE TABLE verification_items (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES cutting_orders(id) ON DELETE RESTRICT,
  component_id BIGINT NOT NULL REFERENCES recipe_components(id) ON DELETE RESTRICT,
  expected_qty INT NOT NULL,
  actual_qty   INT,           -- NULL means "not counted yet"
  status       light_status,  -- NULL means "not counted yet"
  CONSTRAINT items_one_row_per_component UNIQUE (order_id, component_id),
  CONSTRAINT items_expected_positive CHECK (expected_qty > 0),
  CONSTRAINT items_actual_range      CHECK (actual_qty IS NULL OR (actual_qty >= 0 AND actual_qty <= 10000000)),
  CONSTRAINT items_count_status_together CHECK ((actual_qty IS NULL) = (status IS NULL)),
  CONSTRAINT items_status_matches_counts CHECK (
    status IS NULL
    OR (status = 'GREEN'  AND actual_qty = expected_qty)
    OR (status = 'YELLOW' AND actual_qty > expected_qty)
    OR (status = 'RED'    AND actual_qty < expected_qty)
  )
);

-- ---------- audit log (made immutable in 002) ----------
CREATE TABLE verification_logs (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id              BIGINT NOT NULL REFERENCES cutting_orders(id) ON DELETE RESTRICT,
  verifier_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision              verification_decision NOT NULL,
  rejection_note        TEXT,
  audit_note            TEXT,
  wastage_pct           NUMERIC(14,2) NOT NULL,
  expected_fabric_yds   NUMERIC(12,2) NOT NULL,
  wastage_over_cap      BOOLEAN NOT NULL,
  acknowledged_over_cap BOOLEAN NOT NULL DEFAULT false,
  items_snapshot        JSONB NOT NULL,
  decided_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT logs_expected_yds_positive CHECK (expected_fabric_yds > 0),
  -- coalesce matters: a CHECK that evaluates to NULL counts as a pass
  CONSTRAINT logs_rejection_note_required
    CHECK (decision = 'APPROVED' OR coalesce(rejection_note ~ '\S', false)),
  CONSTRAINT logs_approval_has_no_rejection_note
    CHECK (decision = 'REJECTED' OR rejection_note IS NULL),
  CONSTRAINT logs_snapshot_is_nonempty_array
    CHECK (CASE WHEN jsonb_typeof(items_snapshot) = 'array'
                THEN jsonb_array_length(items_snapshot) > 0 ELSE false END)
);

-- at most ONE approval per order, enforced by the database itself
CREATE UNIQUE INDEX one_approval_per_order
  ON verification_logs (order_id) WHERE decision = 'APPROVED';

CREATE INDEX verification_logs_order_idx ON verification_logs (order_id, decided_at);

-- ---------- the legal state transitions (D23) ----------
CREATE TABLE allowed_transitions (
  from_status order_status NOT NULL,
  to_status   order_status NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

INSERT INTO allowed_transitions (from_status, to_status) VALUES
  ('CUTTING_IN_PROGRESS', 'PENDING_VERIFICATION'),
  ('PENDING_VERIFICATION', 'VERIFIED'),
  ('PENDING_VERIFICATION', 'REJECTED'),
  ('REJECTED', 'PENDING_VERIFICATION'),
  ('VERIFIED', 'SEWING_STARTED');