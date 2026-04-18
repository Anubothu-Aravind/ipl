import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

dotenv.config();

async function loadLookupMaps(client) {
  const players = await client.query("SELECT id, canonical_key FROM players");
  const teams = await client.query("SELECT id, short_code FROM teams");

  const playerMap = new Map();
  for (const row of players.rows) {
    playerMap.set(row.canonical_key, row.id);
  }

  const teamMap = new Map();
  for (const row of teams.rows) {
    teamMap.set(row.short_code, row.id);
  }

  return { playerMap, teamMap };
}

async function seedTeamHistory(client, playerMap, teamMap) {
  const rows = JSON.parse(await readFile("db/raw/player_team_history.json", "utf8"));
  await client.query("DELETE FROM player_team_history");

  for (const row of rows) {
    if (!row.from_year || row.from_year < 2008) {
      continue;
    }
    const playerId = playerMap.get(row.canonical_key);
    const teamId = teamMap.get(row.team_short_code);
    if (!playerId || !teamId) {
      continue;
    }

    await client.query(
      `
      INSERT INTO player_team_history (player_id, team_id, from_year, to_year)
      VALUES ($1, $2, $3, $4)
      `,
      [playerId, teamId, row.from_year, row.to_year],
    );
  }
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");

    const { playerMap, teamMap } = await loadLookupMaps(client);
    await seedTeamHistory(client, playerMap, teamMap);

    await client.query("COMMIT");
    process.stdout.write("Seeded player team history data successfully.\n");
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
