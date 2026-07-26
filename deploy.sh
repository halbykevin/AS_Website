#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# AS Company — API deploy. THIS SCRIPT RUNS ON THE VPS.
#
#   Deploys both Node APIs that live in this repo from a single git clone:
#
#     site   AS Company website API   server/            pm2 as-api        :8080
#     store  AS Store API             as_store/server/   pm2 as-store-api  :8081
#
#   Pulls once, then for EACH app independently: installs dependencies only
#   when its manifests changed, migrates only when its schema changed (taking
#   a pg_dump first), restarts PM2, and health-checks it. An app whose files
#   did not change is left running untouched — no needless downtime.
#
# Usage (on the VPS):
#     bash /opt/as-company/deploy.sh [options]
#
# From Windows/macOS, do not run this directly — run `npm run deploy`, which
# drives deploy.ps1 (Windows) or this script over SSH.
#
# Options:
#   -a, --app <name>      site | store | all       (default: all)
#   -b, --branch <name>   Branch to deploy         (default: current branch)
#       --force-migrate   Migrate even if the schema is unchanged
#       --skip-migrate    Never migrate this deploy
#       --force-restart   Restart every selected app, changed or not
#       --no-pull         Deploy the code already on disk (no git fetch/merge)
#       --allow-dirty     Continue even if the VPS working tree is dirty
#       --no-backup       Skip the pre-migration pg_dump
#       --no-rollback     Do not auto-revert the code if a health check fails
#   -n, --dry-run         Show what would happen, change nothing
#   -h, --help            This help
#
# Env overrides: PM2_NAME_SITE (as-api), PM2_NAME_STORE (as-store-api),
#                HEALTH_TIMEOUT (60s), GIT_REMOTE (origin), KEEP_BACKUPS (5)
#
# Neither frontend is built here — Vercel rebuilds both on push.
# ---------------------------------------------------------------------------
set -Eeuo pipefail

GIT_REMOTE="${GIT_REMOTE:-origin}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"

APPS_SELECTED=""
BRANCH=""
DO_PULL=1
FORCE_MIGRATE=0
SKIP_MIGRATE=0
FORCE_RESTART=0
ALLOW_DIRTY=0
DO_BACKUP=1
DO_ROLLBACK=1
DRY_RUN=0

# ---------------------------------------------------------------------------
# The app registry. Adding a third API means adding one line to each function.
# ---------------------------------------------------------------------------
ALL_APPS="site store"

app_label() { case "$1" in
  site)  echo "AS Company website API" ;;
  store) echo "AS Store API" ;;
esac }

app_dir() { case "$1" in
  site)  echo "server" ;;
  store) echo "as_store/server" ;;
esac }

app_pm2() { case "$1" in
  site)  echo "${PM2_NAME_SITE:-as-api}" ;;
  store) echo "${PM2_NAME_STORE:-as-store-api}" ;;
esac }

# Every path whose DDL belongs to this app. The store keeps its schema in
# as_store/db/*.sql (migrate.js reads ../../db), OUTSIDE its server folder —
# so it must be fingerprinted too, or schema edits would deploy unmigrated.
app_schema_paths() { case "$1" in
  site)  echo "./server" ;;
  store) echo "./as_store/server ./as_store/db" ;;
esac }

# Paths that mean "this app changed" for restart purposes.
app_watch_paths() { case "$1" in
  site)  echo "server/" ;;
  store) echo "as_store/server/ as_store/db/" ;;
esac }

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  C_RESET=$(tput sgr0); C_DIM=$(tput dim); C_BOLD=$(tput bold)
  C_RED=$(tput setaf 1); C_GREEN=$(tput setaf 2); C_YELLOW=$(tput setaf 3); C_BLUE=$(tput setaf 4)
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""
fi

banner() { printf '\n%s══ %s %s\n' "$C_BOLD$C_BLUE" "$*" "$C_RESET"; }
step()   { printf '\n%s▶ %s%s\n' "$C_BOLD" "$*" "$C_RESET"; }
info()   { printf '  %s\n' "$*"; }
dim()    { printf '  %s%s%s\n' "$C_DIM" "$*" "$C_RESET"; }
warn()   { printf '%s! %s%s\n' "$C_YELLOW" "$*" "$C_RESET" >&2; }
ok()     { printf '%s✓ %s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
die()    { printf '\n%s✗ %s%s\n' "$C_RED$C_BOLD" "$*" "$C_RESET" >&2; exit 1; }

trap 'printf "\n%s✗ Deploy aborted at line %s.%s\n" "$C_RED$C_BOLD" "$LINENO" "$C_RESET" >&2' ERR

# Print the header comment block (line 2 up to the first non-comment line).
usage() { awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "$0"; exit 0; }

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    -a|--app)        APPS_SELECTED="${2:-}"; [ -n "$APPS_SELECTED" ] || die "--app needs a value"; shift 2 ;;
    --app=*)         APPS_SELECTED="${1#*=}"; shift ;;
    -b|--branch)     BRANCH="${2:-}"; [ -n "$BRANCH" ] || die "--branch needs a value"; shift 2 ;;
    --branch=*)      BRANCH="${1#*=}"; shift ;;
    --force-migrate) FORCE_MIGRATE=1; shift ;;
    --skip-migrate)  SKIP_MIGRATE=1; shift ;;
    --force-restart) FORCE_RESTART=1; shift ;;
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

case "${APPS_SELECTED:-all}" in
  all|"") APPS="$ALL_APPS" ;;
  *)      APPS=$(printf '%s' "$APPS_SELECTED" | tr ',' ' ') ;;
esac
for a in $APPS; do
  case " $ALL_APPS " in *" $a "*) ;; *) die "Unknown app '$a'. Valid: $ALL_APPS, or all." ;; esac
done

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
    case ":$PATH:" in
      *":$extra:"*) ;;
      *) if [ -d "$extra" ]; then PATH="$PATH:$extra"; fi ;;
    esac
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

# Read a key out of an app's .env without sourcing it (values may contain spaces).
env_value() {
  local file="$1" key="$2" line
  [ -f "$file" ] || return 0
  line=$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" | tail -n 1 || true)
  [ -n "$line" ] || return 0
  line="${line#*=}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

printf '%s\n' "${C_BOLD}AS Company — API deploy${C_RESET}"
dim "repo: $ROOT"
dim "apps: $(echo $APPS | tr ' ' ',')"
[ "$DRY_RUN" = 1 ] && warn "DRY RUN — nothing will be changed."

# ---------------------------------------------------------------------------
# Preflight — every selected app must actually be deployable BEFORE we touch
# anything, so a half-configured store can't take the website down with it.
# ---------------------------------------------------------------------------
step "Preflight"
for app in $APPS; do
  dir=$(app_dir "$app")
  [ -f "$ROOT/$dir/package.json" ] || die "$(app_label "$app"): $dir/package.json is missing."
  if [ ! -f "$ROOT/$dir/.env" ]; then
    warn "$(app_label "$app"): $dir/.env is missing."
    if [ "$app" = "store" ]; then
      info "The store used to run from a hand-copied /opt/as-store-api. To move it into"
      info "this clone (one time only, on the VPS):"
      info "    cp /opt/as-store-api/.env $ROOT/$dir/.env"
      info "    pm2 delete as-store-api"
      info "    cd $ROOT/$dir && pm2 start src/index.js --name as-store-api && pm2 save"
      info "Keep UPLOAD_DIR=/opt/as-store-api/uploads in that .env so the images stay put."
    fi
    die "Refusing to deploy $(app_label "$app") without its .env."
  fi
  dim "$(app_label "$app") — $dir (pm2: $(app_pm2 "$app"))"
done
[ "$HAVE_PM2" = 1 ] || warn "pm2 is not on PATH — install it with: sudo npm i -g pm2"

# ---------------------------------------------------------------------------
# Sync the code — ONCE, for both apps
# ---------------------------------------------------------------------------
BEFORE=""; AFTER=""; CHANGED=""; CURRENT=""
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
  if [ "$DRY_RUN" = 1 ]; then
    dim "[dry-run] git fetch --prune $GIT_REMOTE && git merge --ff-only $GIT_REMOTE/$BRANCH"
  else
    git fetch --prune "$GIT_REMOTE"
    git rev-parse --verify --quiet "refs/remotes/$GIT_REMOTE/$BRANCH" >/dev/null \
      || die "$GIT_REMOTE/$BRANCH does not exist. Push the branch first."
    if [ "$CURRENT" != "$BRANCH" ]; then
      info "switching $CURRENT → $BRANCH"
      git checkout "$BRANCH"
    fi
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
# Per-app deploy
# ---------------------------------------------------------------------------
RESTARTED_APPS=""
SUMMARY=""

rollback_all() {
  [ "$DO_ROLLBACK" = 1 ] || return 0
  [ -n "$BEFORE" ] && [ -n "$AFTER" ] && [ "$BEFORE" != "$AFTER" ] || return 0
  warn "Rolling the CODE back to $(git rev-parse --short "$BEFORE")…"
  git reset --hard "$BEFORE" >/dev/null
  for a in $RESTARTED_APPS; do
    d=$(app_dir "$a")
    ( cd "$ROOT/$d" && npm install --no-audit --no-fund --silent ) || true
    pm2 restart "$(app_pm2 "$a")" --update-env >/dev/null 2>&1 || true
    warn "reverted $(app_label "$a")"
  done
}

deploy_app() {
  local app="$1"
  local dir pm2name label envfile
  dir=$(app_dir "$app"); pm2name=$(app_pm2 "$app"); label=$(app_label "$app")
  envfile="$ROOT/$dir/.env"

  banner "$label  ($dir)"

  # --- which of this app's files moved in the pull ---------------------------
  local app_changed=0 watch
  for watch in $(app_watch_paths "$app"); do
    if printf '%s\n' "$CHANGED" | grep -q "^${watch}"; then app_changed=1; fi
  done

  # --- dependencies ----------------------------------------------------------
  step "Dependencies"
  local need_install=0
  if [ ! -d "$ROOT/$dir/node_modules" ]; then
    need_install=1; info "node_modules missing → full install"
  elif printf '%s\n' "$CHANGED" | grep -qE "^${dir}/package(-lock)?\.json$"; then
    need_install=1; info "package.json / package-lock.json changed → install"
  fi

  if [ "$need_install" = 1 ]; then
    if [ "$DRY_RUN" = 1 ]; then
      dim "[dry-run] npm ci in $dir"
    elif [ -f "$ROOT/$dir/package-lock.json" ]; then
      ( cd "$ROOT/$dir" && { npm ci --no-audit --no-fund || { warn "npm ci failed — falling back to npm install"; npm install --no-audit --no-fund; }; } )
    else
      ( cd "$ROOT/$dir" && npm install --no-audit --no-fund )
    fi
    ok "dependencies installed"
  else
    dim "unchanged — skipped"
  fi

  # --- schema ----------------------------------------------------------------
  # Neither app has a migration-file runner: the website's src/migrate.js is one
  # idempotent DDL blob, the store's replays as_store/db/*.sql. So fingerprint
  # every schema-bearing file the app owns and compare with the last deploy.
  step "Database schema"
  local manifest="$STATE_DIR/schema-$app.manifest"
  local new_manifest="$STATE_DIR/schema-$app.manifest.new"
  local ddl_re='(CREATE|ALTER|DROP)[[:space:]]+(TABLE|INDEX|SEQUENCE|TYPE|VIEW|SCHEMA|MATERIALIZED)|ADD[[:space:]]+COLUMN|DROP[[:space:]]+COLUMN'

  : > "$new_manifest"
  while IFS= read -r -d '' f; do
    # Seed data is not schema — neither app's migrate applies it, and it is run
    # by hand via `npm run seed`. Editing it must not trigger a migration.
    case "$(basename "$f")" in seed.sql|seed-*.sql|*.seed.sql) continue ;; esac
    if [ "${f##*.}" = "sql" ] || grep -qiE "$ddl_re" "$f" 2>/dev/null; then
      printf '%s  %s\n' "$(sha256 "$f")" "${f#./}" >> "$new_manifest"
    fi
  done < <(
    find $(app_schema_paths "$app") \
      \( -name node_modules -o -name uploads -o -name scrapes -o -name .git \) -prune -o \
      -type f \( -name '*.sql' -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.ts' \) \
      -print0 2>/dev/null | sort -z
  )

  info "$(wc -l < "$new_manifest" | tr -d ' ') schema-bearing file(s) in $(app_schema_paths "$app" | tr '\n' ' ')"

  local migrate=0 why=""
  if [ "$SKIP_MIGRATE" = 1 ]; then
    why="--skip-migrate"
  elif [ "$FORCE_MIGRATE" = 1 ]; then
    migrate=1; why="--force-migrate"
  elif [ ! -f "$manifest" ]; then
    migrate=1; why="no record of a previous deploy"
  elif ! cmp -s "$manifest" "$new_manifest"; then
    migrate=1; why="schema changed"
  else
    why="unchanged since last deploy"
  fi

  if [ "$migrate" = 1 ]; then
    info "migration needed ($why)"
    if [ -f "$manifest" ] && [ "$why" = "schema changed" ]; then
      join -j 2 <(sort -k2 "$manifest") <(sort -k2 "$new_manifest") 2>/dev/null \
        | awk '$2 != $3 { print "    changed: " $1 }' || true
      comm -13 <(awk '{print $2}' "$manifest" | sort) <(awk '{print $2}' "$new_manifest" | sort) \
        | sed 's/^/    added:   /' || true
      comm -23 <(awk '{print $2}' "$manifest" | sort) <(awk '{print $2}' "$new_manifest" | sort) \
        | sed 's/^/    removed: /' || true
    fi

    local db_url; db_url=$(env_value "$envfile" DATABASE_URL)
    if [ "$DO_BACKUP" = 1 ] && [ -n "$db_url" ] && command -v pg_dump >/dev/null 2>&1; then
      local dump="$STATE_DIR/backups/$app-$(date +%Y%m%d-%H%M%S).dump"
      if [ "$DRY_RUN" = 1 ]; then
        dim "[dry-run] pg_dump → $dump"
      elif pg_dump "$db_url" --no-owner --no-acl --format=custom --file="$dump" 2>/dev/null; then
        ok "backup: $dump ($(du -h "$dump" | cut -f1))"
        ls -1t "$STATE_DIR"/backups/$app-*.dump 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
      else
        rm -f "$dump"
        warn "pg_dump failed — continuing WITHOUT a backup for $label."
      fi
    elif [ "$DO_BACKUP" = 1 ]; then
      warn "no pg_dump / DATABASE_URL — continuing without a backup"
    fi

    if [ "$DRY_RUN" = 1 ]; then
      dim "[dry-run] npm run migrate in $dir"
    else
      ( cd "$ROOT/$dir" && npm run migrate ) || {
        rollback_all
        die "$label: migration failed. Deploy stopped."
      }
    fi
    ok "schema up to date"
  else
    dim "skipped ($why)"
  fi

  # --- restart ---------------------------------------------------------------
  step "Restart (pm2: $pm2name)"
  local running=0
  if [ "$HAVE_PM2" = 1 ] && pm2 describe "$pm2name" >/dev/null 2>&1; then running=1; fi

  local need_restart=0
  if [ "$FORCE_RESTART" = 1 ]; then need_restart=1
  elif [ "$running" = 0 ]; then need_restart=1
  elif [ "$app_changed" = 1 ] || [ "$need_install" = 1 ] || [ "$migrate" = 1 ]; then need_restart=1
  fi

  if [ "$need_restart" = 0 ]; then
    dim "nothing changed for this app — left running untouched"
    SUMMARY="$SUMMARY\n  $label: no changes"
    if [ "$DRY_RUN" = 0 ]; then mv -f "$new_manifest" "$manifest"; else rm -f "$new_manifest"; fi
    return 0
  fi

  if [ "$HAVE_PM2" = 0 ]; then
    [ "$DRY_RUN" = 1 ] || die "Cannot restart $label without pm2."
    dim "[dry-run] pm2 restart $pm2name"
  elif [ "$DRY_RUN" = 1 ]; then
    dim "[dry-run] pm2 restart $pm2name --update-env"
  elif [ "$running" = 1 ]; then
    pm2 restart "$pm2name" --update-env >/dev/null
    RESTARTED_APPS="$RESTARTED_APPS $app"
    ok "restarted"
  else
    info "no PM2 process named '$pm2name' — starting it"
    ( cd "$ROOT/$dir" && pm2 start src/index.js --name "$pm2name" >/dev/null )
    pm2 save >/dev/null
    RESTARTED_APPS="$RESTARTED_APPS $app"
    ok "started and saved to the PM2 boot list"
  fi

  # --- health ----------------------------------------------------------------
  local port health
  port=$(env_value "$envfile" PORT); port="${port:-8080}"
  health="http://127.0.0.1:$port/api/health"

  if [ "$DRY_RUN" = 1 ]; then
    dim "[dry-run] health check $health"
    rm -f "$new_manifest"
    SUMMARY="$SUMMARY\n  $label: (dry run)"
    return 0
  fi

  step "Health check — $health"
  local healthy=0 i
  for i in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -fsS --max-time 3 "$health" >/dev/null 2>&1; then healthy=1; break; fi
    sleep 1
  done

  if [ "$healthy" = 0 ]; then
    warn "$label did not respond within ${HEALTH_TIMEOUT}s"
    pm2 logs "$pm2name" --lines 40 --nostream 2>/dev/null || true
    rollback_all
    [ "$migrate" = 1 ] && warn "NOTE: migrations were NOT rolled back. Dumps: $STATE_DIR/backups/"
    die "$label failed its health check — see the PM2 log above."
  fi
  ok "responding on :$port"

  mv -f "$new_manifest" "$manifest"
  {
    printf 'deployed_at=%s\n' "$(date -Is)"
    printf 'branch=%s\n' "${BRANCH:-unknown}"
    printf 'commit=%s\n' "${AFTER:-unknown}"
    printf 'migrated=%s\n' "$migrate"
  } > "$STATE_DIR/last-deploy-$app"

  SUMMARY="$SUMMARY\n  $label: deps:$( [ "$need_install" = 1 ] && echo yes || echo skipped ) migrate:$( [ "$migrate" = 1 ] && echo yes || echo skipped ) restarted:yes"
}

for app in $APPS; do
  deploy_app "$app"
done

printf '\n%s✅ Deploy complete%s — %s @ %s%b\n' \
  "$C_GREEN$C_BOLD" "$C_RESET" \
  "${BRANCH:-?}" "$( [ -n "$AFTER" ] && git rev-parse --short "$AFTER" || echo '?' )" \
  "$SUMMARY"
