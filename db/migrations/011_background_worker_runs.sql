CREATE TABLE IF NOT EXISTS background_worker_runs (
  worker_name TEXT PRIMARY KEY,
  last_status TEXT NOT NULL DEFAULT 'idle',
  last_started_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT background_worker_runs_status_check
    CHECK (last_status IN ('idle', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_background_worker_runs_last_completed_at
  ON background_worker_runs (last_completed_at);
