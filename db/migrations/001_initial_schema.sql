BEGIN;

CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    short_code VARCHAR(10) UNIQUE
);

CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(50),
    role VARCHAR(30),
    batting_style VARCHAR(50),
    bowling_style VARCHAR(50),
    current_team_id INT REFERENCES teams(id),
    image_url TEXT,
    is_overseas BOOLEAN DEFAULT FALSE,
    canonical_key VARCHAR(150) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_team_history (
    id SERIAL PRIMARY KEY,
    player_id INT REFERENCES players(id) ON DELETE CASCADE,
    team_id INT REFERENCES teams(id),
    from_year INT,
    to_year INT,
    CHECK (from_year >= 2008),
    CHECK (to_year IS NULL OR to_year >= from_year)
);

CREATE TABLE IF NOT EXISTS player_stats (
    player_id INT PRIMARY KEY REFERENCES players(id),
    matches INT DEFAULT 0,
    innings INT DEFAULT 0,
    runs INT DEFAULT 0,
    highest_score INT DEFAULT 0,
    average DECIMAL(5,2) DEFAULT 0,
    strike_rate DECIMAL(5,2) DEFAULT 0,
    hundreds INT DEFAULT 0,
    fifties INT DEFAULT 0,
    fours INT DEFAULT 0,
    sixes INT DEFAULT 0,
    wickets INT DEFAULT 0,
    economy DECIMAL(5,2) DEFAULT 0,
    best_bowling VARCHAR(20),
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_season_stats (
    id SERIAL PRIMARY KEY,
    player_id INT REFERENCES players(id) ON DELETE CASCADE,
    season INT NOT NULL,
    team_id INT REFERENCES teams(id),
    matches INT DEFAULT 0,
    runs INT DEFAULT 0,
    wickets INT DEFAULT 0,
    strike_rate DECIMAL(5,2) DEFAULT 0,
    economy DECIMAL(5,2) DEFAULT 0,
    UNIQUE(player_id, season),
    CHECK (season >= 2008)
);

CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    player_id INT REFERENCES players(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(100) NOT NULL,
    value INT,
    season INT,
    team_id INT REFERENCES teams(id),
    description TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY,
    invite_code VARCHAR(12) UNIQUE NOT NULL,
    room_password_hash TEXT NOT NULL,
    host_user_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'lobby',
    nomination_min INT NOT NULL DEFAULT 5,
    nomination_max INT NOT NULL DEFAULT 15,
    budget_per_team INT NOT NULL DEFAULT 100000000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_participants (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_name VARCHAR(40) NOT NULL,
    is_ready BOOLEAN NOT NULL DEFAULT FALSE,
    budget_remaining INT NOT NULL,
    UNIQUE (room_id, user_id),
    UNIQUE (room_id, team_name),
    CHECK (team_name ~ '^[A-Z][a-zA-Z0-9]*$')
);

CREATE TABLE IF NOT EXISTS nominations (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES room_participants(id) ON DELETE CASCADE,
    player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (room_id, participant_id, player_id)
);

CREATE TABLE IF NOT EXISTS auction_pool (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    source_mode VARCHAR(20) NOT NULL,
    nomination_count INT NOT NULL DEFAULT 0,
    position_rank INT NOT NULL,
    UNIQUE (room_id, player_id)
);

CREATE TABLE IF NOT EXISTS bids (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES room_participants(id) ON DELETE CASCADE,
    amount INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS squad_players (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES room_participants(id) ON DELETE CASCADE,
    player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    price INT NOT NULL,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
CREATE INDEX IF NOT EXISTS idx_players_current_team_id ON players(current_team_id);
CREATE INDEX IF NOT EXISTS idx_player_team_history_player_id ON player_team_history(player_id);
CREATE INDEX IF NOT EXISTS idx_player_season_stats_player_season ON player_season_stats(player_id, season);
CREATE INDEX IF NOT EXISTS idx_achievements_player_id ON achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_nominations_room_id ON nominations(room_id);
CREATE INDEX IF NOT EXISTS idx_bids_room_player_created ON bids(room_id, player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_squad_players_participant ON squad_players(room_id, participant_id);

COMMIT;
