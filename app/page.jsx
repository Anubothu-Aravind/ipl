import PlayersTable from "../components/PlayersTable";
import { query } from "../src/config/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const FIRST_IPL_SEASON = 2008;

function parseSeasonParam(searchParams = {}) {
  const rawValue = getSearchParamValue(searchParams, "season");
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null;
  }

  const parsed = Number(rawValue);
  const maxSeason = new Date().getFullYear() + 1;

  if (!Number.isInteger(parsed) || parsed < FIRST_IPL_SEASON || parsed > maxSeason) {
    return null;
  }

  return parsed;
}

function encodeCursor(player) {
  return Buffer.from(JSON.stringify({ name: player.name, id: player.id })).toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);

    if (!parsed || typeof parsed.name !== "string" || (typeof parsed.id !== "number" && typeof parsed.id !== "string")) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function getSearchParamValue(searchParams, key) {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

async function getSeasonOptions() {
  const result = await query(
    `
    SELECT DISTINCT season
    FROM player_season_stats
    WHERE season >= $1
    ORDER BY season DESC
    `,
    [FIRST_IPL_SEASON],
  );

  return result.rows
    .map((row) => Number(row.season))
    .filter((season) => Number.isInteger(season));
}

async function getPlayers(searchParams = {}, selectedSeason = parseSeasonParam(searchParams)) {
  const nameExpr = "p.name";
  const fullNameExpr = "p.name";
  const firstNameExpr = "NULL::text";
  const lastNameExpr = "NULL::text";
  const alternateNamesExpr = "'[]'::jsonb";
  const currentTeamExpr = selectedSeason !== null
    ? "COALESCE(t_season.short_code, t.short_code)"
    : "t.short_code";
  const cursor = decodeCursor(getSearchParamValue(searchParams, "cursor"));
  const direction = getSearchParamValue(searchParams, "direction") === "backward" ? "backward" : "forward";
  const rawQuery = getSearchParamValue(searchParams, "q");
  const searchQuery = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const hasCursor = Boolean(cursor);
  const effectiveDirection = hasCursor && direction === "backward" ? "backward" : "forward";
  const params = [];
  const whereClauses = [];
  let seasonParam = null;

  if (selectedSeason !== null) {
    params.push(selectedSeason);
    seasonParam = params.length;
  }

  const orderClause = effectiveDirection === "backward"
    ? `ORDER BY ${nameExpr} DESC, p.id DESC`
    : `ORDER BY ${nameExpr} ASC, p.id ASC`;

  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    const searchParam = params.length;
    whereClauses.push(`p.name ILIKE $${searchParam}`);
  }

  if (hasCursor) {
    params.push(cursor.name, Number(cursor.id));
    const cursorNameParam = params.length - 1;
    const cursorIdParam = params.length;
    whereClauses.push(
      effectiveDirection === "backward"
        ? `(${nameExpr}, p.id) < ($${cursorNameParam}, $${cursorIdParam})`
        : `(${nameExpr}, p.id) > ($${cursorNameParam}, $${cursorIdParam})`
    );
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const statsJoinClause = selectedSeason !== null
    ? `
      JOIN player_season_stats ps_selected
        ON ps_selected.player_id = p.id
       AND ps_selected.season = $${seasonParam}
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(ps.matches), 0)::int AS matches,
          COALESCE(SUM(ps.runs), 0)::int AS runs,
          COALESCE(SUM(ps.wickets), 0)::int AS wickets,
          CASE
            WHEN SUM(CASE WHEN ps.strike_rate > 0 THEN ps.matches ELSE 0 END) > 0
              THEN ROUND(
                SUM(CASE WHEN ps.strike_rate > 0 THEN ps.matches * ps.strike_rate ELSE 0 END)::numeric /
                SUM(CASE WHEN ps.strike_rate > 0 THEN ps.matches ELSE 0 END),
                2
              )
            ELSE 0
          END AS strike_rate,
          CASE
            WHEN SUM(CASE WHEN ps.economy > 0 THEN ps.matches ELSE 0 END) > 0
              THEN ROUND(
                SUM(CASE WHEN ps.economy > 0 THEN ps.matches * ps.economy ELSE 0 END)::numeric /
                SUM(CASE WHEN ps.economy > 0 THEN ps.matches ELSE 0 END),
                2
              )
            ELSE 0
          END AS economy
        FROM player_season_stats ps
        WHERE ps.player_id = p.id
          AND ps.season <= $${seasonParam}
      ) s ON TRUE
    `
    : `
      LEFT JOIN player_stats s ON s.player_id = p.id
      LEFT JOIN player_season_stats ps_selected ON FALSE
    `;

  params.push(PAGE_SIZE + 1);

  const sql = `
    SELECT
      p.id,
      ${nameExpr} AS name,
      ${fullNameExpr} AS full_name,
      ${firstNameExpr} AS first_name,
      ${lastNameExpr} AS last_name,
      ${alternateNamesExpr} AS alternate_names,
      CASE
        WHEN p.country IS NULL THEN NULL
        WHEN btrim(p.country) = '' THEN NULL
        WHEN lower(btrim(p.country)) IN ('-', '--', 'na', 'n/a', 'null', 'unknown') THEN NULL
        WHEN lower(btrim(p.country)) IN ('bcci', 'board of control for cricket in india') THEN 'India'
        ELSE p.country
      END AS country,
      p.role,
      p.is_active,
      ${currentTeamExpr} AS current_team,
      COALESCE(s.matches, 0)::int AS matches,
      ${selectedSeason !== null ? "COALESCE(s.matches, 0)::int" : "COALESCE(s.innings, 0)::int"} AS innings,
      COALESCE(s.runs, 0)::int AS runs,
      ${selectedSeason !== null ? "0::int" : "COALESCE(s.highest_score, 0)::int"} AS highest_score,
      ${selectedSeason !== null ? "0::numeric" : "COALESCE(s.average, 0)::numeric"} AS average,
      COALESCE(s.wickets, 0)::int AS wickets,
      COALESCE(s.strike_rate, 0)::numeric AS strike_rate,
      ${selectedSeason !== null ? "0::int" : "COALESCE(s.hundreds, 0)::int"} AS hundreds,
      ${selectedSeason !== null ? "0::int" : "COALESCE(s.fifties, 0)::int"} AS fifties,
      COALESCE(s.economy, 0)::numeric AS economy,
      ${selectedSeason !== null ? "COALESCE(s.matches, 0)::int" : "COALESCE(s.bowling_innings, 0)::int"} AS bowling_innings,
      ${selectedSeason !== null ? "0::numeric" : "COALESCE(s.bowling_average, 0)::numeric"} AS bowling_average,
      ${selectedSeason !== null ? "0::int" : "COALESCE(s.four_w_hauls, 0)::int"} AS four_w_hauls,
      ${selectedSeason !== null ? "0::int" : "COALESCE(s.five_w_hauls, 0)::int"} AS five_w_hauls,
      ${selectedSeason !== null ? "0::int" : "COALESCE(s.dot_balls, 0)::int"} AS dot_balls,
      ${selectedSeason !== null
    ? "ROUND((COALESCE(s.runs, 0) * 0.03 + COALESCE(s.wickets, 0) * 2 + COALESCE(s.strike_rate, 0) * 0.05 - COALESCE(s.economy, 0) * 0.2)::numeric, 2)"
    : "COALESCE(s.balance_metric, 0)::numeric"} AS balance_metric,
      ${selectedSeason !== null ? "NULL::text" : "s.best_bowling"} AS best_bowling
      ${selectedSeason !== null
    ? `,
      COALESCE(ps_selected.matches, 0)::int AS season_matches,
      COALESCE(ps_selected.runs, 0)::int AS season_runs,
      COALESCE(ps_selected.wickets, 0)::int AS season_wickets,
      COALESCE(ps_selected.strike_rate, 0)::numeric AS season_strike_rate,
      COALESCE(ps_selected.economy, 0)::numeric AS season_economy`
    : `,
      NULL::int AS season_matches,
      NULL::int AS season_runs,
      NULL::int AS season_wickets,
      NULL::numeric AS season_strike_rate,
      NULL::numeric AS season_economy`}
    FROM players p
    LEFT JOIN teams t ON t.id = p.current_team_id
    ${statsJoinClause}
    LEFT JOIN teams t_season ON t_season.id = ps_selected.team_id
    ${whereClause}
    ${orderClause}
    LIMIT $${params.length}
  `;

  const result = await query(sql, params);
  const orderedRows = direction === "backward" ? result.rows.reverse() : result.rows;
  const hasMoreRows = orderedRows.length > PAGE_SIZE;
  const players = hasMoreRows ? orderedRows.slice(0, PAGE_SIZE) : orderedRows;

  return {
    players,
    pagination: {
      hasPreviousPage: effectiveDirection === "forward" ? hasCursor : hasMoreRows,
      hasNextPage: effectiveDirection === "forward" ? hasMoreRows : hasCursor,
      previousCursor: players.length > 0 ? encodeCursor(players[0]) : null,
      nextCursor: players.length > 0 ? encodeCursor(players[players.length - 1]) : null,
      direction: effectiveDirection,
      pageSize: PAGE_SIZE,
      searchQuery,
      selectedSeason,
    },
  };
}

async function getPlayerCount(searchParams = {}, selectedSeason = parseSeasonParam(searchParams)) {
  const rawQuery = getSearchParamValue(searchParams, "q");
  const searchQuery = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const params = [];
  const whereClauses = [];
  let seasonJoin = "";

  if (selectedSeason !== null) {
    params.push(selectedSeason);
    seasonJoin = `JOIN player_season_stats ps ON ps.player_id = p.id AND ps.season = $${params.length}`;
  }

  if (!searchQuery && selectedSeason === null) {
    const result = await query("SELECT COUNT(*)::int AS total FROM players");
    return result.rows[0]?.total ?? 0;
  }

  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    whereClauses.push(`p.name ILIKE $${params.length}`);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const result = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM players p
    ${seasonJoin}
    ${whereClause}
    `,
    params,
  );

  return result.rows[0]?.total ?? 0;
}

async function getRoleSnapshot(searchParams = {}, selectedSeason = parseSeasonParam(searchParams)) {
  const rawQuery = getSearchParamValue(searchParams, "q");
  const searchQuery = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const params = [];
  const whereClauses = [];

  if (searchQuery) {
    params.push(`%${searchQuery}%`);
    whereClauses.push(`p.name ILIKE $${params.length}`);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const normalizedRoleExpr = `
    CASE
      WHEN p.role IS NULL OR btrim(p.role) = '' THEN 'Unknown'
      WHEN POSITION('all' IN lower(p.role)) > 0 THEN 'All-Rounder'
      WHEN POSITION('wicket' IN lower(p.role)) > 0 THEN 'Wicketkeeper'
      WHEN POSITION('bowl' IN lower(p.role)) > 0 THEN 'Bowler'
      WHEN POSITION('bat' IN lower(p.role)) > 0 THEN 'Batter'
      ELSE p.role
    END
  `;

  let sql;

  if (selectedSeason !== null) {
    params.unshift(selectedSeason);

    sql = `
      WITH pool AS (
        SELECT
          p.id,
          p.name,
          ${normalizedRoleExpr} AS normalized_role,
          COALESCE(t_season.short_code, t.short_code) AS current_team,
          COALESCE(s.runs, 0)::int AS runs,
          COALESCE(s.wickets, 0)::int AS wickets,
          COALESCE(s.strike_rate, 0)::numeric AS strike_rate,
          COALESCE(s.economy, 0)::numeric AS economy,
          COALESCE(ps_selected.runs, 0)::int AS season_runs,
          COALESCE(ps_selected.wickets, 0)::int AS season_wickets,
          COALESCE(ps_selected.strike_rate, 0)::numeric AS season_strike_rate,
          COALESCE(ps_selected.economy, 0)::numeric AS season_economy
        FROM players p
        JOIN player_season_stats ps_selected
          ON ps_selected.player_id = p.id
         AND ps_selected.season = $1
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(ps.runs), 0)::int AS runs,
            COALESCE(SUM(ps.wickets), 0)::int AS wickets,
            CASE
              WHEN SUM(CASE WHEN ps.strike_rate > 0 THEN ps.matches ELSE 0 END) > 0
                THEN ROUND(
                  SUM(CASE WHEN ps.strike_rate > 0 THEN ps.matches * ps.strike_rate ELSE 0 END)::numeric /
                  SUM(CASE WHEN ps.strike_rate > 0 THEN ps.matches ELSE 0 END),
                  2
                )
              ELSE 0
            END AS strike_rate,
            CASE
              WHEN SUM(CASE WHEN ps.economy > 0 THEN ps.matches ELSE 0 END) > 0
                THEN ROUND(
                  SUM(CASE WHEN ps.economy > 0 THEN ps.matches * ps.economy ELSE 0 END)::numeric /
                  SUM(CASE WHEN ps.economy > 0 THEN ps.matches ELSE 0 END),
                  2
                )
              ELSE 0
            END AS economy
          FROM player_season_stats ps
          WHERE ps.player_id = p.id
            AND ps.season <= $1
        ) s ON TRUE
        LEFT JOIN teams t ON t.id = p.current_team_id
        LEFT JOIN teams t_season ON t_season.id = ps_selected.team_id
        ${whereClause}
      ),
      scored AS (
        SELECT
          *,
          CASE
            WHEN normalized_role = 'Batter' THEN COALESCE(season_runs, 0) + COALESCE(season_strike_rate, 0) * 2
            WHEN normalized_role = 'Bowler' THEN COALESCE(season_wickets, 0) * 24 - COALESCE(season_economy, 0) * 9
            WHEN normalized_role = 'All-Rounder' THEN COALESCE(season_runs, 0) * 0.55 + COALESCE(season_wickets, 0) * 22 + COALESCE(season_strike_rate, 0) * 0.7
            WHEN normalized_role = 'Wicketkeeper' THEN COALESCE(season_runs, 0) * 0.75 + COALESCE(season_strike_rate, 0) * 1.4
            ELSE COALESCE(season_runs, 0) + COALESCE(season_wickets, 0) * 12
          END AS score
        FROM pool
      ),
      ranked AS (
        SELECT
          *,
          COUNT(*) OVER (PARTITION BY normalized_role)::int AS role_count,
          ROW_NUMBER() OVER (
            PARTITION BY normalized_role
            ORDER BY score DESC, season_runs DESC, season_wickets DESC, name ASC, id ASC
          ) AS role_rank
        FROM scored
      )
      SELECT
        id,
        name,
        normalized_role,
        current_team,
        runs,
        wickets,
        strike_rate,
        economy,
        season_runs,
        season_wickets,
        season_strike_rate,
        season_economy,
        role_count
      FROM ranked
      WHERE role_rank <= 3
      ORDER BY normalized_role ASC, role_rank ASC
    `;
  } else {
    sql = `
      WITH pool AS (
        SELECT
          p.id,
          p.name,
          ${normalizedRoleExpr} AS normalized_role,
          t.short_code AS current_team,
          COALESCE(s.runs, 0)::int AS runs,
          COALESCE(s.wickets, 0)::int AS wickets,
          COALESCE(s.average, 0)::numeric AS average,
          COALESCE(s.strike_rate, 0)::numeric AS strike_rate,
          COALESCE(s.economy, 0)::numeric AS economy,
          COALESCE(s.dot_balls, 0)::int AS dot_balls,
          NULL::int AS season_runs,
          NULL::int AS season_wickets,
          NULL::numeric AS season_strike_rate,
          NULL::numeric AS season_economy
        FROM players p
        LEFT JOIN player_stats s ON s.player_id = p.id
        LEFT JOIN teams t ON t.id = p.current_team_id
        ${whereClause}
      ),
      scored AS (
        SELECT
          *,
          CASE
            WHEN normalized_role = 'Batter' THEN COALESCE(runs, 0) + COALESCE(strike_rate, 0) * 2 + COALESCE(average, 0) * 4
            WHEN normalized_role = 'Bowler' THEN COALESCE(wickets, 0) * 24 + COALESCE(dot_balls, 0) * 0.35 - COALESCE(economy, 0) * 9
            WHEN normalized_role = 'All-Rounder' THEN COALESCE(runs, 0) * 0.55 + COALESCE(wickets, 0) * 22 + COALESCE(average, 0) * 2 + COALESCE(strike_rate, 0) * 0.7
            WHEN normalized_role = 'Wicketkeeper' THEN COALESCE(runs, 0) * 0.75 + COALESCE(strike_rate, 0) * 1.4 + COALESCE(average, 0) * 2
            ELSE COALESCE(runs, 0) + COALESCE(wickets, 0) * 12
          END AS score
        FROM pool
      ),
      ranked AS (
        SELECT
          *,
          COUNT(*) OVER (PARTITION BY normalized_role)::int AS role_count,
          ROW_NUMBER() OVER (
            PARTITION BY normalized_role
            ORDER BY score DESC, runs DESC, wickets DESC, name ASC, id ASC
          ) AS role_rank
        FROM scored
      )
      SELECT
        id,
        name,
        normalized_role,
        current_team,
        runs,
        wickets,
        strike_rate,
        economy,
        season_runs,
        season_wickets,
        season_strike_rate,
        season_economy,
        role_count
      FROM ranked
      WHERE role_rank <= 3
      ORDER BY normalized_role ASC, role_rank ASC
    `;
  }

  const result = await query(sql, params);
  const grouped = {
    Batter: 0,
    Bowler: 0,
    "All-Rounder": 0,
    Wicketkeeper: 0,
  };

  const topPerformers = {
    Batter: [],
    Bowler: [],
    "All-Rounder": [],
    Wicketkeeper: [],
  };

  for (const row of result.rows) {
    const role = row.normalized_role;

    if (!Object.prototype.hasOwnProperty.call(topPerformers, role)) {
      continue;
    }

    if (grouped[role] === 0) {
      grouped[role] = Number(row.role_count) || 0;
    }

    topPerformers[role].push(row);
  }

  return { grouped, topPerformers };
}

function buildPageHref(cursor, direction, searchQuery, selectedSeason) {
  if (!cursor) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("cursor", cursor);
  params.set("direction", direction);
  if (searchQuery) {
    params.set("q", searchQuery);
  }
  if (selectedSeason) {
    params.set("season", String(selectedSeason));
  }
  return `?${params.toString()}`;
}

export default async function HomePage({ searchParams }) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const requestedSeason = parseSeasonParam(resolvedSearchParams);
  const seasonOptions = await getSeasonOptions();
  const selectedSeason =
    requestedSeason !== null && seasonOptions.includes(requestedSeason)
      ? requestedSeason
      : null;
  const seasonWarning =
    requestedSeason !== null && selectedSeason === null
      ? `Season ${requestedSeason} is unavailable in the current dataset.`
      : null;

  const [{ players, pagination }, totalPlayers, roleSummary] = await Promise.all([
    getPlayers(resolvedSearchParams, selectedSeason),
    getPlayerCount(resolvedSearchParams, selectedSeason),
    getRoleSnapshot(resolvedSearchParams, selectedSeason),
  ]);

  const countryCount = new Set(
    players
      .map((player) => player.country)
      .filter((country) => typeof country === "string" && country.trim())
  ).size;

  const paginationProps = {
    ...pagination,
    totalPlayers,
    totalCountries: countryCount,
    previousHref: pagination.hasPreviousPage
      ? buildPageHref(pagination.previousCursor, "backward", pagination.searchQuery, selectedSeason)
      : null,
    nextHref: pagination.hasNextPage
      ? buildPageHref(pagination.nextCursor, "forward", pagination.searchQuery, selectedSeason)
      : null,
  };

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-8 md:px-8">
      <section className="mb-8 rounded-3xl border border-slate-700/60 bg-slate-900/65 p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.25em] text-sky-300">IPL Intelligence</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">
          Full IPL Player Universe
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
          Live from your Neon database: player profile, team mapping, and role-aware career performance snapshots.
        </p>
        {seasonWarning ? (
          <p className="mt-2 text-sm font-semibold text-amber-300">{seasonWarning}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
          <div className="inline-flex items-center rounded-full border border-mint/50 bg-mint/15 px-4 py-1 text-mint">
            {players.length} players on this page
          </div>
          <div className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/10 px-4 py-1 text-sky-200">
            {countryCount} countries represented
          </div>
          <div className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800/80 px-4 py-1 text-slate-200">
            {totalPlayers} total players
          </div>
          <div className="inline-flex items-center rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-1 text-violet-200">
            Season: {selectedSeason ?? "All"}
          </div>
        </div>
      </section>

      <PlayersTable
        players={players}
        pagination={paginationProps}
        seasonOptions={seasonOptions}
        selectedSeason={selectedSeason}
        roleSummary={roleSummary}
      />
    </main>
  );
}
