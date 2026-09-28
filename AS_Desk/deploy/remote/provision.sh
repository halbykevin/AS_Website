#!/usr/bin/env bash
# =============================================================================
# provision.sh — runs ON the host as root (uploaded by `npm run server:provision`).
#
# Sets up, or repairs, everything the ASDesk control server needs on a shared
# Ubuntu host that already runs nginx + certbot and PostgreSQL for other apps.
# Every step is idempotent. Nothing belonging to another application is changed:
# only files and units named asdesk*, coturn's config, and one nginx vhost.
#
#   /opt/asdesk/releases/<id>   immutable server releases (written by release.sh)
#   /opt/asdesk/current         symlink to the active release
#   /opt/asdesk/shared/.env     configuration and secrets (root:asdesk 0640)
#   /opt/asdesk/downloads/      desktop installers, served at https://<domain>/downloads/
#   /opt/asdesk/backups/        nightly pg_dump archives (14 days)
#
# Secrets are generated once and never rotated here: rotating the session signing
# key would invalidate every enrolled computer, and rotating the enrollment token
# is an explicit operator decision (edit the .env, then restart asdesk-api).
# =============================================================================

set -euo pipefail
umask 022

if [ -t 1 ] || [ "${ASDESK_COLOR:-}" = 1 ]; then
  C_RESET='\033[0m'; C_BOLD='\033[1m'; C_DIM='\033[2m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'; C_CYAN='\033[0;36m'
else C_RESET=''; C_BOLD=''; C_DIM=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''; fi
step() { printf "\n${C_BOLD}${C_CYAN}▸ %s${C_RESET}\n" "$*"; }
ok()   { printf "${C_GREEN}  ✓${C_RESET} %s\n" "$*"; }
info() { printf "${C_DIM}  • %s${C_RESET}\n" "$*"; }
warn() { printf "${C_YELLOW}  ! %s${C_RESET}\n" "$*"; }
die()  { printf "${C_RED}  ✗ %s${C_RESET}\n" "$*" >&2; exit 1; }

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES="$KIT/templates"
BASE=/opt/asdesk
APP_USER=asdesk
SERVICE=asdesk-api
DB_NAME=asdesk
DB_USER=asdesk
DOMAIN=""; APP_PORT=4700; TURN_PORT=3478; TURNS_PORT=5349; TURN_MIN_PORT=49160; TURN_MAX_PORT=49660; ACME_EMAIL=""; ENROLLMENT=token
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --app-port) APP_PORT="$2"; shift 2 ;;
    --turn-port) TURN_PORT="$2"; shift 2 ;;
    --turns-port) TURNS_PORT="$2"; shift 2 ;;
    --turn-min-port) TURN_MIN_PORT="$2"; shift 2 ;;
    --turn-max-port) TURN_MAX_PORT="$2"; shift 2 ;;
    --acme-email) ACME_EMAIL="$2"; shift 2 ;;
    --enrollment) ENROLLMENT="$2"; shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die "--domain must be a lowercase DNS name"
for port in "$APP_PORT" "$TURN_PORT" "$TURNS_PORT" "$TURN_MIN_PORT" "$TURN_MAX_PORT"; do
  [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || die "invalid port: $port"
done
[ "$TURN_MIN_PORT" -lt "$TURN_MAX_PORT" ] || die "TURN relay range is empty"
[[ "$ENROLLMENT" =~ ^(open|token)$ ]] || die "--enrollment must be open or token"

# Who owns a listening TCP/UDP port: prints the process name (or pid), or nothing when free.
port_owner() { ss -H -lnp -A "$1" "( sport = :$2 )" 2>/dev/null | grep -oE 'users:\(\("[^"]+"' | head -1 | cut -d'"' -f2 || true; }
port_pid() { ss -H -lnp -A "$1" "( sport = :$2 )" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true; }

# ── 1. Preflight ─────────────────────────────────────────────────────────────
step "preflight"
[ "$(id -u)" = 0 ] || die "must run as root"
. /etc/os-release
case "$ID" in ubuntu|debian) ok "$PRETTY_NAME" ;; *) die "unsupported OS: $PRETTY_NAME (Ubuntu/Debian expected)" ;; esac
command -v node >/dev/null || die "node is not installed"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "node >= 22 required (found $(node -v))"
NODE_BIN="$(command -v node)"
ok "node $(node -v) at $NODE_BIN"
systemctl is-active --quiet nginx || die "nginx is not running"
systemctl is-active --quiet postgresql || die "postgresql is not running"
command -v certbot >/dev/null || die "certbot is not installed"
ok "nginx, postgresql and certbot present"
PUBLIC_IP="$(ip -4 route get 1.1.1.1 | grep -oE 'src [0-9.]+' | awk '{print $2}')"
[ -n "$PUBLIC_IP" ] || die "could not determine the public IPv4 address"
RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)"
[ "$RESOLVED" = "$PUBLIC_IP" ] || die "$DOMAIN resolves to '${RESOLVED:-nothing}', not this host ($PUBLIC_IP). Point its A record here first."
ok "$DOMAIN → $PUBLIC_IP"
owner="$(port_owner tcp "$APP_PORT")"
if [ -n "$owner" ] && [ "$(port_pid tcp "$APP_PORT")" != "$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null || echo 0)" ]; then
  die "port $APP_PORT is used by '$owner'; choose another APP_PORT in the host profile"
fi
for p in "$TURN_PORT" "$TURNS_PORT"; do
  owner="$(port_owner tcp "$p")"
  [ -z "$owner" ] || [ "$owner" = turnserver ] || die "port $p is used by '$owner'"
done
ok "ports $APP_PORT (api), $TURN_PORT/$TURNS_PORT (turn) available"

# ── 2. Packages ──────────────────────────────────────────────────────────────
step "packages"
if dpkg -s coturn >/dev/null 2>&1; then ok "coturn $(dpkg-query -W -f='${Version}' coturn)"
else
  info "installing coturn"
  # Keep the package from starting an unconfigured TURN server before our config is written.
  POLICY=/usr/sbin/policy-rc.d; OWN_POLICY=0
  if [ ! -e "$POLICY" ]; then printf '#!/bin/sh\nexit 101\n' > "$POLICY"; chmod 755 "$POLICY"; OWN_POLICY=1; fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/tmp/asdesk-apt.log 2>&1 || true
  if ! apt-get install -y -qq -o Dpkg::Options::=--force-confold coturn >>/tmp/asdesk-apt.log 2>&1; then
    [ "$OWN_POLICY" = 1 ] && rm -f "$POLICY"; tail -n 20 /tmp/asdesk-apt.log; die "coturn installation failed"
  fi
  [ "$OWN_POLICY" = 1 ] && rm -f "$POLICY"
  systemctl stop coturn 2>/dev/null || true
  ok "coturn installed"
fi
command -v pg_dump >/dev/null || die "pg_dump missing (postgresql-client)"

# ── 3. Service account and directories ───────────────────────────────────────
step "service account and directories"
if id "$APP_USER" >/dev/null 2>&1; then ok "user $APP_USER exists"
else useradd --system --home-dir "$BASE" --no-create-home --shell /usr/sbin/nologin "$APP_USER"; ok "created system user $APP_USER"; fi
install -d -o root -g root -m 0755 "$BASE" "$BASE/releases" "$BASE/downloads" "$BASE/bin"
install -d -o root -g "$APP_USER" -m 0750 "$BASE/shared"
install -d -o root -g root -m 0700 "$BASE/backups"
ok "$BASE"

# ── 4. PostgreSQL ────────────────────────────────────────────────────────────
step "postgresql"
ENV_FILE="$BASE/shared/.env"
env_get() { [ -f "$ENV_FILE" ] && grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//" || true; }
DB_PASS=""
if url="$(env_get DATABASE_URL)" && [ -n "$url" ]; then DB_PASS="$(printf '%s' "$url" | sed -nE 's#^postgres(ql)?://[^:]+:([^@]+)@.*#\2#p')"; fi
psql_admin() { runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -qAt "$@"; }
if [ -n "$DB_PASS" ] && PGPASSWORD="$DB_PASS" psql -X -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -qAtc 'SELECT 1' >/dev/null 2>&1; then
  ok "database $DB_NAME reachable with the configured credentials"
else
  [ -n "$DB_PASS" ] || DB_PASS="$(openssl rand -hex 24)"
  if [ "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")" = 1 ]; then
    psql_admin -c "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS'"; info "reset password of role $DB_USER"
  else
    psql_admin -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS'"; info "created role $DB_USER"
  fi
  if [ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")" != 1 ]; then
    runuser -u postgres -- createdb -O "$DB_USER" "$DB_NAME"; info "created database $DB_NAME"
  fi
  psql_admin -c "REVOKE ALL ON DATABASE $DB_NAME FROM PUBLIC; GRANT CONNECT, TEMPORARY ON DATABASE $DB_NAME TO $DB_USER"
  PGPASSWORD="$DB_PASS" psql -X -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -qAtc 'SELECT 1' >/dev/null || die "cannot log in as $DB_USER over 127.0.0.1 (check pg_hba.conf)"
  ok "database $DB_NAME ready"
fi

# ── 5. Configuration and secrets ─────────────────────────────────────────────
step "configuration"
touch "$ENV_FILE"; chown root:"$APP_USER" "$ENV_FILE"; chmod 0640 "$ENV_FILE"
# Settings derived from this command line are reconciled; secrets are only ever added.
env_set() {
  local tmp; tmp="$(mktemp "$BASE/shared/.env.XXXXXX")"
  grep -v "^$1=" "$ENV_FILE" > "$tmp" || true
  printf "%s='%s'\n" "$1" "$2" >> "$tmp"
  chown root:"$APP_USER" "$tmp"; chmod 0640 "$tmp"; mv -f "$tmp" "$ENV_FILE"
}
env_ensure() { if [ -z "$(env_get "$1")" ]; then env_set "$1" "$2"; info "generated $1"; fi; }
env_set NODE_ENV production
env_set HOST 127.0.0.1
env_set PORT "$APP_PORT"
env_set TRUST_PROXY 127.0.0.1
env_set ENROLLMENT_MODE "$ENROLLMENT"
env_set DATABASE_URL "postgres://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME"
env_ensure ENROLLMENT_TOKEN "$(openssl rand -base64 33 | tr '+/' '-_')"
env_ensure SESSION_SIGNING_KEY_BASE64 "$(openssl genpkey -algorithm ed25519 2>/dev/null | base64 -w0)"
env_ensure TURN_SECRET "$(openssl rand -hex 32)"
env_set TURN_URLS "turn:$DOMAIN:$TURN_PORT?transport=udp,turn:$DOMAIN:$TURN_PORT?transport=tcp,turns:$DOMAIN:$TURNS_PORT?transport=tcp"
TURN_SECRET="$(env_get TURN_SECRET)"
ok "$ENV_FILE (secrets preserved)"

# ── 6. nginx and TLS ─────────────────────────────────────────────────────────
step "nginx and TLS certificate"
SITE="/etc/nginx/sites-available/$DOMAIN.conf"
LINK="/etc/nginx/sites-enabled/$DOMAIN.conf"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
render() { sed -e "s#@DOMAIN@#$DOMAIN#g" -e "s#@APP_PORT@#$APP_PORT#g" -e "s#@BASE@#$BASE#g" -e "s#@PUBLIC_IP@#$PUBLIC_IP#g" \
  -e "s#@TURN_PORT@#$TURN_PORT#g" -e "s#@TURNS_PORT@#$TURNS_PORT#g" -e "s#@TURN_MIN_PORT@#$TURN_MIN_PORT#g" -e "s#@TURN_MAX_PORT@#$TURN_MAX_PORT#g" \
  -e "s#@NODE_BIN@#$NODE_BIN#g" -e "s#@APP_USER@#$APP_USER#g" "$1"; }
# Installs a vhost and reloads nginx, restoring the previous file if nginx rejects it.
install_site() {
  local backup=""
  [ -f "$SITE" ] && { backup="$(mktemp)"; cp -p "$SITE" "$backup"; }
  render "$1" > "$SITE"; ln -sfn "$SITE" "$LINK"
  if nginx -t >/tmp/asdesk-nginx.log 2>&1; then systemctl reload nginx; [ -n "$backup" ] && rm -f "$backup"; return 0; fi
  if [ -n "$backup" ]; then mv -f "$backup" "$SITE"; else rm -f "$SITE" "$LINK"; fi
  cat /tmp/asdesk-nginx.log >&2
  die "nginx rejected the $DOMAIN vhost; the previous configuration was restored"
}
if [ ! -s "$CERT_DIR/fullchain.pem" ]; then
  install_site "$TEMPLATES/nginx-bootstrap.conf"
  info "requesting a Let's Encrypt certificate"
  email_args=(--register-unsafely-without-email); [ -n "$ACME_EMAIL" ] && email_args=(-m "$ACME_EMAIL")
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos "${email_args[@]}" >/tmp/asdesk-certbot.log 2>&1 \
    || { tail -n 20 /tmp/asdesk-certbot.log >&2; die "certificate request failed"; }
  ok "certificate issued"
else ok "certificate present (expires $(openssl x509 -enddate -noout -in "$CERT_DIR/fullchain.pem" | cut -d= -f2))"; fi
install_site "$TEMPLATES/nginx.conf"
ok "https://$DOMAIN → 127.0.0.1:$APP_PORT"

# ── 7. TURN relay (coturn) ───────────────────────────────────────────────────
step "TURN relay"
install -d -o turnserver -g turnserver -m 0750 /etc/coturn/certs
install -o turnserver -g turnserver -m 0644 "$CERT_DIR/fullchain.pem" /etc/coturn/certs/fullchain.pem
install -o turnserver -g turnserver -m 0600 "$CERT_DIR/privkey.pem" /etc/coturn/certs/privkey.pem
render "$TEMPLATES/certbot-coturn-hook.sh" > /etc/letsencrypt/renewal-hooks/deploy/asdesk-coturn.sh
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/asdesk-coturn.sh
[ -f /etc/turnserver.conf.dist ] || { [ -f /etc/turnserver.conf ] && cp -p /etc/turnserver.conf /etc/turnserver.conf.dist; } || true
tmp="$(mktemp)"
render "$TEMPLATES/turnserver.conf" > "$tmp"
printf 'static-auth-secret=%s\n' "$TURN_SECRET" >> "$tmp"
install -o root -g turnserver -m 0640 "$tmp" /etc/turnserver.conf; rm -f "$tmp"
[ -f /etc/default/coturn ] && sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable coturn >/dev/null 2>&1
systemctl restart coturn
sleep 1
systemctl is-active --quiet coturn || { journalctl -u coturn -n 30 --no-pager >&2; die "coturn failed to start"; }
[ "$(port_owner udp "$TURN_PORT")" = turnserver ] || warn "coturn is running but not listening on UDP $TURN_PORT yet"
ok "coturn on $PUBLIC_IP: $TURN_PORT udp/tcp, $TURNS_PORT tls, relay $TURN_MIN_PORT-$TURN_MAX_PORT/udp"
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow "$TURN_PORT" >/dev/null; ufw allow "$TURNS_PORT/tcp" >/dev/null; ufw allow "$TURN_MIN_PORT:$TURN_MAX_PORT/udp" >/dev/null
  ok "ufw rules for TURN"
fi

# ── 8. systemd service, backups, operator tools ──────────────────────────────
step "service, backups and tools"
render "$TEMPLATES/asdesk-api.service" > "/etc/systemd/system/$SERVICE.service"
render "$TEMPLATES/asdesk-backup.service" > /etc/systemd/system/asdesk-backup.service
render "$TEMPLATES/asdesk-backup.timer" > /etc/systemd/system/asdesk-backup.timer
render "$TEMPLATES/asdesk-backup.sh" > "$BASE/bin/asdesk-backup"; chmod 0755 "$BASE/bin/asdesk-backup"
render "$TEMPLATES/asdesk-admin.sh" > /usr/local/bin/asdesk-admin; chmod 0755 /usr/local/bin/asdesk-admin
systemctl daemon-reload
systemctl enable "$SERVICE" asdesk-backup.timer >/dev/null 2>&1
systemctl start asdesk-backup.timer
if [ -e "$BASE/current" ]; then
  systemctl restart "$SERVICE"
  for _ in $(seq 1 30); do curl -fsS --max-time 2 "http://127.0.0.1:$APP_PORT/ready" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS --max-time 2 "http://127.0.0.1:$APP_PORT/ready" >/dev/null 2>&1 && ok "$SERVICE restarted with the updated configuration" \
    || { journalctl -u "$SERVICE" -n 30 --no-pager >&2; die "$SERVICE did not become ready"; }
else info "no release yet — run: npm run server:deploy"; fi
ok "nightly backups at 03:40 (14 days kept) — asdesk-admin available for operators"

printf "\n${C_GREEN}${C_BOLD}✓ host provisioned for %s${C_RESET}\n" "$DOMAIN"
