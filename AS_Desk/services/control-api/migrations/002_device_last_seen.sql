ALTER TABLE devices ADD COLUMN last_seen_at timestamptz;
CREATE INDEX sessions_time_idx ON sessions(accepted_at);
