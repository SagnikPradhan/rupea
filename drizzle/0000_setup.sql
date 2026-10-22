CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END;
$$;
-- Gives every table with an `updated_at` the trigger; safe to call again.
CREATE FUNCTION attach_updated_at() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	t text;
BEGIN
	FOR t IN
		SELECT table_name FROM information_schema.columns
		WHERE table_schema = 'public' AND column_name = 'updated_at'
	LOOP
		EXECUTE format(
			'CREATE OR REPLACE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
			t
		);
	END LOOP;
END;
$$;
