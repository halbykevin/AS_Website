#!/usr/bin/env bash
# =============================================================================
# release.sh — runs ON the host as root (uploaded by deploy/asdesk.sh).
#
#   release.sh deploy <tarball>   unpack to releases/<id>, back up + migrate if needed,
#                                 switch `current`, restart, health-check; on failure
#                                 switch back to the previous release automatically
#   release.sh rollback           re-activate the release before the current one
#   release.sh status             what is running, and whether it is healthy
#
# Releases are immutable directories; `current` is switched with an atomic rename, so the
# service always starts a complete tree. Migrations run BEFORE the switch while the old
# release keeps serving, so they must be additive (expand first, remove in a later release).
# A rollback does not undo migrations — the pre-deploy backup in /opt/asdesk/backups does.
# =============================================================================

set -euo pipefail
if [ -t 1 ] || [ "${ASDESK_COLOR:-}" = 1 ]; then
  C_RESET='\033[0m'; C_BOLD='\033[1m'; C_DIM='\033[2m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'; C_CYAN='\033[0;36m'
else C_RESET=''; C_BOLD=''; C_DIM=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''; fi
step() { printf "\n${C_BOLD}${C_CYAN}▸ %s${C_RESET}\n" "$*"; }
ok()   { printf "${C_GREEN}  ✓${C_RESET} %s\n" "$*"; }
info() { printf "${C_DIM}  • %s${C_RESET}\n" "$*"; }
warn() { printf "${C_YELLOW}  ! %s${C_RESET}\n" "$*"; }
die()  { printf "${C_RED}  ✗ %s${C_RESET}\n" "$*" >&2; exit 1; }

BASE=/opt/asdesk
SERVICE=asdesk-api
APP_USER=asdesk
KEEP_RELEASES=5
ENV_FILE="$BASE/shared/.env"
[ "$(id -u)" = 0 ] || die "must run as root"
[ -f "$ENV_FILE" ] && [ -f "/etc/systemd/system/$SERVICE.service" ] || die "host is not provisioned — run: npm run server:provision"
PORT="$(grep -m1 '^PORT=' "$ENV_FILE" | cut -d= -f2- | tr -d "'\"")"
NODE_BIN="$(command -v node)"

exec 9>/run/lock/asdesk-release.lock
flock -n 9 || die "another deploy or rollback is running"

as_app() { (cd "$1" && runuser -u "$APP_USER" -- "$NODE_BIN" --env-file="$ENV_FILE" "${@:2}"); }
active_release() { readlink -f "$BASE/current" 2>/dev/null || true; }
# Newest release older than the given one (release names sort by time).
release_before() { ls -1d "$BASE"/releases/asdesk-api-* 2>/dev/null | sort | awk -v cur="$1" '$0 < cur' | tail -1; }
switch_to() {
  ln -sfn "$1" "$BASE/current.next"
  mv -Tf "$BASE/current.next" "$BASE/current"
}
# Healthy means /ready answers AND the process answering is the one systemd just started.
healthy() {
  local pid listener
  for _ in $(seq 1 40); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/ready" >/dev/null 2>&1; then
      pid="$(systemctl show -p MainPID --value "$SERVICE")"
      listener="$(ss -H -ltnp "( sport = :$PORT )" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
      [ -n "$pid" ] && [ "$pid" = "$listener" ] && return 0
      warn "port $PORT is answered by pid ${listener:-?}, not $SERVICE (pid $pid)"; return 1
    fi
    systemctl is-failed --quiet "$SERVICE" && return 1
    sleep 0.5
  done
  return 1
}
restart_and_check() {
  systemctl restart "$SERVICE"
  if healthy; then ok "$SERVICE healthy (pid $(systemctl show -p MainPID --value "$SERVICE"))"; return 0; fi
  journalctl -u "$SERVICE" -n 30 --no-pager -o cat | sed 's/^/    /' >&2 || true
  return 1
}
label() { local info="$1/build-info.json"; [ -f "$info" ] && sed -nE 's/.*"(version|commit)": "([^"]+)".*/\2/p' "$info" | paste -sd' ' || basename "$1"; }

cmd_deploy() {
  local tarball="$1" id dir previous pending
  [ -f "$tarball" ] || die "tarball not found: $tarball"
  id="$(basename "$tarball" .tar.gz)"
  [[ "$id" =~ ^asdesk-api-[0-9]{8}-[0-9]{6}-[A-Za-z0-9]+$ ]] || die "unexpected release name: $id"
  dir="$BASE/releases/$id"
  [ ! -e "$dir" ] || die "release $id already exists"
  previous="$(active_release)"

  step "unpacking $id"
  mkdir "$dir.partial"
  tar -xzf "$tarball" -C "$dir.partial" --no-same-owner --no-same-permissions
  chown -R root:root "$dir.partial"; chmod -R u=rwX,go=rX "$dir.partial"
  for f in dist/server.mjs dist/migrate.mjs dist/admin.mjs build-info.json; do [ -f "$dir.partial/$f" ] || { rm -rf "$dir.partial"; die "release is missing $f"; }; done
  mv "$dir.partial" "$dir"
  ok "$(label "$dir") → $dir"

  step "database migrations"
  pending="$(as_app "$dir" "$dir/dist/migrate.mjs" --pending)" || { rm -rf "$dir"; die "cannot reach the database"; }
  if [ "$pending" = 0 ]; then ok "schema up to date"
  else
    info "$pending pending — backing up first"
    "$BASE/bin/asdesk-backup" pre-deploy | sed 's/^/    backup: /' || { rm -rf "$dir"; die "backup failed; nothing was changed"; }
    as_app "$dir" "$dir/dist/migrate.mjs" | sed 's/^/    /' || { rm -rf "$dir"; die "migration failed and was rolled back; the previous release is still serving"; }
    ok "migrated"
  fi

  step "activating"
  switch_to "$dir"
  if restart_and_check; then
    ok "now serving $(label "$dir")"
  else
    # The failed tree is removed so it can never be activated by a later rollback;
    # the operator still has the tarball locally.
    if [ -n "$previous" ] && [ -d "$previous" ]; then
      warn "new release is unhealthy — switching back to $(basename "$previous")"
      switch_to "$previous"
      rm -rf "$dir"
      restart_and_check || die "the previous release is unhealthy too — check: journalctl -u $SERVICE"
      die "deploy rolled back; $(basename "$previous") is serving"
    fi
    systemctl stop "$SERVICE"; rm -f "$BASE/current"; rm -rf "$dir"
    die "first release is unhealthy and was removed — check: journalctl -u $SERVICE"
  fi

  step "cleanup"
  local keep=0 old
  for old in $(ls -1d "$BASE"/releases/asdesk-api-* 2>/dev/null | sort -r); do
    keep=$((keep + 1))
    [ "$keep" -le "$KEEP_RELEASES" ] || [ "$old" = "$dir" ] || [ "$old" = "$previous" ] || { rm -rf "$old"; info "removed $(basename "$old")"; }
  done
  ok "keeping the $KEEP_RELEASES newest releases"
}

cmd_rollback() {
  local current target
  current="$(active_release)"
  [ -n "$current" ] || die "no active release"
  target="$(release_before "$current")"
  [ -n "$target" ] || die "no older release to roll back to"
  step "rolling back $(basename "$current") → $(basename "$target")"
  warn "database migrations are not reverted; restore a pre-deploy backup if a migration must be undone"
  switch_to "$target"
  restart_and_check || { switch_to "$current"; restart_and_check || true; die "$(basename "$target") is unhealthy; switched back to $(basename "$current")"; }
  ok "now serving $(label "$target")"
}

cmd_status() {
  local current domain cert
  current="$(active_release)"
  step "release"
  if [ -n "$current" ]; then ok "$(basename "$current") ($(label "$current"))"; else warn "no release deployed"; fi
  info "available: $(ls -1d "$BASE"/releases/asdesk-api-* 2>/dev/null | wc -l) release(s)"
  step "services"
  for unit in "$SERVICE" coturn nginx postgresql; do
    if systemctl is-active --quiet "$unit"; then ok "$unit active (since $(systemctl show -p ActiveEnterTimestamp --value "$unit"))"; else warn "$unit $(systemctl is-active "$unit")"; fi
  done
  if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/ready" >/dev/null 2>&1; then ok "API ready on 127.0.0.1:$PORT"; else warn "API not ready on 127.0.0.1:$PORT"; fi
  step "TLS and relay"
  domain="$(grep -m1 '^TURN_URLS=' "$ENV_FILE" | sed -nE 's/.*turn:([^:]+):.*/\1/p')"
  cert="/etc/letsencrypt/live/$domain/fullchain.pem"
  [ -f "$cert" ] && ok "certificate for $domain expires $(openssl x509 -enddate -noout -in "$cert" | cut -d= -f2)"
  local turn_port; turn_port="$(grep -m1 '^listening-port=' /etc/turnserver.conf 2>/dev/null | cut -d= -f2)"
  if [ -n "$turn_port" ] && ss -H -lnu "( sport = :$turn_port )" | grep -q .; then ok "TURN relay listening on $domain:$turn_port"; else warn "TURN relay not listening"; fi
  step "data"
  [ -n "$current" ] && { as_app "$current" "$current/dist/admin.mjs" summary 2>/dev/null | sed 's/^/  • /' || warn "database unavailable"; }
  local last; last="$(ls -1t "$BASE"/backups/asdesk-*.dump 2>/dev/null | head -1)"
  [ -n "$last" ] && ok "last backup $(basename "$last") ($(du -h "$last" | cut -f1))" || warn "no backups yet (nightly at 03:40)"
}

case "${1:-}" in
  deploy) cmd_deploy "${2:?tarball required}" ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  *) die "usage: release.sh deploy <tarball> | rollback | status" ;;
esac
