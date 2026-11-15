CREATE TABLE IF NOT EXISTS api_query_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  params_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_query_history_provider_created
  ON api_query_history(provider, created_at DESC);
