import { spawn } from "node:child_process";
import { query } from "../config/db";

const WORKER_NAME = "daily_player_stats_refresh";
const RUN_EVERY_HOURS = 24;
const STALE_RUNNING_HOURS = 6;

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

function log(message) {
  process.stdout.write(`[daily-stats-worker] ${message}\n`);
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runRefreshCommand() {
  return new Promise((resolve, reject) => {
    const child = spawn(getNpmCommand(), ["run", "data:refresh-stats"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
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

async function claimRunSlot() {
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
      AND (
        last_started_at IS NULL
        OR last_started_at < NOW() - ($2::text || ' hours')::interval
        OR (last_status = 'running' AND last_started_at < NOW() - ($3::text || ' hours')::interval)
      )
    RETURNING last_started_at
    `,
    [WORKER_NAME, String(RUN_EVERY_HOURS), String(STALE_RUNNING_HOURS)],
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
  if (isBuildProcess()) {
    log("skipped during build process");
    return;
  }

  if (!isWorkerEnabled()) {
    log("disabled via DAILY_STATS_WORKER_ENABLED");
    return;
  }

  try {
    const claimed = await claimRunSlot();
    if (!claimed) {
      log("skipped: last run is still fresh (<24h) or already running");
      return;
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "42P01") {
      log("skipped: background_worker_runs table missing. Run npm run db:migrate first.");
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    log(`failed to claim run slot: ${message}`);
    return;
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
  }
}

export function startDailyStatsWorker() {
  if (globalThis.__dailyStatsWorkerStarted) {
    return;
  }

  globalThis.__dailyStatsWorkerStarted = true;
  void runWorker();
}
