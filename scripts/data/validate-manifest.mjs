import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const sourceSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  sha256: z.string().min(1),
});

const manifestSchema = z.object({
  datasetName: z.string().min(1),
  version: z.string().min(1),
  downloadedAt: z.string().datetime(),
  license: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
});

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  const manifestPath = process.argv[2] ?? "db/source-manifest.example.json";
  const manifestRaw = await readFile(manifestPath, "utf8");
  const parsed = manifestSchema.parse(JSON.parse(manifestRaw));

  for (const source of parsed.sources) {
    const fileBuffer = await readFile(source.path);
    const digest = sha256Hex(fileBuffer);
    if (digest !== source.sha256) {
      throw new Error(
        `Checksum mismatch for ${source.name}: expected ${source.sha256}, got ${digest}`,
      );
    }
  }

  process.stdout.write(
    `Manifest valid for ${parsed.datasetName} (${parsed.version}) with ${parsed.sources.length} source(s).\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
