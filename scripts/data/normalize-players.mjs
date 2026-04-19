import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

const rawPlayerSchema = z.object({
  name: z.string(),
  full_name: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  alternate_names: z.array(z.string()).optional(),
  country: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  batting_style: z.string().nullable().optional(),
  bowling_style: z.string().nullable().optional(),
  current_team_short_code: z.string().nullable().optional(),
  matches: z.number().int().nonnegative().optional(),
  innings: z.number().int().nonnegative().optional(),
  runs: z.number().int().nonnegative().optional(),
  highest_score: z.number().int().nonnegative().optional(),
  average: z.number().nonnegative().optional(),
  strike_rate: z.number().nonnegative().optional(),
  hundreds: z.number().int().nonnegative().optional(),
  fifties: z.number().int().nonnegative().optional(),
  fours: z.number().int().nonnegative().optional(),
  sixes: z.number().int().nonnegative().optional(),
  wickets: z.number().int().nonnegative().optional(),
  economy: z.number().nonnegative().optional(),
  bowling_innings: z.number().int().nonnegative().optional(),
  bowling_average: z.number().nonnegative().optional(),
  four_w_hauls: z.number().int().nonnegative().optional(),
  five_w_hauls: z.number().int().nonnegative().optional(),
  dot_balls: z.number().int().nonnegative().optional(),
  balance_metric: z.number().optional(),
  is_active: z.boolean().optional(),
  best_bowling: z.string().nullable().optional(),
  canonical_key: z.string().nullable().optional(),
});

const rawPlayersSchema = z.array(rawPlayerSchema);

function normalizeName(name) {
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

function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === "-" || lowered === "--" || lowered === "na" || lowered === "n/a" || lowered === "null") {
    return null;
  }

  return trimmed;
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

function normalizeAlternateNames(rawAliases, fallbackNames = [], displayName = null) {
  const values = [
    ...(Array.isArray(rawAliases) ? rawAliases : []),
    ...fallbackNames,
  ];

  const seen = new Set();
  const aliases = [];

  for (const value of values) {
    const normalized = normalizeOptionalName(value);
    if (!normalized || normalized === displayName) {
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

async function main() {
  const inputPath = process.argv[2] ?? "db/raw/players.json";
  const outputPath = process.argv[3] ?? "db/normalized/players.json";

  const raw = await readFile(inputPath, "utf8");
  const players = rawPlayersSchema.parse(JSON.parse(raw));

  const seen = new Set();
  const normalized = players
    .map((player) => {
      const rawName = normalizeName(player.name);
      const fullName = normalizeOptionalName(player.full_name) ?? rawName;
      const displayName = normalizeOptionalName(player.display_name) ?? fullName;
      const splitName = splitNameParts(fullName);
      const firstName = normalizeOptionalName(player.first_name) ?? splitName.first_name;
      const lastName = normalizeOptionalName(player.last_name) ?? splitName.last_name;
      const canonicalSource = normalizeOptionalName(player.canonical_key) ?? rawName;

      return {
        ...player,
        name: displayName,
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        display_name: displayName,
        alternate_names: normalizeAlternateNames(
          player.alternate_names,
          [rawName, fullName, displayName],
          displayName,
        ),
        country: normalizeOptionalText(player.country),
        role: normalizeOptionalText(player.role),
        current_team_short_code: normalizeOptionalText(player.current_team_short_code),
        canonical_key: canonicalKey(canonicalSource),
      };
    })
    .filter((player) => {
      if (seen.has(player.canonical_key)) {
        return false;
      }
      seen.add(player.canonical_key);
      return true;
    });

  await writeFile(outputPath, JSON.stringify(normalized, null, 2));
  process.stdout.write(`Wrote ${normalized.length} normalized players to ${outputPath}.\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
