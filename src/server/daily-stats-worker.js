import { spawn } from "node:child_process";
import { pool, query } from "../config/db";

const WORKER_NAME = "daily_player_stats_refresh";
const DEFAULT_INTERVAL_HOURS = 24;
const ADVISORY_LOCK_KEY = 72420031;

function isWorkerEnabled() {
  const raw = String(process.env.DAILY_STATS_WORKER_ENABLED ?? "true").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function isBuildProcess() {
  return (
    process.env.npm_lifecycle_event === "build" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    (process.argv.includes("build") && process.argv.some((arg) => /next/i.test(arg)))
  );
}

function getIntervalHours() {
  const parsed = Number(process.env.DAILY_STATS_WORKER_INTERVAL_HOURS ?? DEFAULT_INTERVAL_HOURS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_INTERVAL_HOURS;
  }
  return parsed;
}

function log(message) {
  process.stdout.write(`[daily-stats-worker] ${message}\n`);
}

function runRefreshCommand() {
  return new Promise((resolve, reject) => {
    const refreshCommand = "npm run data:refresh-stats";
    const child = spawn(refreshCommand, [], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    child.stdout.on("data", (chunk) => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        log(`stdout: ${line}`);
      }
    });

    child.stderr.on("data", (chunk) => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        log(`stderr: ${line}`);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`data refresh exited with code ${code}`));
    });
  });
}

async function acquireWorkerLock() {
  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT pg_try_advisory_lock($1)::boolean AS locked",
      [ADVISORY_LOCK_KEY],
    );

    if (!result.rows[0]?.locked) {
      client.release();
      return null;
    }

    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}

async function releaseWorkerLock(client) {
  try {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`warning: failed to release advisory lock: ${message}`);
  } finally {
    client.release();
  }
}

async function markRunStarted() {
  await query(
    `
    INSERT INTO background_worker_runs (worker_name, last_status)
    VALUES ($1, 'idle')
    ON CONFLICT (worker_name) DO NOTHING
    `,
    [WORKER_NAME],
  );

  const result = await query(
    `
    UPDATE background_worker_runs
    SET
      last_status = 'running',
      last_started_at = NOW(),
      last_error = NULL,
      updated_at = NOW()
    WHERE worker_name = $1
    RETURNING last_started_at
    `,
    [WORKER_NAME],
  );

  return result.rowCount > 0;
}

async function markRun(status, errorText = null) {
  await query(
    `
    UPDATE background_worker_runs
    SET
      last_status = $2,
      last_completed_at = NOW(),
      last_error = $3,
      updated_at = NOW()
    WHERE worker_name = $1
    `,
    [WORKER_NAME, status, errorText],
  );
}

async function runWorker() {
  let lockClient = null;

  if (isBuildProcess()) {
    log("skipped during build process");
    return;
  }

  if (!isWorkerEnabled()) {
    log("disabled via DAILY_STATS_WORKER_ENABLED");
    return;
  }

  try {
    lockClient = await acquireWorkerLock();
    if (!lockClient) {
      log("skipped: another live worker run is already in progress");
      return;
    }

    await markRunStarted();
  } catch (error) {
    if (error && typeof error === "object" && error.code === "42P01") {
      log("status table missing. Run npm run db:migrate first. Continuing without status tracking.");
    } else {
      const message = error instanceof Error ? error.message : String(error);
      log(`failed to start worker run: ${message}`);
      return;
    }
  }

  log("starting data:refresh-stats pipeline");

  try {
    await runRefreshCommand();
    await markRun("completed");
    log("completed successfully");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      await markRun("failed", message);
    } catch (markError) {
      const markMessage = markError instanceof Error ? markError.message : String(markError);
      log(`failed to persist status after error: ${markMessage}`);
    }

    log(`failed: ${message}`);
  } finally {
    if (lockClient) {
      await releaseWorkerLock(lockClient);
    }
  }
}

export function startDailyStatsWorker() {
  if (globalThis.__dailyStatsWorkerStarted) {
    return;
  }

  globalThis.__dailyStatsWorkerStarted = true;

  if (isBuildProcess()) {
    return;
  }

  if (!isWorkerEnabled()) {
    log("disabled via DAILY_STATS_WORKER_ENABLED");
    return;
  }

  void runWorker();

  const intervalHours = getIntervalHours();
  const intervalMs = Math.round(intervalHours * 60 * 60 * 1000);
  const intervalHandle = setInterval(() => {
    void runWorker();
  }, intervalMs);

  if (typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }

  globalThis.__dailyStatsWorkerInterval = intervalHandle;
  log(`scheduled recurring refresh every ${intervalHours} hours`);
}
