BEGIN;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE players
SET last_updated_at = COALESCE(last_updated_at, CURRENT_TIMESTAMP)
WHERE last_updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_players_last_updated_at ON players(last_updated_at);

COMMIT;