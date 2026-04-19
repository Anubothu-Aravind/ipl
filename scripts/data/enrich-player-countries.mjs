import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PEOPLE_REGISTER_URL = "https://cricsheet.org/register/people.csv";
const PEOPLE_REGISTER_PATH = "db/raw/people_register.csv";
const COUNTRY_CACHE_PATH = "db/raw/player_country_cache.json";
const PROFILE_CACHE_PATH = "db/raw/player_profile_cache.json";
const ESPN_ATHLETE_URL = "https://site.web.api.espn.com/apis/common/v3/sports/cricket/athletes";

const PLACEHOLDER_COUNTRIES = new Set([
  "",
  "-",
  "--",
  "na",
  "n/a",
  "null",
  "unknown",
  "bcci",
  "board of control for cricket in india",
]);

const COUNTRY_ALIASES = new Map([
  ["uae", "United Arab Emirates"],
  ["u.a.e.", "United Arab Emirates"],
  ["usa", "United States of America"],
  ["u.s.a.", "United States of America"],
  ["england and wales", "England"],
  ["ireland women", "Ireland"],
  ["india women", "India"],
  ["indian", "India"],
]);

function normalizeName(name) {
  if (typeof name !== "string") {
    return "";
  }
  return name.trim().replace(/\s+/g, " ");
}

function normalizeOptionalName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeName(value);
  return normalized ? normalized : null;
}

function canonicalKey(name) {
  return normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCountry(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (PLACEHOLDER_COUNTRIES.has(lowered)) {
    return null;
  }

  const alias = COUNTRY_ALIASES.get(lowered);
  if (alias) {
    return alias;
  }

  return trimmed;
}

function isInitialToken(token) {
  const cleaned = token.replace(/\./g, "").trim();
  return /^[A-Z]{1,3}$/.test(cleaned);
}

function scoreNameCandidate(name) {
  const tokens = name.split(" ").filter(Boolean);
  const descriptiveTokens = tokens.filter((token) => !isInitialToken(token)).length;
  return (descriptiveTokens * 100) + (tokens.length * 10) + name.length;
}

function pickBestFullName({ existingName, existingFullName, registerName, registerUniqueName }) {
  const candidates = [
    normalizeOptionalName(existingFullName),
    normalizeOptionalName(registerUniqueName),
    normalizeOptionalName(registerName),
    normalizeOptionalName(existingName),
  ].filter(Boolean);

  if (candidates.length === 0) {
    return normalizeName(existingName);
  }

  let best = candidates[0];
  let bestScore = scoreNameCandidate(best);

  for (const candidate of candidates.slice(1)) {
    const score = scoreNameCandidate(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  const existing = normalizeOptionalName(existingName);
  const bestWithoutDisambiguator = best.replace(/\s+\(\d+\)$/, "");
  const existingHasDisambiguator = /\s+\(\d+\)$/.test(existing ?? "");
  const bestHasDisambiguator = /\s+\(\d+\)$/.test(best);

  if (
    bestHasDisambiguator &&
    !existingHasDisambiguator &&
    existing &&
    existing.toLowerCase() === bestWithoutDisambiguator.toLowerCase()
  ) {
    return existing;
  }

  return best;
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

function normalizeAlternateNames(rawAliases, candidates, displayName) {
  const values = [
    ...(Array.isArray(rawAliases) ? rawAliases : []),
    ...candidates,
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

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

async function ensurePeopleRegister() {
  if (existsSync(PEOPLE_REGISTER_PATH)) {
    return readFile(PEOPLE_REGISTER_PATH, "utf8");
  }

  const response = await fetch(PEOPLE_REGISTER_URL);
  if (!response.ok) {
    throw new Error(`Unable to download people register: ${response.status}`);
  }

  const csv = await response.text();
  await writeFile(PEOPLE_REGISTER_PATH, csv);
  return csv;
}

function buildIdentifierSourceMap(csvText) {
  const rows = csvText.split(/\r?\n/).filter(Boolean);
  if (rows.length === 0) {
    return {
      identifierToCricinfo: new Map(),
      identifierToCricbuzz: new Map(),
      identifierToNames: new Map(),
    };
  }

  const headers = parseCsvLine(rows[0]);
  const identifierIndex = headers.indexOf("identifier");
  const nameIndex = headers.indexOf("name");
  const uniqueNameIndex = headers.indexOf("unique_name");
  const cricinfoIndex = headers.indexOf("key_cricinfo");
  const cricinfoIndex2 = headers.indexOf("key_cricinfo_2");
  const cricinfoIndex3 = headers.indexOf("key_cricinfo_3");
  const cricbuzzIndex = headers.indexOf("key_cricbuzz");

  if (identifierIndex < 0 || cricbuzzIndex < 0 || cricinfoIndex < 0) {
    throw new Error("people register is missing required columns");
  }

  const identifierToCricinfo = new Map();
  const identifierToCricbuzz = new Map();
  const identifierToNames = new Map();

  for (const row of rows.slice(1)) {
    const cells = parseCsvLine(row);
    const identifier = (cells[identifierIndex] ?? "").trim();
    const registerName = nameIndex >= 0 ? normalizeOptionalName(cells[nameIndex] ?? "") : null;
    const registerUniqueName = uniqueNameIndex >= 0 ? normalizeOptionalName(cells[uniqueNameIndex] ?? "") : null;
    const cricinfoId =
      (cells[cricinfoIndex] ?? "").trim() ||
      (cricinfoIndex2 >= 0 ? (cells[cricinfoIndex2] ?? "").trim() : "") ||
      (cricinfoIndex3 >= 0 ? (cells[cricinfoIndex3] ?? "").trim() : "");
    const cricbuzzId = (cells[cricbuzzIndex] ?? "").trim();

    if (!identifier) {
      continue;
    }

    if (cricinfoId) {
      identifierToCricinfo.set(identifier, cricinfoId);
    }

    if (cricbuzzId) {
      identifierToCricbuzz.set(identifier, cricbuzzId);
    }

    if (registerName || registerUniqueName) {
      identifierToNames.set(identifier, {
        name: registerName,
        uniqueName: registerUniqueName,
      });
    }
  }

  return {
    identifierToCricinfo,
    identifierToCricbuzz,
    identifierToNames,
  };
}

async function buildRegistryMaps(matchesDir) {
  const files = await readdir(matchesDir);
  const nameToIdentifier = new Map();
  const canonicalToIdentifier = new Map();

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }

    const fullPath = join(matchesDir, file);
    const raw = await readFile(fullPath, "utf8");
    const match = JSON.parse(raw);
    const people = match?.info?.registry?.people ?? {};

    for (const [displayName, identifier] of Object.entries(people)) {
      const normalizedName = normalizeName(displayName);
      const normalizedIdentifier = typeof identifier === "string" ? identifier.trim() : "";

      if (!normalizedName || !normalizedIdentifier) {
        continue;
      }

      if (!nameToIdentifier.has(normalizedName)) {
        nameToIdentifier.set(normalizedName, normalizedIdentifier);
      }

      const canonical = canonicalKey(normalizedName);
      if (canonical && !canonicalToIdentifier.has(canonical)) {
        canonicalToIdentifier.set(canonical, normalizedIdentifier);
      }
    }
  }

  return { nameToIdentifier, canonicalToIdentifier };
}

async function loadCountryCache() {
  if (!existsSync(COUNTRY_CACHE_PATH)) {
    return {};
  }

  try {
    const raw = await readFile(COUNTRY_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const migrated = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key.includes(":")) {
        migrated[key] = value;
      } else {
        migrated[`cricbuzz:${key}`] = value;
      }
    }

    return migrated;
  } catch {
    return {};
  }
}

async function saveCountryCache(cache) {
  await writeFile(COUNTRY_CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function loadProfileCache() {
  if (!existsSync(PROFILE_CACHE_PATH)) {
    return {};
  }

  try {
    const raw = await readFile(PROFILE_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

async function saveProfileCache(cache) {
  await writeFile(PROFILE_CACHE_PATH, JSON.stringify(cache, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(source, id) {
  return `${source}:${id}`;
}

function extractCountryFromProfileHtml(html) {
  const nationalityMatch = html.match(/"nationality":"([^"]+)"/);
  if (nationalityMatch) {
    return normalizeCountry(nationalityMatch[1]);
  }

  const intlTeamMatch = html.match(/"intlTeam":"([^"]*)"/);
  if (intlTeamMatch) {
    return normalizeCountry(intlTeamMatch[1]);
  }

  return null;
}

function extractCountryFromEspnPayload(payload) {
  const athlete = payload?.athlete;
  const candidates = [
    athlete?.team?.location,
    athlete?.team?.displayName,
    athlete?.team?.name,
  ];

  for (const value of candidates) {
    const normalized = normalizeCountry(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractNameProfileFromEspnPayload(payload) {
  const athlete = payload?.athlete;
  if (!athlete || typeof athlete !== "object") {
    return null;
  }

  const displayName = normalizeOptionalName(athlete.displayName);
  const fullName = normalizeOptionalName(athlete.fullName) ?? displayName;
  const shortName = normalizeOptionalName(athlete.shortName);
  const firstName = normalizeOptionalName(athlete.firstName);
  const lastName = normalizeOptionalName(athlete.lastName);

  if (!displayName && !fullName && !shortName && !firstName && !lastName) {
    return null;
  }

  return {
    displayName,
    fullName,
    shortName,
    firstName,
    lastName,
  };
}

function extractProfileFromEspnPayload(payload) {
  return {
    country: extractCountryFromEspnPayload(payload),
    nameProfile: extractNameProfileFromEspnPayload(payload),
  };
}

async function fetchCountryFromEspnId(cricinfoId) {
  const url = `${ESPN_ATHLETE_URL}/${cricinfoId}`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0",
          accept: "application/json",
        },
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < 3) {
          await sleep(300 * attempt);
          continue;
        }
        return null;
      }

      const payload = await response.json();
      return extractCountryFromEspnPayload(payload);
    } catch {
      if (attempt < 3) {
        await sleep(300 * attempt);
        continue;
      }
      return null;
    }
  }

  return null;
}

async function fetchProfileFromEspnId(cricinfoId) {
  const url = `${ESPN_ATHLETE_URL}/${cricinfoId}`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0",
          accept: "application/json",
        },
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < 3) {
          await sleep(300 * attempt);
          continue;
        }
        return null;
      }

      const payload = await response.json();
      return extractProfileFromEspnPayload(payload);
    } catch {
      if (attempt < 3) {
        await sleep(300 * attempt);
        continue;
      }
      return null;
    }
  }

  return null;
}

async function fetchCountryFromCricbuzzId(cricbuzzId) {
  const url = `https://www.cricbuzz.com/profiles/${cricbuzzId}`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0",
          accept: "text/html",
        },
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < 3) {
          await sleep(300 * attempt);
          continue;
        }
        return null;
      }

      const html = await response.text();
      return extractCountryFromProfileHtml(html);
    } catch {
      if (attempt < 3) {
        await sleep(300 * attempt);
        continue;
      }
      return null;
    }
  }

  return null;
}

async function runPool(items, limit, worker) {
  if (items.length === 0) {
    return;
  }

  let cursor = 0;
  const workerCount = Math.min(limit, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;

      if (currentIndex >= items.length) {
        return;
      }

      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
}

async function main() {
  const inputPath = process.argv[2] ?? "db/normalized/players.json";
  const matchesDir = process.argv[3] ?? "db/raw/ipl_json";
  const outputPath = process.argv[4] ?? inputPath;

  const rawPlayers = await readFile(inputPath, "utf8");
  const players = JSON.parse(rawPlayers);

  if (!Array.isArray(players)) {
    throw new Error("Player input must be a JSON array");
  }

  const { nameToIdentifier, canonicalToIdentifier } = await buildRegistryMaps(matchesDir);
  const peopleRegister = await ensurePeopleRegister();
  const { identifierToCricinfo, identifierToCricbuzz, identifierToNames } = buildIdentifierSourceMap(peopleRegister);
  const countryCache = await loadCountryCache();
  const profileCache = await loadProfileCache();

  const playerContext = players.map((player) => {
    const normalizedName = normalizeName(player.name);
    const identifier =
      nameToIdentifier.get(normalizedName) ??
      canonicalToIdentifier.get(player.canonical_key ?? canonicalKey(normalizedName)) ??
      null;

    const cricinfoId = identifier ? identifierToCricinfo.get(identifier) ?? null : null;
    const cricbuzzId = identifier ? identifierToCricbuzz.get(identifier) ?? null : null;
    const registerNames = identifier ? identifierToNames.get(identifier) ?? null : null;

    return {
      existingCountry: normalizeCountry(player.country),
      identifier,
      cricinfoId,
      cricbuzzId,
      registerNames,
    };
  });

  const cricinfoIdsToFetch = [...new Set(playerContext
    .map((context) => context.cricinfoId)
    .filter(
      (value) =>
        typeof value === "string" &&
        value &&
        (
          !(cacheKey("cricinfo", value) in countryCache) ||
          !(cacheKey("cricinfo", value) in profileCache) ||
          profileCache[cacheKey("cricinfo", value)] == null
        ),
    ))];

  let fetchedCricinfo = 0;
  await runPool(cricinfoIdsToFetch, 8, async (cricinfoId) => {
    const profile = await fetchProfileFromEspnId(cricinfoId);
    const country = profile?.country ?? null;
    const nameProfile = profile?.nameProfile ?? null;

    countryCache[cacheKey("cricinfo", cricinfoId)] = country;
    profileCache[cacheKey("cricinfo", cricinfoId)] = nameProfile;
    fetchedCricinfo += 1;

    if (fetchedCricinfo % 50 === 0 || fetchedCricinfo === cricinfoIdsToFetch.length) {
      process.stdout.write(`Fetched ${fetchedCricinfo}/${cricinfoIdsToFetch.length} Cricinfo profiles\n`);
    }

    await sleep(80);
  });

  const cricbuzzIdsToFetch = [...new Set(playerContext
    .map((context) => context.cricbuzzId)
    .filter(
      (value) =>
        typeof value === "string" &&
        value &&
        !(cacheKey("cricbuzz", value) in countryCache),
    ))];

  let fetchedCricbuzz = 0;
  await runPool(cricbuzzIdsToFetch, 5, async (cricbuzzId) => {
    const country = await fetchCountryFromCricbuzzId(cricbuzzId);
    countryCache[cacheKey("cricbuzz", cricbuzzId)] = country;
    fetchedCricbuzz += 1;

    if (fetchedCricbuzz % 50 === 0 || fetchedCricbuzz === cricbuzzIdsToFetch.length) {
      process.stdout.write(`Fetched ${fetchedCricbuzz}/${cricbuzzIdsToFetch.length} Cricbuzz profiles\n`);
    }

    await sleep(120);
  });

  let enrichedFromCricinfo = 0;
  let enrichedFromCricbuzz = 0;
  let preservedExisting = 0;
  let defaultedIndia = 0;
  let noIdentifier = 0;
  let canonicalizedFullNames = 0;
  let playersWithAliases = 0;

  const updatedPlayers = players.map((player, index) => {
    const context = playerContext[index];
    const espnNameProfile = context.cricinfoId
      ? profileCache[cacheKey("cricinfo", context.cricinfoId)] ?? null
      : null;
    const existingName = normalizeName(player.name);
    const fullName = pickBestFullName({
      existingName,
      existingFullName: player.full_name,
      registerName: espnNameProfile?.fullName ?? espnNameProfile?.displayName ?? context.registerNames?.name,
      registerUniqueName: espnNameProfile?.shortName ?? context.registerNames?.uniqueName,
    });
    const displayName = fullName;
    const splitName = splitNameParts(fullName);
    const firstName = normalizeOptionalName(espnNameProfile?.firstName)
      ?? normalizeOptionalName(player.first_name)
      ?? splitName.first_name;
    const lastName = normalizeOptionalName(espnNameProfile?.lastName)
      ?? normalizeOptionalName(player.last_name)
      ?? splitName.last_name;
    const alternateNames = normalizeAlternateNames(
      player.alternate_names,
      [
        existingName,
        player.display_name,
        espnNameProfile?.displayName,
        espnNameProfile?.fullName,
        espnNameProfile?.shortName,
        context.registerNames?.name,
        context.registerNames?.uniqueName,
        player.full_name,
      ],
      displayName,
    );
    const canonicalSource = normalizeOptionalName(player.canonical_key) ?? existingName;

    if (fullName !== existingName) {
      canonicalizedFullNames += 1;
    }

    if (alternateNames.length > 0) {
      playersWithAliases += 1;
    }

    const fromCricinfo = context.cricinfoId
      ? normalizeCountry(countryCache[cacheKey("cricinfo", context.cricinfoId)])
      : null;

    let resolvedCountry;

    if (fromCricinfo) {
      enrichedFromCricinfo += 1;
      resolvedCountry = fromCricinfo;
    } else {
      const fromCricbuzz = context.cricbuzzId
        ? normalizeCountry(countryCache[cacheKey("cricbuzz", context.cricbuzzId)])
        : null;

      if (fromCricbuzz) {
        enrichedFromCricbuzz += 1;
        resolvedCountry = fromCricbuzz;
      } else if (context.existingCountry && context.existingCountry.toLowerCase() !== "india") {
        preservedExisting += 1;
        resolvedCountry = context.existingCountry;
      } else {
        if (!context.identifier) {
          noIdentifier += 1;
        }

        defaultedIndia += 1;
        resolvedCountry = "India";
      }
    }

    return {
      ...player,
      name: displayName,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      alternate_names: alternateNames,
      canonical_key: canonicalKey(canonicalSource),
      country: resolvedCountry,
    };
  });

  await writeFile(outputPath, JSON.stringify(updatedPlayers, null, 2));
  await saveCountryCache(countryCache);
  await saveProfileCache(profileCache);

  process.stdout.write(`Enriched players written to ${outputPath}\n`);
  process.stdout.write(`Cricinfo-enriched countries: ${enrichedFromCricinfo}\n`);
  process.stdout.write(`Cricbuzz-enriched countries: ${enrichedFromCricbuzz}\n`);
  process.stdout.write(`Preserved existing countries: ${preservedExisting}\n`);
  process.stdout.write(`Defaulted to India: ${defaultedIndia}\n`);
  process.stdout.write(`Players missing registry identifiers: ${noIdentifier}\n`);
  process.stdout.write(`Canonical full-name upgrades: ${canonicalizedFullNames}\n`);
  process.stdout.write(`Players with alternate names: ${playersWithAliases}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
