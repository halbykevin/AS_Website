#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# AS Company — API deploy. THIS SCRIPT RUNS ON THE VPS.
#
#   Pulls the requested branch, installs dependencies only when they changed,
#   runs the database migration only when the schema actually changed (with a
#   pg_dump taken first), restarts PM2, health-checks the API, and rolls the
#   code back if the API does not come up.
#
# Usage (on the VPS):
#     bash /opt/as-company/deploy.sh [options]
#
# From Windows/macOS, do not run this directly — run `npm run deploy` in
# server/, which drives deploy.ps1 (Windows) or this script over SSH.
#
# Options:
#   -b, --branch <name>   Branch to deploy      (default: current branch)
#       --force-migrate   Run migrations even if the schema is unchanged
#       --skip-migrate    Never run migrations this deploy
#       --no-pull         Deploy the code already on disk (no git fetch/merge)
#       --allow-dirty     Continue even if the VPS working tree is dirty
#       --no-backup       Skip the pre-migration pg_dump
#       --no-rollback     Do not auto-revert the code if the health check fails
#   -n, --dry-run         Show what would happen, change nothing
#   -h, --help            This help
#
# Env overrides: PM2_NAME (as-api), HEALTH_TIMEOUT (60s), GIT_REMOTE (origin)
#
# The frontend is NOT built here — Vercel rebuilds it automatically on push.
# ---------------------------------------------------------------------------
set -Eeuo pipefail

PM2_NAME="${PM2_NAME:-as-api}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"

BRANCH=""
DO_PULL=1
FORCE_MIGRATE=0
SKIP_MIGRATE=0
ALLOW_DIRTY=0
DO_BACKUP=1
DO_ROLLBACK=1
DRY_RUN=0

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  C_RESET=$(tput sgr0); C_DIM=$(tput dim); C_BOLD=$(tput bold)
  C_RED=$(tput setaf 1); C_GREEN=$(tput setaf 2); C_YELLOW=$(tput setaf 3); C_BLUE=$(tput setaf 4)
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""
fi

step() { printf '\n%s▶ %s%s\n' "$C_BOLD$C_BLUE" "$*" "$C_RESET"; }
info() { printf '  %s\n' "$*"; }
dim()  { printf '  %s%s%s\n' "$C_DIM" "$*" "$C_RESET"; }
warn() { printf '%s! %s%s\n' "$C_YELLOW" "$*" "$C_RESET" >&2; }
ok()   { printf '%s✓ %s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
die()  { printf '\n%s✗ %s%s\n' "$C_RED$C_BOLD" "$*" "$C_RESET" >&2; exit 1; }

trap 'printf "\n%s✗ Deploy aborted at line %s.%s\n" "$C_RED$C_BOLD" "$LINENO" "$C_RESET" >&2' ERR

# Print the header comment block (line 2 up to the first non-comment line).
usage() { awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "$0"; exit 0; }

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    -b|--branch)     BRANCH="${2:-}"; [ -n "$BRANCH" ] || die "--branch needs a value"; shift 2 ;;
    --branch=*)      BRANCH="${1#*=}"; shift ;;
    --force-migrate) FORCE_MIGRATE=1; shift ;;
    --skip-migrate)  SKIP_MIGRATE=1; shift ;;
    --no-pull)       DO_PULL=0; shift ;;
    --allow-dirty)   ALLOW_DIRTY=1; shift ;;
    --no-backup)     DO_BACKUP=0; shift ;;
    --no-rollback)   DO_ROLLBACK=0; shift ;;
    -n|--dry-run)    DRY_RUN=1; shift ;;
    -h|--help)       usage ;;
    *)               die "Unknown option: $1 (try --help)" ;;
  esac
done

[ "$FORCE_MIGRATE" = 1 ] && [ "$SKIP_MIGRATE" = 1 ] && die "--force-migrate and --skip-migrate are mutually exclusive"

# ---------------------------------------------------------------------------
# Locate the repo (works through symlinks, from any cwd)
# ---------------------------------------------------------------------------
SELF="${BASH_SOURCE[0]}"
while [ -L "$SELF" ]; do
  link=$(readlink "$SELF")
  case "$link" in
    /*) SELF="$link" ;;
    *)  SELF="$(dirname "$SELF")/$link" ;;
  esac
done
ROOT="$(cd -- "$(dirname -- "$SELF")" && pwd -P)"
cd "$ROOT"

[ -f "server/package.json" ] || die "server/package.json not found in $ROOT — is this the AS_Website repo?"
[ -d ".git" ] || [ "$DO_PULL" = 0 ] || die "$ROOT is not a git checkout — re-run with --no-pull, or clone the repo here."

STATE_DIR="$ROOT/.deploy-state"
mkdir -p "$STATE_DIR/backups"

# Only one deploy at a time.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$STATE_DIR/deploy.lock"
  flock -n 9 || die "Another deploy is already running (lock: $STATE_DIR/deploy.lock)"
fi

# ---------------------------------------------------------------------------
# Toolchain — `ssh host "bash deploy.sh"` is a NON-interactive shell, so nvm's
# PATH setup in ~/.bashrc never runs. Source it ourselves before giving up.
# ---------------------------------------------------------------------------
ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && command -v pm2 >/dev/null 2>&1; then
    return
  fi
  for nvm in "$HOME/.nvm/nvm.sh" "/usr/local/nvm/nvm.sh" "/opt/nvm/nvm.sh"; do
    if [ -s "$nvm" ]; then
      # shellcheck disable=SC1090
      . "$nvm" >/dev/null 2>&1 || true
      break
    fi
  done
  for extra in "$HOME/.local/bin" "/usr/local/bin"; do
    case ":$PATH:" in *":$extra:"*) ;; *) [ -d "$extra" ] && PATH="$PATH:$extra" ;; esac
  done
  export PATH
}
ensure_node

command -v node >/dev/null 2>&1 || die "node not found on PATH. Install Node (or fix nvm) on the VPS."
command -v npm  >/dev/null 2>&1 || die "npm not found on PATH."
HAVE_PM2=1; command -v pm2 >/dev/null 2>&1 || HAVE_PM2=0

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@" | awk '{print $1}'
  else shasum -a 256 "$@" | awk '{print $1}'
  fi
}

# Read a key out of server/.env without sourcing it (values may contain spaces).
env_value() {
  local key="$1" line
  [ -f "$ROOT/server/.env" ] || return 0
  line=$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$ROOT/server/.env" | tail -n 1 || true)
  [ -n "$line" ] || return 0
  line="${line#*=}"
  line="${line#"${line%%[![:space:]]*}"}"        # ltrim
  line="${line%"${line##*[![:space:]]}"}"        # rtrim
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

run() { # run <description> <cmd...>
  local what="$1"; shift
  if [ "$DRY_RUN" = 1 ]; then dim "[dry-run] $what"; return 0; fi
  "$@"
}

printf '%s\n' "${C_BOLD}AS Company — API deploy${C_RESET}"
dim "repo: $ROOT"
[ "$DRY_RUN" = 1 ] && warn "DRY RUN — nothing will be changed."

# ---------------------------------------------------------------------------
# 1. Sync the code
# ---------------------------------------------------------------------------
BEFORE=""; AFTER=""; CHANGED=""
if [ -d ".git" ]; then
  BEFORE=$(git rev-parse HEAD)
  CURRENT=$(git rev-parse --abbrev-ref HEAD)
  [ "$CURRENT" = "HEAD" ] && CURRENT=""

  if [ -z "$BRANCH" ]; then
    [ -n "$CURRENT" ] || die "The VPS checkout is in detached HEAD — pass --branch <name>."
    BRANCH="$CURRENT"
  fi

  if [ "$ALLOW_DIRTY" = 0 ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    git status --short --untracked-files=no >&2
    die "The VPS working tree has uncommitted changes (above). Commit/stash them there, or re-run with --allow-dirty."
  fi
fi

if [ "$DO_PULL" = 1 ]; then
  step "Syncing code — branch '$BRANCH' from $GIT_REMOTE"
  run "git fetch --prune $GIT_REMOTE" git fetch --prune "$GIT_REMOTE"
  if [ "$DRY_RUN" = 0 ]; then
    git rev-parse --verify --quiet "refs/remotes/$GIT_REMOTE/$BRANCH" >/dev/null \
      || die "$GIT_REMOTE/$BRANCH does not exist. Push the branch first."
    if [ "$CURRENT" != "$BRANCH" ]; then
      info "switching $CURRENT → $BRANCH"
      git checkout "$BRANCH"
    fi
    # Fast-forward only: refuses to silently merge/diverge on the server.
    git merge --ff-only "$GIT_REMOTE/$BRANCH"
    AFTER=$(git rev-parse HEAD)
    if [ "$AFTER" = "$BEFORE" ]; then
      info "already at $(git rev-parse --short HEAD) — no new commits"
    else
      info "$(git rev-parse --short "$BEFORE") → $(git rev-parse --short "$AFTER")"
      git --no-pager log --oneline --no-decorate "$BEFORE..$AFTER" | sed 's/^/    /'
    fi
    CHANGED=$(git diff --name-only "$BEFORE" "$AFTER" || true)
  fi
else
  step "Skipping git (--no-pull) — deploying the code already on disk"
  [ -d ".git" ] && AFTER=$(git rev-parse HEAD)
fi

# ---------------------------------------------------------------------------
# 2. Dependencies — only when the manifests changed (or none installed yet)
# ---------------------------------------------------------------------------
step "Dependencies"
NEED_INSTALL=0
if [ ! -d "server/node_modules" ]; then
  NEED_INSTALL=1; info "server/node_modules missing → full install"
elif printf '%s\n' "$CHANGED" | grep -qE '^server/package(-lock)?\.json$'; then
  NEED_INSTALL=1; info "package.json / package-lock.json changed → install"
fi

if [ "$NEED_INSTALL" = 1 ]; then
  if [ -f "server/package-lock.json" ]; then
    if [ "$DRY_RUN" = 1 ]; then dim "[dry-run] npm ci (server/)"
    else ( cd server && { npm ci --no-audit --no-fund || { warn "npm ci failed — falling back to npm install"; npm install --no-audit --no-fund; }; } )
    fi
  else
    run "npm install (server/)" bash -c "cd '$ROOT/server' && npm install --no-audit --no-fund"
  fi
  ok "dependencies installed"
else
  dim "unchanged — skipped"
fi

# ---------------------------------------------------------------------------
# 3. Schema changes
#
# There is no migration-file runner here: server/src/migrate.js is one big
# idempotent DDL blob. So instead of tracking file names, fingerprint every
# schema-bearing file under server/ (anything containing CREATE/ALTER/DROP
# TABLE|INDEX|SEQUENCE…, plus any *.sql) and compare it to the last deploy.
# That catches migrate.js edits, new .sql files, and DDL added anywhere else —
# and works even when the code arrives without git history (--no-pull).
# ---------------------------------------------------------------------------
step "Database schema"
MANIFEST="$STATE_DIR/schema.manifest"
NEW_MANIFEST="$STATE_DIR/schema.manifest.new"
DDL_RE='(CREATE|ALTER|DROP)[[:space:]]+(TABLE|INDEX|SEQUENCE|TYPE|VIEW|SCHEMA|MATERIALIZED)|ADD[[:space:]]+COLUMN|DROP[[:space:]]+COLUMN'

: > "$NEW_MANIFEST"
while IFS= read -r -d '' f; do
  if [ "${f##*.}" = "sql" ] || grep -qiE "$DDL_RE" "$f" 2>/dev/null; then
    printf '%s  %s\n' "$(sha256 "$f")" "${f#./}" >> "$NEW_MANIFEST"
  fi
done < <(
  find ./server \
    \( -name node_modules -o -name uploads -o -name scrapes -o -name .git \) -prune -o \
    -type f \( -name '*.sql' -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.ts' \) \
    -print0 | sort -z
)

SCHEMA_FILES=$(wc -l < "$NEW_MANIFEST" | tr -d ' ')
info "$SCHEMA_FILES schema-bearing file(s) scanned under server/"

MIGRATE=0
MIGRATE_WHY=""
if [ "$SKIP_MIGRATE" = 1 ]; then
  MIGRATE_WHY="--skip-migrate"
elif [ "$FORCE_MIGRATE" = 1 ]; then
  MIGRATE=1; MIGRATE_WHY="--force-migrate"
elif [ ! -f "$MANIFEST" ]; then
  MIGRATE=1; MIGRATE_WHY="no record of a previous deploy"
elif ! cmp -s "$MANIFEST" "$NEW_MANIFEST"; then
  MIGRATE=1; MIGRATE_WHY="schema changed"
else
  MIGRATE_WHY="unchanged since last deploy"
fi

if [ "$MIGRATE" = 1 ]; then
  info "migration needed ($MIGRATE_WHY)"

  # Show exactly which schema files moved, so the log says *why* it migrated.
  if [ -f "$MANIFEST" ] && [ "$MIGRATE_WHY" = "schema changed" ]; then
    join -j 2 <(sort -k2 "$MANIFEST") <(sort -k2 "$NEW_MANIFEST") 2>/dev/null \
      | awk '$2 != $3 { print "    changed: " $1 }' || true
    comm -13 <(awk '{print $2}' "$MANIFEST" | sort) <(awk '{print $2}' "$NEW_MANIFEST" | sort) \
      | sed 's/^/    added:   /' || true
    comm -23 <(awk '{print $2}' "$MANIFEST" | sort) <(awk '{print $2}' "$NEW_MANIFEST" | sort) \
      | sed 's/^/    removed: /' || true
  fi

  # 3a. Back up first — migrate.js contains DROP COLUMN / DELETE statements.
  DB_URL=$(env_value DATABASE_URL)
  if [ "$DO_BACKUP" = 1 ] && [ -n "$DB_URL" ] && command -v pg_dump >/dev/null 2>&1; then
    STAMP=$(date +%Y%m%d-%H%M%S)
    DUMP="$STATE_DIR/backups/as_company-$STAMP.dump"
    if [ "$DRY_RUN" = 1 ]; then
      dim "[dry-run] pg_dump → $DUMP"
    elif pg_dump "$DB_URL" --no-owner --no-acl --format=custom --file="$DUMP" 2>/dev/null; then
      ok "backup: $DUMP ($(du -h "$DUMP" | cut -f1))"
      ls -1t "$STATE_DIR"/backups/*.dump 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
    else
      rm -f "$DUMP"
      warn "pg_dump failed — continuing WITHOUT a backup. Restore point unavailable."
    fi
  elif [ "$DO_BACKUP" = 1 ]; then
    warn "no pg_dump / DATABASE_URL — continuing without a backup"
  fi

  # 3b. Migrate (idempotent).
  if [ "$DRY_RUN" = 1 ]; then dim "[dry-run] npm run migrate (server/)"
  else ( cd server && npm run migrate ) || die "Migration failed — the API was NOT restarted, so the old code is still serving."
  fi
  ok "schema up to date"
else
  dim "skipped ($MIGRATE_WHY)"
fi

# ---------------------------------------------------------------------------
# 4. Restart
# ---------------------------------------------------------------------------
step "Restarting the API (PM2: $PM2_NAME)"
if [ "$HAVE_PM2" = 0 ]; then
  warn "pm2 not found — install it with: sudo npm i -g pm2"
  [ "$DRY_RUN" = 1 ] || die "Cannot restart the API without pm2."
elif [ "$DRY_RUN" = 1 ]; then
  dim "[dry-run] pm2 restart $PM2_NAME --update-env"
elif pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env >/dev/null
  ok "restarted"
else
  info "no PM2 process named '$PM2_NAME' — starting it"
  ( cd server && pm2 start src/index.js --name "$PM2_NAME" >/dev/null )
  pm2 save >/dev/null
  ok "started and saved to the PM2 boot list"
fi

# ---------------------------------------------------------------------------
# 5. Health check (+ rollback)
# ---------------------------------------------------------------------------
PORT=$(env_value PORT); PORT="${PORT:-8080}"
HEALTH="http://127.0.0.1:$PORT/api/health"

if [ "$DRY_RUN" = 1 ]; then
  dim "[dry-run] health check $HEALTH"
else
  step "Health check — $HEALTH"
  HEALTHY=0
  for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -fsS --max-time 3 "$HEALTH" >/dev/null 2>&1; then HEALTHY=1; break; fi
    sleep 1
  done

  if [ "$HEALTHY" = 1 ]; then
    ok "API responding"
  else
    warn "API did not respond within ${HEALTH_TIMEOUT}s"
    pm2 logs "$PM2_NAME" --lines 40 --nostream 2>/dev/null || true
    if [ "$DO_ROLLBACK" = 1 ] && [ -n "$BEFORE" ] && [ -n "$AFTER" ] && [ "$BEFORE" != "$AFTER" ]; then
      warn "Rolling the CODE back to $(git rev-parse --short "$BEFORE")…"
      git reset --hard "$BEFORE" >/dev/null
      ( cd server && npm install --no-audit --no-fund --silent ) || true
      pm2 restart "$PM2_NAME" --update-env >/dev/null || true
      [ "$MIGRATE" = 1 ] && warn "NOTE: database migrations were NOT rolled back. Latest dump: $STATE_DIR/backups/"
    fi
    die "Deploy failed — see the PM2 log above."
  fi
fi

# ---------------------------------------------------------------------------
# 6. Record state
# ---------------------------------------------------------------------------
if [ "$DRY_RUN" = 0 ]; then
  mv -f "$NEW_MANIFEST" "$MANIFEST"
  {
    printf 'deployed_at=%s\n' "$(date -Is)"
    printf 'branch=%s\n' "${BRANCH:-unknown}"
    printf 'commit=%s\n' "${AFTER:-unknown}"
    printf 'migrated=%s\n' "$MIGRATE"
  } > "$STATE_DIR/last-deploy"
else
  rm -f "$NEW_MANIFEST"
fi

printf '\n%s✅ Deploy complete%s — %s @ %s | deps:%s | migrate:%s\n' \
  "$C_GREEN$C_BOLD" "$C_RESET" \
  "${BRANCH:-?}" "$( [ -n "$AFTER" ] && git rev-parse --short "$AFTER" || echo '?' )" \
  "$( [ "$NEED_INSTALL" = 1 ] && echo yes || echo skipped )" \
  "$( [ "$MIGRATE" = 1 ] && echo yes || echo skipped )"
