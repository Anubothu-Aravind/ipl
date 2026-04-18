BEGIN;

DROP INDEX IF EXISTS idx_player_season_stats_player_season;
DROP INDEX IF EXISTS idx_achievements_player_id;

DROP TABLE IF EXISTS achievements;
DROP TABLE IF EXISTS player_season_stats;

COMMIT;
