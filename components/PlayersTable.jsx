import Link from "next/link";

const roleMap = {
  Batter: "Batters",
  Bowler: "Bowlers",
  "All-Rounder": "All-Rounders",
  Wicketkeeper: "Keepers",
};

function normalizeRole(role) {
  if (!role) {
    return "Unknown";
  }

  const lowered = role.toLowerCase();

  if (lowered.includes("all")) {
    return "All-Rounder";
  }

  if (lowered.includes("wicket")) {
    return "Wicketkeeper";
  }

  if (lowered.includes("bowl")) {
    return "Bowler";
  }

  if (lowered.includes("bat")) {
    return "Batter";
  }

  return role;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value, digits = 1) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return "-";
  }

  return num.toLocaleString("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits === 0 ? 0 : 1,
  });
}

function formatMilestone(value) {
  const num = Number(value);
  return Number.isFinite(num) ? String(Math.trunc(num)) : "0";
}

function getPerformanceScore(player, role) {
  const runs = toNumber(player.runs);
  const wickets = toNumber(player.wickets);
  const average = toNumber(player.average);
  const strikeRate = toNumber(player.strike_rate);
  const economy = toNumber(player.economy);
  const dotBalls = toNumber(player.dot_balls);

  if (role === "Batter") {
    return runs + strikeRate * 2 + average * 4;
  }

  if (role === "Bowler") {
    return wickets * 24 + dotBalls * 0.35 - economy * 9;
  }

  if (role === "All-Rounder") {
    return runs * 0.55 + wickets * 22 + average * 2 + strikeRate * 0.7;
  }

  if (role === "Wicketkeeper") {
    return runs * 0.75 + strikeRate * 1.4 + average * 2;
  }

  return runs + wickets * 12;
}

function getTopPerformers(players, role) {
  return players
    .filter((player) => normalizeRole(player.role) === role)
    .map((player) => ({
      ...player,
      score: getPerformanceScore(player, role),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function getMetricForRole(player, role) {
  if (role === "Batter") {
    return `${formatNumber(player.runs, 0)} runs`;
  }

  if (role === "Bowler") {
    return `${formatNumber(player.wickets, 0)} wickets`;
  }

  if (role === "All-Rounder") {
    return `${formatNumber(player.runs, 0)}R / ${formatNumber(player.wickets, 0)}W`;
  }

  if (role === "Wicketkeeper") {
    return `${formatNumber(player.runs, 0)} runs`;
  }

  return "-";
}

function getRoleSummary(players) {
  const grouped = {
    Batter: 0,
    Bowler: 0,
    "All-Rounder": 0,
    Wicketkeeper: 0,
  };

  for (const player of players) {
    const normalized = normalizeRole(player.role);
    if (Object.prototype.hasOwnProperty.call(grouped, normalized)) {
      grouped[normalized] += 1;
    }
  }

  return {
    grouped,
    topPerformers: {
      Batter: getTopPerformers(players, "Batter"),
      Bowler: getTopPerformers(players, "Bowler"),
      "All-Rounder": getTopPerformers(players, "All-Rounder"),
      Wicketkeeper: getTopPerformers(players, "Wicketkeeper"),
    },
  };
}

function getRoleBadgeClass(role) {
  const normalized = normalizeRole(role);

  if (normalized === "Batter") {
    return "border-orange-300/45 bg-orange-400/12 text-orange-200";
  }

  if (normalized === "Bowler") {
    return "border-sky-300/45 bg-sky-400/12 text-sky-200";
  }

  if (normalized === "All-Rounder") {
    return "border-emerald-300/45 bg-emerald-400/12 text-emerald-200";
  }

  if (normalized === "Wicketkeeper") {
    return "border-violet-300/45 bg-violet-400/12 text-violet-200";
  }

  return "border-slate-500/45 bg-slate-500/12 text-slate-200";
}

function getPlayerInitials(name) {
  if (!name) {
    return "PL";
  }

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatBestBowling(bestBowling) {
  if (!bestBowling || typeof bestBowling !== "string") {
    return "-";
  }

  return bestBowling;
}

export default function PlayersTable({ players, pagination, seasonOptions = [], selectedSeason = null }) {
  const roleSummary = getRoleSummary(players);
  const clearSeasonHref = pagination.searchQuery
    ? `?q=${encodeURIComponent(pagination.searchQuery)}`
    : "/";

  return (
    <section className="space-y-6 rounded-3xl border border-slate-700/70 bg-slate-950/70 p-4 shadow-panel md:p-6">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/45 p-4 md:p-5">
        <form method="GET" className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Season Filter</p>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {selectedSeason ? `Showing players from season ${selectedSeason}` : "Showing players across all seasons"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pagination.searchQuery ? <input type="hidden" name="q" value={pagination.searchQuery} /> : null}
            <label htmlFor="season" className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">
              Season
            </label>
            <select
              id="season"
              name="season"
              defaultValue={selectedSeason ? String(selectedSeason) : ""}
              className="rounded-full border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 outline-none ring-sky-400/40 transition focus:ring-2"
            >
              <option value="">All</option>
              {seasonOptions.map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="inline-flex items-center rounded-full border border-sky-400/60 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-sky-100 transition hover:border-sky-300 hover:bg-sky-400/20"
            >
              Apply
            </button>

            {selectedSeason ? (
              <Link
                href={clearSeasonHref}
                className="inline-flex items-center rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-200 transition hover:border-slate-400 hover:text-white"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Role Snapshot</p>
            <h2 className="mt-1 text-2xl font-bold text-white">
              Player Performance Snapshot {selectedSeason ? `(up to ${selectedSeason})` : ""}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {Object.entries(roleSummary.grouped).map(([role, count]) => (
              <span
                key={role}
                className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold ${getRoleBadgeClass(role)}`}
              >
                {roleMap[role] ?? role}: {count}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(roleSummary.topPerformers).map(([role, topPlayers]) => (
            <article key={role} className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Top {roleMap[role] ?? role}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getRoleBadgeClass(role)}`}>
                  {roleSummary.grouped[role] ?? 0}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {topPlayers.length === 0 && <li className="text-xs text-slate-500">No players in this role</li>}
                {topPlayers.map((player) => (
                  <li key={player.id} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-600/80 bg-slate-800/70 text-[10px] font-bold text-slate-200">
                        {getPlayerInitials(player.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-100">{player.name}</p>
                        <p className="truncate text-[11px] text-slate-400">{player.current_team ?? "No Team"}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-sky-200">{getMetricForRole(player, role)}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/45">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] divide-y divide-slate-700/70">
            <thead className="bg-slate-900/80">
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-400">
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Batting</th>
                <th className="px-4 py-3">Bowling</th>
                <th className="px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-sm text-slate-200">
              {players.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No players found in the database.
                  </td>
                </tr>
              )}

              {players.map((player) => {
                const battingLine = `${formatNumber(player.runs, 0)} runs | Avg ${formatNumber(player.average, 2)} | SR ${formatNumber(
                  player.strike_rate,
                  2
                )}`;
                const milestoneLine = `${formatMilestone(player.fifties)} / ${formatMilestone(player.hundreds)}`;
                const bowlingLine = `${formatNumber(player.wickets, 0)} wkts | Econ ${formatNumber(player.economy, 2)} | BBI ${formatBestBowling(
                  player.best_bowling
                )}`;

                return (
                  <tr key={player.id} className="transition-colors hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-xs font-black text-slate-100">
                          {getPlayerInitials(player.name)}
                        </span>
                        <div>
                          <p className="font-semibold text-white">{player.name}</p>
                          <p className="text-xs text-slate-400">{player.country ?? "Unknown Country"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getRoleBadgeClass(
                            player.role
                          )}`}
                        >
                          {normalizeRole(player.role)}
                        </span>
                        {player.is_active ? (
                          <span className="inline-flex w-fit items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex w-fit items-center rounded-full border border-slate-500/40 bg-slate-700/30 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{player.current_team ?? "No Team"}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-100">{battingLine}</p>
                      <p className="mt-1 text-xs text-slate-400">50s / 100s: {milestoneLine}</p>
                      {selectedSeason ? (
                        <p className="mt-1 text-xs text-violet-300">
                          Season {selectedSeason}: {formatNumber(player.season_runs, 0)} runs in {formatNumber(player.season_matches, 0)} matches
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-300">{bowlingLine}</p>
                      {selectedSeason ? (
                        <p className="mt-1 text-xs text-violet-300">
                          Season {selectedSeason}: {formatNumber(player.season_wickets, 0)} wkts | SR {formatNumber(player.season_strike_rate, 2)} | Econ {formatNumber(player.season_economy, 2)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-sky-400/35 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200">
                        {formatNumber(player.balance_metric, 2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/45 p-4 text-sm md:flex-row md:items-center md:justify-between">
        <div className="text-slate-300">
          <p className="font-semibold text-slate-100">
            Showing {players.length} of {pagination.totalPlayers} players
          </p>
          <p className="text-xs text-slate-400">
            Countries in this page: {pagination.totalCountries} | Page size: {pagination.pageSize}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pagination.previousHref ? (
            <Link
              href={pagination.previousHref}
              className="inline-flex items-center rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-200 transition hover:border-sky-300/70 hover:text-sky-100"
            >
              Previous
            </Link>
          ) : (
            <span className="inline-flex cursor-not-allowed items-center rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">
              Previous
            </span>
          )}

          {pagination.nextHref ? (
            <Link
              href={pagination.nextHref}
              className="inline-flex items-center rounded-full border border-sky-400/60 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-sky-100 transition hover:border-sky-300 hover:bg-sky-400/20"
            >
              Next
            </Link>
          ) : (
            <span className="inline-flex cursor-not-allowed items-center rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">
              Next
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
