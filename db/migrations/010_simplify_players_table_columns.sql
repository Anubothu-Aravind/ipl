BEGIN;

-- Keep only requested players columns and add seasons_played.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS seasons_played INT NOT NULL DEFAULT 0;

-- Preserve best available name before dropping extended name columns.
UPDATE players
SET name = COALESCE(
  NULLIF(btrim(name), ''),
  NULLIF(btrim(display_name), ''),
  NULLIF(btrim(full_name), ''),
  'Unknown Player'
);

ALTER TABLE players
  ALTER COLUMN name TYPE VARCHAR(150),
  ALTER COLUMN name SET NOT NULL;

-- Refresh seasons_played from season stats.
UPDATE players p
SET seasons_played = COALESCE(
  (
    SELECT COUNT(*)::int
    FROM player_season_stats ps
    WHERE ps.player_id = p.id
  ),
  0
);

-- Drop constraints and indexes tied to removed legacy name columns.
ALTER TABLE players DROP CONSTRAINT IF EXISTS chk_players_full_name_not_blank;
ALTER TABLE players DROP CONSTRAINT IF EXISTS chk_players_display_name_not_blank;
ALTER TABLE players DROP CONSTRAINT IF EXISTS chk_players_alternate_names_is_array;
ALTER TABLE players DROP CONSTRAINT IF EXISTS chk_players_name_matches_display;

DROP INDEX IF EXISTS idx_players_full_name;
DROP INDEX IF EXISTS idx_players_display_name;
DROP INDEX IF EXISTS idx_players_alternate_names_gin;

-- Remove non-required name detail columns.
ALTER TABLE players
  DROP COLUMN IF EXISTS full_name,
  DROP COLUMN IF EXISTS first_name,
  DROP COLUMN IF EXISTS last_name,
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS alternate_names;

COMMIT;
