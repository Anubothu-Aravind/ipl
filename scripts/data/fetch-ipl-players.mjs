import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import AdmZip from "adm-zip";

const IPL_ZIP_URL = "https://cricsheet.org/downloads/ipl_json.zip";
const ZIP_PATH = "db/raw/ipl_json.zip";
const EXTRACT_DIR = "db/raw/ipl_json";
const OUTPUT_PATH = "db/raw/players.json";
const SEASON_STATS_OUTPUT_PATH = "db/raw/player_season_stats.json";
const TEAM_HISTORY_OUTPUT_PATH = "db/raw/player_team_history.json";

const TEAM_SHORT_CODES = new Map([
  ["Chennai Super Kings", "CSK"],
  ["Mumbai Indians", "MI"],
  ["Royal Challengers Bengaluru", "RCB"],
  ["Royal Challengers Bangalore", "RCB"],
  ["Kolkata Knight Riders", "KKR"],
  ["Rajasthan Royals", "RR"],
  ["Sunrisers Hyderabad", "SRH"],
  ["Delhi Capitals", "DC"],
  ["Delhi Daredevils", "DC"],
  ["Punjab Kings", "PBKS"],
  ["Kings XI Punjab", "PBKS"],
  ["Lucknow Super Giants", "LSG"],
  ["Gujarat Titans", "GT"],
  ["Deccan Chargers", "SRH"],
  ["Pune Warriors", "PWI"],
  ["Rising Pune Supergiants", "RPS"],
  ["Rising Pune Supergiant", "RPS"],
  ["Kochi Tuskers Kerala", "KTK"],
  ["Gujarat Lions", "GL"],
]);

const NON_BOWLER_WICKET_KINDS = new Set([
  "run out",
  "retired hurt",
  "retired out",
  "obstructing the field",
  "timed out",
]);

function canonicalKey(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSeasonValue(season) {
  if (typeof season === "number") {
    return season;
  }
  if (typeof season === "string") {
    const asNum = Number.parseInt(season, 10);
    return Number.isFinite(asNum) ? asNum : 0;
  }
  return 0;
}

function createPlayerRecord(name) {
  return {
    canonical_key: canonicalKey(name),
    name,
    country: null,
    role: null,
    batting_style: null,
    bowling_style: null,
    current_team_short_code: null,
    matches: 0,
    innings: 0,
    runs: 0,
    highest_score: 0,
    average: 0,
    strike_rate: 0,
    hundreds: 0,
    fifties: 0,
    fours: 0,
    sixes: 0,
    wickets: 0,
    economy: 0,
    bowling_innings: 0,
    bowling_average: 0,
    four_w_hauls: 0,
    five_w_hauls: 0,
    dot_balls: 0,
    balance_metric: 0,
    is_active: false,
    best_bowling: null,
    latestSeason: 0,
    _batBalls: 0,
    _batOuts: 0,
    _bowlBalls: 0,
    _bowlRunsConceded: 0,
    _bestBowlingWickets: 0,
    _bestBowlingRuns: Number.POSITIVE_INFINITY,
  };
}

function getOrCreatePlayer(playerMap, name) {
  const key = canonicalKey(name);
  const existing = playerMap.get(key);
  if (existing) {
    return existing;
  }
  const created = createPlayerRecord(name);
  playerMap.set(key, created);
  return created;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function finalizePlayerStats(player) {
  player.average = player._batOuts > 0 ? Number((player.runs / player._batOuts).toFixed(2)) : 0;
  player.strike_rate = player._batBalls > 0 ? Number(((player.runs * 100) / player._batBalls).toFixed(2)) : 0;
  player.economy = player._bowlBalls > 0 ? Number(((player._bowlRunsConceded * 6) / player._bowlBalls).toFixed(2)) : 0;
  player.bowling_average = player.wickets > 0 ? Number((player._bowlRunsConceded / player.wickets).toFixed(2)) : 0;

  const balanceRaw = (player.runs / 120) + (player.wickets * 1.75) + (player.strike_rate / 40) - player.economy;
  player.balance_metric = Number(balanceRaw.toFixed(2));

  if (player._bestBowlingWickets > 0) {
    player.best_bowling = `${player._bestBowlingWickets}/${player._bestBowlingRuns}`;
  }

  if (player.runs >= 1000 && player.wickets >= 30) {
    player.role = "All-rounder";
  } else if (player.wickets >= 30) {
    player.role = "Bowler";
  } else {
    player.role = "Batter";
  }

  delete player._batBalls;
  delete player._batOuts;
  delete player._bowlBalls;
  delete player._bowlRunsConceded;
  delete player._bestBowlingWickets;
  delete player._bestBowlingRuns;
  delete player.latestSeason;
}

async function downloadZip() {
  const response = await fetch(IPL_ZIP_URL);
  if (!response.ok) {
    throw new Error(`Failed to download IPL zip: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await writeFile(ZIP_PATH, Buffer.from(arrayBuffer));
}

async function extractZip() {
  await rm(EXTRACT_DIR, { recursive: true, force: true });
  await mkdir(EXTRACT_DIR, { recursive: true });
  const zip = new AdmZip(ZIP_PATH);
  zip.extractAllTo(EXTRACT_DIR, true);
}

async function buildPlayers() {
  const files = await readdir(EXTRACT_DIR);
  const playerMap = new Map();
  const seasonStatsMap = new Map();
  const teamHistoryMap = new Map();

  function seasonKey(playerKey, season) {
    return `${playerKey}::${season}`;
  }

  function teamHistoryKey(playerKey, shortCode) {
    return `${playerKey}::${shortCode}`;
  }

  function getOrCreateSeasonStat(player, season, shortCode) {
    const key = seasonKey(player.canonical_key, season);
    const existing = seasonStatsMap.get(key);
    if (existing) {
      if (shortCode) {
        existing.team_short_code = shortCode;
      }
      return existing;
    }

    const created = {
      canonical_key: player.canonical_key,
      name: player.name,
      season,
      team_short_code: shortCode ?? null,
      matches: 0,
      runs: 0,
      wickets: 0,
      strike_rate: 0,
      economy: 0,
      _bat_balls: 0,
      _bowl_balls: 0,
      _bowl_runs: 0,
    };
    seasonStatsMap.set(key, created);
    return created;
  }

  function touchTeamHistory(player, shortCode, season) {
    if (!shortCode) {
      return;
    }
    const key = teamHistoryKey(player.canonical_key, shortCode);
    const existing = teamHistoryMap.get(key);
    if (!existing) {
      teamHistoryMap.set(key, {
        canonical_key: player.canonical_key,
        name: player.name,
        team_short_code: shortCode,
        from_year: season,
        to_year: season,
      });
      return;
    }
    existing.from_year = Math.min(existing.from_year, season);
    existing.to_year = Math.max(existing.to_year, season);
  }

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }

    const fullPath = join(EXTRACT_DIR, file);
    const raw = await readFile(fullPath, "utf8");
    const match = JSON.parse(raw);
    const info = match.info ?? {};

    const season = parseSeasonValue(info.season);
    const inIplSeason = season >= 2008;
    const playerLists = info.players ?? {};
    const matchBattingRuns = new Map();
    const matchBattingBalls = new Map();
    const matchOuts = new Set();
    const matchBowling = new Map();
    const matchPlayers = new Set();
    const matchSeasonStats = new Map();

    for (const [teamName, squad] of Object.entries(playerLists)) {
      const shortCode = TEAM_SHORT_CODES.get(teamName) ?? null;

      for (const name of squad) {
        const existing = getOrCreatePlayer(playerMap, name);
        matchPlayers.add(existing);
        if (inIplSeason) {
          touchTeamHistory(existing, shortCode, season);
          const ss = getOrCreateSeasonStat(existing, season, shortCode);
          matchSeasonStats.set(existing.canonical_key, ss);
        }
        if (season >= existing.latestSeason) {
          existing.latestSeason = season;
          existing.current_team_short_code = shortCode;
        }
      }
    }

    const innings = safeArray(match.innings);
    for (const inning of innings) {
      const inningData = inning?.overs
        ? inning
        : Object.values(inning || {}).find((value) => value && typeof value === "object" && Array.isArray(value.overs));
      const overs = safeArray(inningData?.overs);

      for (const over of overs) {
        const deliveries = safeArray(over.deliveries);

        for (const delivery of deliveries) {
          const batterName = delivery.batter;
          const bowlerName = delivery.bowler;
          if (!batterName || !bowlerName) {
            continue;
          }

          const batter = getOrCreatePlayer(playerMap, batterName);
          const bowler = getOrCreatePlayer(playerMap, bowlerName);
          matchPlayers.add(batter);
          matchPlayers.add(bowler);

          const batterSeason = inIplSeason
            ? (matchSeasonStats.get(batter.canonical_key) ?? getOrCreateSeasonStat(batter, season, null))
            : null;
          const bowlerSeason = inIplSeason
            ? (matchSeasonStats.get(bowler.canonical_key) ?? getOrCreateSeasonStat(bowler, season, null))
            : null;
          if (inIplSeason) {
            matchSeasonStats.set(batter.canonical_key, batterSeason);
            matchSeasonStats.set(bowler.canonical_key, bowlerSeason);
          }

          const batterRuns = delivery.runs?.batter ?? 0;
          const totalRuns = delivery.runs?.total ?? 0;
          const extras = delivery.extras ?? {};
          const wides = extras.wides ?? 0;
          const noBalls = extras.noballs ?? 0;
          const byes = extras.byes ?? 0;
          const legByes = extras.legbyes ?? 0;

          batter.runs += batterRuns;
          if (batterSeason) {
            batterSeason.runs += batterRuns;
          }
          matchBattingRuns.set(batter, (matchBattingRuns.get(batter) ?? 0) + batterRuns);

          if (wides === 0) {
            batter._batBalls += 1;
            if (batterSeason) {
              batterSeason._bat_balls += 1;
            }
            matchBattingBalls.set(batter, (matchBattingBalls.get(batter) ?? 0) + 1);
          }

          if (batterRuns === 4) {
            batter.fours += 1;
          } else if (batterRuns === 6) {
            batter.sixes += 1;
          }

          if (!matchBowling.has(bowler)) {
            matchBowling.set(bowler, { balls: 0, runsConceded: 0, wickets: 0 });
          }
          const bowlState = matchBowling.get(bowler);
          if (wides === 0 && noBalls === 0) {
            bowlState.balls += 1;
            bowler._bowlBalls += 1;
            if (bowlerSeason) {
              bowlerSeason._bowl_balls += 1;
            }
          }
          const bowlerRunsConceded = totalRuns - byes - legByes;
          bowlState.runsConceded += bowlerRunsConceded;
          bowler._bowlRunsConceded += bowlerRunsConceded;
          if (bowlerSeason) {
            bowlerSeason._bowl_runs += bowlerRunsConceded;
          }

          if (totalRuns === 0 && wides === 0 && noBalls === 0) {
            bowler.dot_balls += 1;
          }

          const wickets = safeArray(delivery.wickets);
          for (const wicket of wickets) {
            const outName = wicket.player_out;
            if (outName) {
              const outPlayer = getOrCreatePlayer(playerMap, outName);
              matchPlayers.add(outPlayer);
              matchOuts.add(outPlayer);
            }

            const kind = (wicket.kind || "").toLowerCase();
            if (!NON_BOWLER_WICKET_KINDS.has(kind)) {
              bowlState.wickets += 1;
              bowler.wickets += 1;
              if (bowlerSeason) {
                bowlerSeason.wickets += 1;
              }
            }
          }
        }
      }
    }

    for (const player of matchPlayers) {
      player.matches += 1;
      const ss = matchSeasonStats.get(player.canonical_key);
      if (ss) {
        ss.matches += 1;
      }
    }

    for (const [player, runsInMatch] of matchBattingRuns.entries()) {
      player.innings += 1;
      if (runsInMatch > player.highest_score) {
        player.highest_score = runsInMatch;
      }
      if (runsInMatch >= 100) {
        player.hundreds += 1;
      } else if (runsInMatch >= 50) {
        player.fifties += 1;
      }
    }

    for (const outPlayer of matchOuts) {
      outPlayer._batOuts += 1;
    }

    for (const [bowler, state] of matchBowling.entries()) {
      if (state.balls > 0 || state.runsConceded > 0) {
        bowler.bowling_innings += 1;
      }
      if (state.wickets >= 4) {
        bowler.four_w_hauls += 1;
      }
      if (state.wickets >= 5) {
        bowler.five_w_hauls += 1;
      }

      const betterWicketCount = state.wickets > bowler._bestBowlingWickets;
      const sameWicketsBetterRuns =
        state.wickets === bowler._bestBowlingWickets &&
        state.wickets > 0 &&
        state.runsConceded < bowler._bestBowlingRuns;

      if (betterWicketCount || sameWicketsBetterRuns) {
        bowler._bestBowlingWickets = state.wickets;
        bowler._bestBowlingRuns = state.runsConceded;
      }
    }

    const registryPeople = info.registry?.people ?? {};
    for (const name of Object.keys(registryPeople)) {
      getOrCreatePlayer(playerMap, name);
    }
  }

  const currentYear = new Date().getFullYear();
  const activeThreshold = currentYear - 2;

  const players = [...playerMap.values()]
    .map((player) => {
      player.is_active = player.latestSeason >= activeThreshold;
      finalizePlayerStats(player);
      return player;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const seasonStats = [...seasonStatsMap.values()]
    .map((row) => {
      row.strike_rate = row._bat_balls > 0 ? Number(((row.runs * 100) / row._bat_balls).toFixed(2)) : 0;
      row.economy = row._bowl_balls > 0 ? Number(((row._bowl_runs * 6) / row._bowl_balls).toFixed(2)) : 0;
      delete row._bat_balls;
      delete row._bowl_balls;
      delete row._bowl_runs;
      return row;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.season - b.season);

  const teamHistory = [...teamHistoryMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.from_year - b.from_year);

  await writeFile(OUTPUT_PATH, JSON.stringify(players, null, 2));
  await writeFile(SEASON_STATS_OUTPUT_PATH, JSON.stringify(seasonStats, null, 2));
  await writeFile(TEAM_HISTORY_OUTPUT_PATH, JSON.stringify(teamHistory, null, 2));
  return players.length;
}

async function main() {
  await mkdir("db/raw", { recursive: true });
  await downloadZip();
  await extractZip();
  const count = await buildPlayers();
  process.stdout.write(`Prepared ${count} IPL players into ${OUTPUT_PATH}.\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
