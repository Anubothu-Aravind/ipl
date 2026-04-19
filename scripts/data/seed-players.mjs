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
  ["Deccan Chargers", "DCG"],
  ["Pune Warriors", "PWI"],
  ["Rising Pune Supergiant", "RPS"],
  ["Kochi Tuskers Kerala", "KTK"],
  ["Gujarat Lions", "GL"],
];

const COUNTRY_PLACEHOLDERS = new Set([
  "",
  "-",
  "--",
  "na",
  "n/a",
  "null",
  "unknown",
  "unknown country",
]);

function normalizeName(name) {
  if (typeof name !== "string") {
    return "";
  }

  return name.trim().replace(/\s+/g, " ");
}

function normalizeOptionalName(value) {
  const normalized = normalizeName(value);
  return normalized ? normalized : null;
}

function canonicalKey(name) {
  return normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hasValidCountry(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return !COUNTRY_PLACEHOLDERS.has(trimmed.toLowerCase());
}

function toCountryBucket(value) {
  if (!hasValidCountry(value)) {
    return null;
  }

  if (value.trim().toLowerCase() === "india" || value.trim().toLowerCase() === "indian") {
    return "Indian";
  }

  return "Overseas Player";
}

function splitNameParts(fullName) {
  const tokens = fullName.split(" ").filter(Boolean);
  if (tokens.length < 2) {
    return {
      first_name: null,
      last_name: null,
    };
  }

  return {
    first_name: tokens[0],
    last_name: tokens[tokens.length - 1],
  };
}

function normalizeAlternateNames(rawAliases, fallbackNames, displayName) {
  const values = [
    ...(Array.isArray(rawAliases) ? rawAliases : []),
    ...fallbackNames,
  ];

  const normalizedDisplayName = normalizeOptionalName(displayName);
  const seen = new Set();
  const aliases = [];

  for (const value of values) {
    const normalized = normalizeOptionalName(value);
    if (!normalized) {
      continue;
    }

    if (normalizedDisplayName && normalized === normalizedDisplayName) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    aliases.push(normalized);
  }

  return aliases;
}

function isOverseas(country) {
  if (!country) {
    return false;
  }
  const lowered = country.toLowerCase();
  return lowered === "overseas player" || lowered === "overseas";
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

  const columnsPerRow = 28;
  const chunks = chunkArray(players, 250);
  for (const chunk of chunks) {
    const values = [];
    const params = [];

    chunk.forEach((player, index) => {
      const fallbackName = normalizeOptionalName(player.name) ?? "Unknown Player";
      const displayName = normalizeOptionalName(player.full_name) ?? normalizeOptionalName(player.display_name) ?? fallbackName;
      const countryBucket = toCountryBucket(player.country);
      const offset = index * columnsPerRow;

      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21}, $${offset + 22}, $${offset + 23}, $${offset + 24}, $${offset + 25}, $${offset + 26}, $${offset + 27}, $${offset + 28})`);

      params.push(
        displayName,
        countryBucket,
        player.role ?? null,
        player.batting_style ?? null,
        player.bowling_style ?? null,
        player.current_team_short_code ?? null,
        player.is_active ?? false,
        isOverseas(countryBucket),
        normalizeOptionalName(player.canonical_key) ?? canonicalKey(fallbackName),
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
  let players = JSON.parse(raw);

  // Row-by-row normalization of country to only 2 options.
  players = players.map((player) => {
    const bucket = toCountryBucket(player.country);
    if (bucket && bucket !== player.country) {
      process.stdout.write(`[UPDATE] ${player.name}: ${player.country ?? "null"} -> ${bucket}\n`);
    }

    return {
      ...player,
      country: bucket,
    };
  });

  // Filter: Remove players with unknown country or no team assignment.
  let removedUnknownCountry = 0;
  let removedNoTeam = 0;
  const filtered = players.filter((player) => {
    if (!player.country) {
      removedUnknownCountry += 1;
      process.stdout.write(`[FILTER] Removing ${player.name}: Unknown Country\n`);
      return false;
    }

    if (!player.current_team_short_code) {
      removedNoTeam += 1;
      process.stdout.write(`[FILTER] Removing ${player.name}: No Team\n`);
      return false;
    }

    return true;
  });

  const removedTotal = removedUnknownCountry + removedNoTeam;
  process.stdout.write(`\n[FILTER SUMMARY] Removed Unknown Country: ${removedUnknownCountry}\n`);
  process.stdout.write(`[FILTER SUMMARY] Removed No Team: ${removedNoTeam}\n`);
  process.stdout.write(`[FILTER SUMMARY] Removed Total: ${removedTotal}, Seeding: ${filtered.length} players\n\n`);
  players = filtered;

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

    await client.query("DELETE FROM player_season_stats");
    await client.query("DELETE FROM player_team_history");

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
        canonical_key,
        last_updated_at,
        seasons_played
      )
      SELECT
        tp.name,
        NULLIF(btrim(tp.country), ''),
        tp.role,
        t.id,
        tp.is_active,
        tp.is_overseas,
        tp.canonical_key,
        NOW(),
        0
      FROM temp_players tp
      LEFT JOIN teams t ON t.short_code = tp.current_team_short_code
      ON CONFLICT (canonical_key)
      DO UPDATE SET
        name = EXCLUDED.name,
        country = EXCLUDED.country,
        role = EXCLUDED.role,
        current_team_id = EXCLUDED.current_team_id,
        is_active = EXCLUDED.is_active,
        is_overseas = EXCLUDED.is_overseas,
        last_updated_at = NOW()
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

    const historyRows = JSON.parse(await readFile("db/raw/player_team_history.json", "utf8"));
    await client.query(`
      CREATE TEMP TABLE temp_player_team_history (
        canonical_key TEXT,
        team_short_code TEXT,
        from_year INT,
        to_year INT
      ) ON COMMIT DROP
    `);

    const historyColumnsPerRow = 4;
    for (const chunk of chunkArray(historyRows.filter((row) => row.from_year && row.from_year >= 2008), 500)) {
      const values = [];
      const params = [];

      chunk.forEach((row, index) => {
        const offset = index * historyColumnsPerRow;
        values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
        params.push(
          row.canonical_key,
          row.team_short_code,
          row.from_year,
          row.to_year ?? row.from_year,
        );
      });

      await client.query(
        `
        INSERT INTO temp_player_team_history (
          canonical_key,
          team_short_code,
          from_year,
          to_year
        )
        VALUES ${values.join(",")}
        `,
        params,
      );
    }

    await client.query(
      `
      INSERT INTO player_team_history (
        player_id,
        team_id,
        from_year,
        to_year
      )
      SELECT
        p.id,
        t.id,
        h.from_year,
        h.to_year
      FROM temp_player_team_history h
      JOIN players p ON p.canonical_key = h.canonical_key
      JOIN teams t ON t.short_code = h.team_short_code
      `,
    );

    const seasonRows = JSON.parse(await readFile("db/raw/player_season_stats.json", "utf8"));
    await client.query(`
      CREATE TEMP TABLE temp_season_stats (
        canonical_key TEXT,
        season INT,
        team_short_code TEXT,
        matches INT,
        runs INT,
        wickets INT,
        strike_rate NUMERIC,
        economy NUMERIC
      ) ON COMMIT DROP
    `);

    const seasonColumnsPerRow = 8;
    for (const chunk of chunkArray(seasonRows.filter((row) => row.season && row.season >= 2008), 500)) {
      const values = [];
      const params = [];

      chunk.forEach((row, index) => {
        const offset = index * seasonColumnsPerRow;
        values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`);
        params.push(
          row.canonical_key,
          row.season,
          row.team_short_code,
          row.matches ?? 0,
          row.runs ?? 0,
          row.wickets ?? 0,
          row.strike_rate ?? 0,
          row.economy ?? 0,
        );
      });

      await client.query(
        `
        INSERT INTO temp_season_stats (
          canonical_key,
          season,
          team_short_code,
          matches,
          runs,
          wickets,
          strike_rate,
          economy
        )
        VALUES ${values.join(",")}
        `,
        params,
      );
    }

    await client.query(
      `
      INSERT INTO player_season_stats (
        player_id,
        season,
        team_id,
        matches,
        runs,
        wickets,
        strike_rate,
        economy
      )
      SELECT
        p.id,
        s.season,
        t.id,
        s.matches,
        s.runs,
        s.wickets,
        s.strike_rate,
        s.economy
      FROM temp_season_stats s
      JOIN players p ON p.canonical_key = s.canonical_key
      LEFT JOIN teams t ON t.short_code = s.team_short_code
      ON CONFLICT (player_id, season)
      DO UPDATE SET
        team_id = EXCLUDED.team_id,
        matches = EXCLUDED.matches,
        runs = EXCLUDED.runs,
        wickets = EXCLUDED.wickets,
        strike_rate = EXCLUDED.strike_rate,
        economy = EXCLUDED.economy
      `,
    );

    await client.query(
      `
      UPDATE players p
      SET seasons_played = COALESCE(
        (
          SELECT COUNT(*)::int
          FROM player_season_stats ps
          WHERE ps.player_id = p.id
        ),
        0
      )
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
