CREATE TABLE devices (
  id uuid PRIMARY KEY,
  public_id varchar(9) NOT NULL UNIQUE CHECK (public_id ~ '^[1-9][0-9]{8}$'),
  public_key text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform = 'windows'),
  agent_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE connection_requests (
  id uuid PRIMARY KEY,
  controller_id varchar(9) NOT NULL REFERENCES devices(public_id),
  target_id varchar(9) NOT NULL REFERENCES devices(public_id),
  status text NOT NULL CHECK (status IN ('pending','accepted','rejected','cancelled','expired')),
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  CHECK (controller_id <> target_id)
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES connection_requests(id),
  controller_id varchar(9) NOT NULL REFERENCES devices(public_id),
  target_id varchar(9) NOT NULL REFERENCES devices(public_id),
  status text NOT NULL CHECK (status IN ('signaling','connected','ended')),
  accepted_at timestamptz NOT NULL,
  connected_at timestamptz,
  ended_at timestamptz,
  termination_reason text
);
CREATE TABLE session_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  actor_id varchar(9) NOT NULL REFERENCES devices(public_id),
  request_id uuid REFERENCES connection_requests(id),
  session_id uuid REFERENCES sessions(id),
  occurred_at timestamptz NOT NULL,
  reason text
);
CREATE INDEX session_events_time_idx ON session_events(occurred_at);
CREATE INDEX requests_target_time_idx ON connection_requests(target_id,requested_at);
