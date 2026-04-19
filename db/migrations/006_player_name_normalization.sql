BEGIN;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS alternate_names JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE players
SET full_name = COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(name), ''), 'Unknown Player'),
    display_name = COALESCE(
      NULLIF(btrim(display_name), ''),
      NULLIF(btrim(name), ''),
      COALESCE(NULLIF(btrim(full_name), ''), 'Unknown Player')
    );

UPDATE players
SET first_name = CASE
      WHEN NULLIF(btrim(full_name), '') IS NULL THEN NULL
      WHEN strpos(btrim(full_name), ' ') > 0 THEN split_part(btrim(full_name), ' ', 1)
      ELSE NULL
    END,
    last_name = CASE
      WHEN NULLIF(btrim(full_name), '') IS NULL THEN NULL
      WHEN strpos(btrim(full_name), ' ') > 0 THEN regexp_replace(btrim(full_name), '^.*\s+', '')
      ELSE NULL
    END
WHERE first_name IS NULL OR last_name IS NULL;

UPDATE players p
SET alternate_names = COALESCE(
  (
    SELECT to_jsonb(ARRAY_AGG(value ORDER BY value))
    FROM (
      SELECT DISTINCT value
      FROM unnest(
        ARRAY[
          NULLIF(btrim(p.name), ''),
          NULLIF(btrim(p.full_name), ''),
          NULLIF(btrim(p.display_name), '')
        ]
      ) AS value
      WHERE value IS NOT NULL
    ) names
  ),
  '[]'::jsonb
)
WHERE p.alternate_names IS NULL
   OR jsonb_typeof(p.alternate_names) <> 'array'
   OR jsonb_array_length(p.alternate_names) = 0;

ALTER TABLE players
  ALTER COLUMN full_name SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL,
  ALTER COLUMN alternate_names SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_players_full_name_not_blank'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT chk_players_full_name_not_blank
      CHECK (length(btrim(full_name)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_players_display_name_not_blank'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT chk_players_display_name_not_blank
      CHECK (length(btrim(display_name)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_players_alternate_names_is_array'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT chk_players_alternate_names_is_array
      CHECK (jsonb_typeof(alternate_names) = 'array');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_players_full_name ON players(full_name);
CREATE INDEX IF NOT EXISTS idx_players_display_name ON players(display_name);
CREATE INDEX IF NOT EXISTS idx_players_alternate_names_gin ON players USING GIN (alternate_names);

COMMIT;
