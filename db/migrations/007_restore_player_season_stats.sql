BEGIN;

CREATE TABLE IF NOT EXISTS player_season_stats (
    id SERIAL PRIMARY KEY,
    player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    season INT NOT NULL,
    team_id INT REFERENCES teams(id),
    matches INT NOT NULL DEFAULT 0,
    runs INT NOT NULL DEFAULT 0,
    wickets INT NOT NULL DEFAULT 0,
    strike_rate DECIMAL(7,2) NOT NULL DEFAULT 0,
    economy DECIMAL(7,2) NOT NULL DEFAULT 0,
    UNIQUE (player_id, season),
    CHECK (season >= 2008)
);

CREATE INDEX IF NOT EXISTS idx_player_season_stats_player_season
    ON player_season_stats(player_id, season);

CREATE INDEX IF NOT EXISTS idx_player_season_stats_season
    ON player_season_stats(season);

COMMIT;