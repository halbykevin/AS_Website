import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { publicId } from '../../../packages/protocol/src/index.ts';

// Operator commands. Revocation takes effect on the device's next request and, for an open
// connection, within one 15-second heartbeat.
const usage = `Usage:
  admin devices [--all]      list enrolled devices (revoked ones only with --all)
  admin revoke <device-id>   block a device from authenticating and end its connection
  admin restore <device-id>  allow a revoked device again
  admin sessions [limit]     recent sessions, newest first (default 20)
  admin summary              device and session counts`;
if (existsSync('.env')) process.loadEnvFile();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const [command, argument] = process.argv.slice(2);
const pool = new Pool({ connectionString: url, max: 1 });
const time = (value: Date | null) => value ? value.toISOString().replace('T', ' ').slice(0, 19) : '—';
try {
  if (command === 'devices') {
    const { rows } = await pool.query(`SELECT public_id, agent_version, created_at, last_seen_at, revoked_at FROM devices
      ${process.argv.includes('--all') ? '' : 'WHERE revoked_at IS NULL'} ORDER BY created_at`);
    console.table(rows.map(row => ({ id: row.public_id, version: row.agent_version, enrolled: time(row.created_at),
      'last seen (UTC)': time(row.last_seen_at), revoked: time(row.revoked_at) })));
  } else if (command === 'revoke' || command === 'restore') {
    const id = publicId.parse(argument?.replaceAll(' ', ''));
    const result = await pool.query(`UPDATE devices SET revoked_at=${command === 'revoke' ? 'now()' : 'NULL'} WHERE public_id=$1`, [id]);
    if (!result.rowCount) throw new Error(`No device ${id}`);
    console.log(command === 'revoke' ? `Device ${id} revoked.` : `Device ${id} restored.`);
  } else if (command === 'summary') {
    const { rows: [row] } = await pool.query(`SELECT
      (SELECT count(*) FROM devices WHERE revoked_at IS NULL) AS active,
      (SELECT count(*) FROM devices WHERE revoked_at IS NOT NULL) AS revoked,
      (SELECT count(*) FROM devices WHERE last_seen_at > now() - interval '1 day') AS seen_today,
      (SELECT count(*) FROM sessions WHERE accepted_at > now() - interval '1 day') AS sessions_today`);
    console.log(`${row.active} active device(s), ${row.revoked} revoked; ${row.seen_today} seen and ${row.sessions_today} session(s) in the last 24 h`);
  } else if (command === 'sessions') {
    const limit = Math.min(500, Math.max(1, Number(argument ?? 20) || 20));
    const { rows } = await pool.query(`SELECT controller_id, target_id, status, accepted_at, connected_at, ended_at, termination_reason
      FROM sessions ORDER BY accepted_at DESC LIMIT $1`, [limit]);
    console.table(rows.map(row => ({ controller: row.controller_id, target: row.target_id, status: row.status,
      'accepted (UTC)': time(row.accepted_at), connected: time(row.connected_at), ended: time(row.ended_at), reason: row.termination_reason ?? '' })));
  } else {
    console.log(usage);
    process.exitCode = command ? 1 : 0;
  }
} finally { await pool.end(); }
