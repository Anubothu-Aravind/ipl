import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const dir = "db/migrations";
    const files = (await readdir(dir))
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const sql = await readFile(join(dir, file), "utf8");
      process.stdout.write(`Applying migration ${file}...\n`);
      await client.query(sql);
    }

    process.stdout.write("Migrations completed successfully.\n");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
