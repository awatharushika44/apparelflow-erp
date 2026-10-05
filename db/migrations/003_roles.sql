-- 003_roles.sql: the app connects as a role that can only do what the app needs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apparelflow_app') THEN
    CREATE ROLE apparelflow_app LOGIN;   -- password is set outside git
  END IF;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM apparelflow_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM apparelflow_app;

GRANT USAGE ON SCHEMA public TO apparelflow_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO apparelflow_app;

GRANT INSERT, UPDATE ON cutting_orders      TO apparelflow_app;  -- no DELETE
GRANT INSERT, UPDATE ON verification_items  TO apparelflow_app;  -- no DELETE
GRANT INSERT         ON verification_logs   TO apparelflow_app;  -- append-only: no UPDATE/DELETE/TRUNCATE

GRANT USAGE ON SEQUENCE order_no_seq TO apparelflow_app;         -- for CO-0001 style numbers