import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

const rawPlayerSchema = z.object({
  name: z.string(),
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
});

const rawPlayersSchema = z.array(rawPlayerSchema);

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
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

async function main() {
  const inputPath = process.argv[2] ?? "db/raw/players.json";
  const outputPath = process.argv[3] ?? "db/normalized/players.json";

  const raw = await readFile(inputPath, "utf8");
  const players = rawPlayersSchema.parse(JSON.parse(raw));

  const seen = new Set();
  const normalized = players
    .map((player) => {
      const name = normalizeName(player.name);
      return {
        ...player,
        name,
        country: normalizeOptionalText(player.country),
        role: normalizeOptionalText(player.role),
        current_team_short_code: normalizeOptionalText(player.current_team_short_code),
        canonical_key: canonicalKey(name),
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
