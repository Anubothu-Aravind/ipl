import PlayersTable from "../components/PlayersTable";
import { query } from "../src/config/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

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

async function getPlayers(searchParams = {}) {
  const nameExpr = "p.name";
  const fullNameExpr = "p.name";
  const firstNameExpr = "NULL::text";
  const lastNameExpr = "NULL::text";
  const alternateNamesExpr = "'[]'::jsonb";
  const cursor = decodeCursor(getSearchParamValue(searchParams, "cursor"));
  const direction = getSearchParamValue(searchParams, "direction") === "backward" ? "backward" : "forward";
  const rawQuery = getSearchParamValue(searchParams, "q");
  const searchQuery = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const hasCursor = Boolean(cursor);
  const effectiveDirection = hasCursor && direction === "backward" ? "backward" : "forward";
  const params = [];
  const whereClauses = [];
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
      t.short_code AS current_team,
      s.matches,
      s.innings,
      s.runs,
      s.highest_score,
      s.average,
      s.wickets,
      s.strike_rate,
      s.hundreds,
      s.fifties,
      s.economy,
      s.bowling_innings,
      s.bowling_average,
      s.four_w_hauls,
      s.five_w_hauls,
      s.dot_balls,
      s.balance_metric,
      s.best_bowling
    FROM players p
    LEFT JOIN teams t ON t.id = p.current_team_id
    LEFT JOIN player_stats s ON s.player_id = p.id
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
    },
  };
}

async function getPlayerCount(searchParams = {}) {
  const rawQuery = getSearchParamValue(searchParams, "q");
  const searchQuery = typeof rawQuery === "string" ? rawQuery.trim() : "";

  if (!searchQuery) {
    const result = await query("SELECT COUNT(*)::int AS total FROM players");
    return result.rows[0]?.total ?? 0;
  }

  const result = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM players p
    WHERE p.name ILIKE $1
    `,
    [`%${searchQuery}%`],
  );

  return result.rows[0]?.total ?? 0;
}

function buildPageHref(cursor, direction, searchQuery) {
  if (!cursor) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("cursor", cursor);
  params.set("direction", direction);
  if (searchQuery) {
    params.set("q", searchQuery);
  }
  return `?${params.toString()}`;
}

export default async function HomePage({ searchParams }) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const [{ players, pagination }, totalPlayers] = await Promise.all([
    getPlayers(resolvedSearchParams),
    getPlayerCount(resolvedSearchParams),
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
      ? buildPageHref(pagination.previousCursor, "backward", pagination.searchQuery)
      : null,
    nextHref: pagination.hasNextPage
      ? buildPageHref(pagination.nextCursor, "forward", pagination.searchQuery)
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
        </div>
      </section>

      <PlayersTable players={players} pagination={paginationProps} />
    </main>
  );
}
