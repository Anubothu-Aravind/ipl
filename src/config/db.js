import { Pool } from "pg";

function normalizeConnectionString(raw) {
  if (!raw) {
    return raw;
  }

  const url = new URL(raw);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
    // pg v9 will change semantics for these legacy aliases.
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

const connectionString = normalizeConnectionString(
  process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL,
);

if (!connectionString) {
  throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required for frontend data loading");
}

const globalForDb = globalThis;

export const pool =
  globalForDb.__dbPool ||
  new Pool({
    connectionString,
  });

if (!globalForDb.__dbPool) {
  globalForDb.__dbPool = pool;
}

export async function query(text, params = []) {
  return pool.query(text, params);
}
