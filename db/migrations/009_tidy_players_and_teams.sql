BEGIN;

-- Tidy text fields so player identity columns are consistent and not blank.
WITH cleaned AS (
  SELECT
    id,
    COALESCE(NULLIF(btrim(display_name), ''), NULLIF(btrim(name), ''), NULLIF(btrim(full_name), ''), 'Unknown Player') AS new_display_name,
    COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(display_name), ''), NULLIF(btrim(name), ''), 'Unknown Player') AS new_full_name,
    NULLIF(btrim(first_name), '') AS new_first_name,
    NULLIF(btrim(last_name), '') AS new_last_name,
    NULLIF(btrim(role), '') AS new_role
  FROM players
)
UPDATE players p
SET
  display_name = c.new_display_name,
  name = c.new_display_name,
  full_name = c.new_full_name,
  first_name = c.new_first_name,
  last_name = c.new_last_name,
  role = c.new_role
FROM cleaned c
WHERE p.id = c.id;

-- Keep country in exactly two buckets only.
UPDATE players
SET country = CASE
  WHEN lower(btrim(country)) IN ('india', 'indian') THEN 'Indian'
  WHEN country IS NULL
    OR btrim(country) = ''
    OR lower(btrim(country)) IN ('-', '--', 'na', 'n/a', 'null', 'unknown', 'unknown country')
  THEN CASE WHEN is_overseas THEN 'Overseas Player' ELSE 'Indian' END
  ELSE 'Overseas Player'
END;

-- Ensure flag and country never drift.
UPDATE players
SET is_overseas = (country = 'Overseas Player');

-- Normalize alternate_names into a clean unique JSON array.
UPDATE players p
SET alternate_names = COALESCE(
  (
    SELECT to_jsonb(ARRAY_AGG(v ORDER BY v))
    FROM (
      SELECT DISTINCT v
      FROM unnest(
        ARRAY[
          NULLIF(btrim(p.name), ''),
          NULLIF(btrim(p.full_name), ''),
          NULLIF(btrim(p.display_name), '')
        ] || COALESCE(
          ARRAY(
            SELECT NULLIF(btrim(elem), '')
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(p.alternate_names) = 'array' THEN p.alternate_names
                ELSE '[]'::jsonb
              END
            ) AS elem
          ),
          ARRAY[]::text[]
        )
      ) AS v
      WHERE v IS NOT NULL
    ) names
  ),
  '[]'::jsonb
);

-- Tidy teams table text values.
UPDATE teams
SET
  name = btrim(name),
  short_code = CASE
    WHEN short_code IS NULL THEN NULL
    ELSE upper(btrim(short_code))
  END;

-- Keep defaults strict and predictable.
ALTER TABLE players
  ALTER COLUMN country SET NOT NULL,
  ALTER COLUMN country SET DEFAULT 'Indian',
  ALTER COLUMN is_overseas SET NOT NULL,
  ALTER COLUMN is_overseas SET DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_players_country_bucket'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT chk_players_country_bucket
      CHECK (country IN ('Indian', 'Overseas Player'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_players_name_matches_display'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT chk_players_name_matches_display
      CHECK (name = display_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_players_is_overseas_consistent'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT chk_players_is_overseas_consistent
      CHECK (
        (country = 'Indian' AND is_overseas = FALSE)
        OR (country = 'Overseas Player' AND is_overseas = TRUE)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_teams_short_code_upper'
  ) THEN
    ALTER TABLE teams
      ADD CONSTRAINT chk_teams_short_code_upper
      CHECK (short_code IS NULL OR short_code = upper(short_code));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_players_country_is_active
  ON players(country, is_active);

COMMIT;
