-- 0002_immutability (M1-02): rules drizzle-kit cannot express (R5/R6/R8, ADR 0023).
-- Every trigger raises SQLSTATE P0001 with a message starting "immutable:".
--
-- 1. decisions and audit_events are append-only: any UPDATE or DELETE statement raises, even one
--    that matches no row. The single exception is the ON DELETE CASCADE from a deleted record (and
--    so from a deleted batch, the purge in M2-23): it runs nested (pg_trigger_depth() > 1) and the
--    decision's record is already gone. Deleting a proposal that has decisions still raises.
-- 2. batches.original, batches.sha256 and records.original_lines never change value.
-- 3. batches.purge_after is set on insert to created_at (UTC) + 30 days, whatever the caller sent.

CREATE FUNCTION immutable_statement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'decisions' AND pg_trigger_depth() > 1 THEN
    RETURN NULL; -- a cascade; the row trigger below checks each row
  END IF;
  RAISE EXCEPTION 'immutable: % on % is not allowed (append-only)', TG_OP, TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION immutable_decision_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 AND NOT EXISTS (SELECT 1 FROM records WHERE id = OLD.record_id) THEN
    RETURN OLD; -- the cascade from its deleted record or batch
  END IF;
  RAISE EXCEPTION 'immutable: DELETE on decisions is not allowed (append-only)';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION immutable_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable: UPDATE of %.% is not allowed', TG_TABLE_NAME, TG_ARGV[0];
END;
$$;
--> statement-breakpoint
CREATE FUNCTION batches_set_purge_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.purge_after := (NEW.created_at AT TIME ZONE 'UTC' + interval '30 days') AT TIME ZONE 'UTC';
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER decisions_no_update BEFORE UPDATE ON decisions
  FOR EACH STATEMENT EXECUTE FUNCTION immutable_statement();
--> statement-breakpoint
CREATE TRIGGER decisions_no_delete BEFORE DELETE ON decisions
  FOR EACH STATEMENT EXECUTE FUNCTION immutable_statement();
--> statement-breakpoint
CREATE TRIGGER decisions_no_delete_row BEFORE DELETE ON decisions
  FOR EACH ROW EXECUTE FUNCTION immutable_decision_delete();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION immutable_statement();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION immutable_statement();
--> statement-breakpoint
CREATE TRIGGER batches_original_frozen BEFORE UPDATE OF original ON batches
  FOR EACH ROW WHEN (OLD.original IS DISTINCT FROM NEW.original)
  EXECUTE FUNCTION immutable_columns('original');
--> statement-breakpoint
CREATE TRIGGER batches_sha256_frozen BEFORE UPDATE OF sha256 ON batches
  FOR EACH ROW WHEN (OLD.sha256 IS DISTINCT FROM NEW.sha256)
  EXECUTE FUNCTION immutable_columns('sha256');
--> statement-breakpoint
CREATE TRIGGER records_original_lines_frozen BEFORE UPDATE OF original_lines ON records
  FOR EACH ROW WHEN (OLD.original_lines IS DISTINCT FROM NEW.original_lines)
  EXECUTE FUNCTION immutable_columns('original_lines');
--> statement-breakpoint
CREATE TRIGGER batches_purge_after BEFORE INSERT ON batches
  FOR EACH ROW EXECUTE FUNCTION batches_set_purge_after();
