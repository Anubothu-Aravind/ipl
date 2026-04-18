import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

const TEAM_ROWS = [
  ["Chennai Super Kings", "CSK"],
  ["Mumbai Indians", "MI"],
  ["Royal Challengers Bengaluru", "RCB"],
  ["Kolkata Knight Riders", "KKR"],
  ["Rajasthan Royals", "RR"],
  ["Sunrisers Hyderabad", "SRH"],
  ["Delhi Capitals", "DC"],
  ["Punjab Kings", "PBKS"],
  ["Lucknow Super Giants", "LSG"],
  ["Gujarat Titans", "GT"],
];

function isOverseas(country) {
  if (!country) {
    return false;
  }
  return country.toLowerCase() !== "india";
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function insertTempPlayers(client, players) {
  await client.query(`
    CREATE TEMP TABLE temp_players (
      name TEXT,
      country TEXT,
      role TEXT,
      batting_style TEXT,
      bowling_style TEXT,
      current_team_short_code TEXT,
      is_active BOOLEAN,
      is_overseas BOOLEAN,
      canonical_key TEXT,
      matches INT,
      innings INT,
      runs INT,
      highest_score INT,
      average NUMERIC,
      strike_rate NUMERIC,
      hundreds INT,
      fifties INT,
      fours INT,
      sixes INT,
      wickets INT,
      economy NUMERIC,
      bowling_innings INT,
      bowling_average NUMERIC,
      four_w_hauls INT,
      five_w_hauls INT,
      dot_balls INT,
      balance_metric NUMERIC,
      best_bowling TEXT
    ) ON COMMIT DROP
  `);

  const chunks = chunkArray(players, 250);
  for (const chunk of chunks) {
    const values = [];
    const params = [];

    chunk.forEach((player, index) => {
      const offset = index * 28;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21}, $${offset + 22}, $${offset + 23}, $${offset + 24}, $${offset + 25}, $${offset + 26}, $${offset + 27}, $${offset + 28})`);

      params.push(
        player.name,
        player.country ?? null,
        player.role ?? null,
        player.batting_style ?? null,
        player.bowling_style ?? null,
        player.current_team_short_code ?? null,
        player.is_active ?? false,
        isOverseas(player.country ?? null),
        player.canonical_key,
        player.matches ?? 0,
        player.innings ?? 0,
        player.runs ?? 0,
        player.highest_score ?? 0,
        player.average ?? 0,
        player.strike_rate ?? 0,
        player.hundreds ?? 0,
        player.fifties ?? 0,
        player.fours ?? 0,
        player.sixes ?? 0,
        player.wickets ?? 0,
        player.economy ?? 0,
        player.bowling_innings ?? 0,
        player.bowling_average ?? 0,
        player.four_w_hauls ?? 0,
        player.five_w_hauls ?? 0,
        player.dot_balls ?? 0,
        player.balance_metric ?? 0,
        player.best_bowling ?? null,
      );
    });

    await client.query(
      `
      INSERT INTO temp_players (
        name,
        country,
        role,
        batting_style,
        bowling_style,
        current_team_short_code,
        is_active,
        is_overseas,
        canonical_key,
        matches,
        innings,
        runs,
        highest_score,
        average,
        strike_rate,
        hundreds,
        fifties,
        fours,
        sixes,
        wickets,
        economy,
        bowling_innings,
        bowling_average,
        four_w_hauls,
        five_w_hauls,
        dot_balls,
        balance_metric,
        best_bowling
      )
      VALUES ${values.join(",")}
      `,
      params,
    );
  }
}

async function upsertTeams(client) {
  for (const [name, shortCode] of TEAM_ROWS) {
    await client.query(
      `
      INSERT INTO teams (name, short_code)
      VALUES ($1, $2)
      ON CONFLICT (short_code)
      DO UPDATE SET name = EXCLUDED.name
      `,
      [name, shortCode],
    );
  }

  const result = await client.query("SELECT id, short_code FROM teams");
  const teamMap = new Map();
  for (const row of result.rows) {
    teamMap.set(row.short_code, row.id);
  }
  return teamMap;
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
  }

  const inputPath = process.argv[2] ?? "db/normalized/players.json";
  const raw = await readFile(inputPath, "utf8");
  const players = JSON.parse(raw);

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");
    const teamMap = await upsertTeams(client);

    await insertTempPlayers(client, players);

    await client.query(
      `
      DELETE FROM player_team_history ph
      USING players p
      LEFT JOIN temp_players tp ON tp.canonical_key = p.canonical_key
      WHERE ph.player_id = p.id
        AND tp.canonical_key IS NULL
      `,
    );

    await client.query(
      `
      DELETE FROM player_stats ps
      USING players p
      LEFT JOIN temp_players tp ON tp.canonical_key = p.canonical_key
      WHERE ps.player_id = p.id
        AND tp.canonical_key IS NULL
      `,
    );

    await client.query(
      `
      DELETE FROM players p
      USING (
        SELECT p2.id
        FROM players p2
        LEFT JOIN temp_players tp ON tp.canonical_key = p2.canonical_key
        WHERE tp.canonical_key IS NULL
      ) stale
      WHERE p.id = stale.id
      `,
    );

    await client.query(
      `
      INSERT INTO players (
        name,
        country,
        role,
        current_team_id,
        is_active,
        is_overseas,
        canonical_key
      )
      SELECT
        tp.name,
        NULLIF(btrim(tp.country), ''),
        tp.role,
        t.id,
        tp.is_active,
        tp.is_overseas,
        tp.canonical_key
      FROM temp_players tp
      LEFT JOIN teams t ON t.short_code = tp.current_team_short_code
      ON CONFLICT (canonical_key)
      DO UPDATE SET
        name = EXCLUDED.name,
        country = EXCLUDED.country,
        role = EXCLUDED.role,
        current_team_id = EXCLUDED.current_team_id,
        is_active = EXCLUDED.is_active,
        is_overseas = EXCLUDED.is_overseas
      `,
    );

    await client.query(
      `
      INSERT INTO player_stats (
        player_id,
        matches,
        innings,
        runs,
        highest_score,
        average,
        strike_rate,
        hundreds,
        fifties,
        fours,
        sixes,
        wickets,
        economy,
        bowling_innings,
        bowling_average,
        four_w_hauls,
        five_w_hauls,
        dot_balls,
        balance_metric,
        best_bowling,
        last_updated_at
      )
      SELECT
        p.id,
        tp.matches,
        tp.innings,
        tp.runs,
        tp.highest_score,
        tp.average,
        tp.strike_rate,
        tp.hundreds,
        tp.fifties,
        tp.fours,
        tp.sixes,
        tp.wickets,
        tp.economy,
        tp.bowling_innings,
        tp.bowling_average,
        tp.four_w_hauls,
        tp.five_w_hauls,
        tp.dot_balls,
        tp.balance_metric,
        tp.best_bowling,
        NOW()
      FROM temp_players tp
      JOIN players p ON p.canonical_key = tp.canonical_key
      ON CONFLICT (player_id)
      DO UPDATE SET
        matches = EXCLUDED.matches,
        innings = EXCLUDED.innings,
        runs = EXCLUDED.runs,
        highest_score = EXCLUDED.highest_score,
        average = EXCLUDED.average,
        strike_rate = EXCLUDED.strike_rate,
        hundreds = EXCLUDED.hundreds,
        fifties = EXCLUDED.fifties,
        fours = EXCLUDED.fours,
        sixes = EXCLUDED.sixes,
        wickets = EXCLUDED.wickets,
        economy = EXCLUDED.economy,
        bowling_innings = EXCLUDED.bowling_innings,
        bowling_average = EXCLUDED.bowling_average,
        four_w_hauls = EXCLUDED.four_w_hauls,
        five_w_hauls = EXCLUDED.five_w_hauls,
        dot_balls = EXCLUDED.dot_balls,
        balance_metric = EXCLUDED.balance_metric,
        best_bowling = EXCLUDED.best_bowling,
        last_updated_at = NOW()
      `,
    );

    await client.query("COMMIT");
    process.stdout.write(`Seeded ${players.length} players successfully.\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
