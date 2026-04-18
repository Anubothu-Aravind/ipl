BEGIN;

-- Remove auction-specific tables not used by the player intelligence frontend.
DROP TABLE IF EXISTS squad_players;
DROP TABLE IF EXISTS bids;
DROP TABLE IF EXISTS auction_pool;
DROP TABLE IF EXISTS nominations;
DROP TABLE IF EXISTS room_participants;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS rooms;

-- Remove unused profile columns from players.
ALTER TABLE players
  DROP COLUMN IF EXISTS batting_style,
  DROP COLUMN IF EXISTS bowling_style,
  DROP COLUMN IF EXISTS image_url;

-- Ensure country always has a displayable value.
ALTER TABLE players
  ALTER COLUMN country SET DEFAULT 'Unknown';

UPDATE players
SET country = 'Unknown'
WHERE country IS NULL OR btrim(country) = '';

COMMIT;
