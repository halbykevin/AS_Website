#!/usr/bin/env bash
# =============================================================================
# asdesk.sh — operate the ASDesk control server from this machine.
#
#   npm run server:setup-ssh      install a deploy key and pin the host key (asks for the password once)
#   npm run server:provision      set up or repair the host: Postgres, secrets, nginx + TLS, coturn,
#                                 systemd service, nightly backups. Idempotent; never rotates secrets.
#   npm run server:deploy         test, build, upload and activate a new release (auto-rollback on
#                                 a failed health check)
#   npm run server:status         release, service, TURN, certificate and backup status
#   npm run server:logs           recent API logs   (-- -f to follow, -- turn for coturn, -- -n 500)
#   npm run server:rollback       re-activate the previous release
#   npm run server:token          print the enrollment token for setting up new computers
#   npm run server:admin -- devices | revoke <id> | restore <id> | sessions [n]
#   npm run server:backup         take a database backup now
#   npm run desktop:publish       publish the newest build of every edition in release/ (Windows,
#                                 Windows 7, macOS) to https://<domain>/downloads/, skipping what the
#                                 server already has. -- --dry-run shows the plan only; -- --windows,
#                                 --win7 or --mac limit it to those; -- --force allows an older version
#                                 or a changed file; -- <installer> publishes exactly that file
#
# Any command takes --host <name> to pick a profile (deploy/.env.vps.<name>).
# =============================================================================

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$DEPLOY_DIR")"
OUT_DIR="$REPO_ROOT/.deploy-out"
cd "$REPO_ROOT"
# shellcheck source=lib.sh
. "$DEPLOY_DIR/lib.sh"

usage() { awk 'NR>2 && /^#/ { if (/^# =+$/) next; sub(/^# ?/, ""); print; next } NR>2 { exit }' "$0"; }

HOST_PROFILE=""
declare -a ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --host|-H) HOST_PROFILE="${2:-}"; shift 2 ;;
    --host=*) HOST_PROFILE="${1#*=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
set -- ${ARGS[@]+"${ARGS[@]}"}
COMMAND="${1:-help}"; [ $# -gt 0 ] && shift
[ "$COMMAND" = help ] && { usage; exit 0; }

load_profile "$HOST_PROFILE"
: "${API_DOMAIN:?API_DOMAIN missing in $PROFILE_FILE}"
: "${APP_PORT:=4700}"
: "${TURN_PORT:=3478}"
: "${TURNS_PORT:=5349}"
: "${TURN_MIN_PORT:=49160}"
: "${TURN_MAX_PORT:=49660}"
REMOTE_BASE=/opt/asdesk

cmd_setup_ssh() {
  command -v ssh-keygen >/dev/null && command -v ssh-keyscan >/dev/null || die "OpenSSH tools (ssh-keygen, ssh-keyscan) are required"
  say "pinning the host key of $VPS_HOST"
  local scan fingerprint expected
  scan="$(ssh-keyscan -T 10 -p "$VPS_PORT" -t ed25519 "$VPS_HOST" 2>/dev/null)" || true
  [ -n "$scan" ] || die "could not read the host key from $VPS_HOST:$VPS_PORT"
  fingerprint="$(printf '%s\n' "$scan" | ssh-keygen -lf - | awk '{print $2}')"
  expected="$(hostkey_digest "${VPS_HOSTKEY:-}")"
  if [ -n "$expected" ]; then
    [ "$fingerprint" = "$expected" ] || die "HOST KEY MISMATCH for $VPS_HOST: got $fingerprint, profile pins $expected. Do not continue until you know why."
    ok "host key matches the pinned fingerprint ($fingerprint)"
  else
    warn "no VPS_HOSTKEY pinned — trusting $fingerprint on first use. Add VPS_HOSTKEY=\"$fingerprint\" to $PROFILE_FILE."
    VPS_HOSTKEY="$fingerprint"
  fi
  printf '%s\n' "$scan" > "$KNOWN_HOSTS"

  if [ ! -f "$SSH_KEY" ]; then
    say "generating deploy key $SSH_KEY"
    mkdir -p "$(dirname "$SSH_KEY")"
    ssh-keygen -q -t ed25519 -N '' -C "asdesk-deploy@$(hostname)" -f "$SSH_KEY"
  fi
  TRANSPORT=openssh-key
  if ssh_run 'echo KEY_OK' 2>/dev/null | grep -q KEY_OK; then ok "key authentication already works"; return; fi

  say "installing the deploy key on $VPS_USER@$VPS_HOST"
  local pub install
  pub="$(tr -d '\r\n' < "$SSH_KEY.pub")"
  install="umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && (grep -qxF '$pub' ~/.ssh/authorized_keys || printf '%s\n' '$pub' >> ~/.ssh/authorized_keys)"
  if [ -z "${VPS_PASSWORD:-}" ] && [ -t 0 ]; then read -rs -p "Password for $VPS_USER@$VPS_HOST (used once, not stored): " VPS_PASSWORD; echo; fi
  if [ -n "${VPS_PASSWORD:-}" ] && find_putty; then
    "$PLINK" -batch -ssh -hostkey "$VPS_HOSTKEY" -P "$VPS_PORT" -l "$VPS_USER" -pw "$VPS_PASSWORD" "$VPS_HOST" "$install" </dev/null || die "password login failed"
  else
    ssh -p "$VPS_PORT" -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no \
      -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$KNOWN_HOSTS" "$VPS_USER@$VPS_HOST" "$install" || die "password login failed"
  fi
  ssh_run 'echo KEY_OK' 2>/dev/null | grep -q KEY_OK || die "the key was installed but key authentication still fails"
  ok "key authentication works — later commands need no password"
}

cmd_provision() {
  select_transport
  upload_remote_kit; trap cleanup_remote_kit EXIT
  say "provisioning $API_DOMAIN on $VPS_HOST"
  ssh_run "bash '$REMOTE_TMP/remote/provision.sh' --domain '$API_DOMAIN' --app-port '$APP_PORT' --turn-port '$TURN_PORT' \
    --turns-port '$TURNS_PORT' --turn-min-port '$TURN_MIN_PORT' --turn-max-port '$TURN_MAX_PORT' ${ACME_EMAIL:+--acme-email '$ACME_EMAIL'} --enrollment '${ENROLLMENT:-token}'" \
    || die "provisioning failed — see the output above; it is safe to re-run"
}

run_local_checks() {
  say "verifying locally"
  local log="$OUT_DIR/verify.log"
  mkdir -p "$OUT_DIR"
  if ! node node_modules/typescript/bin/tsc --noEmit >"$log" 2>&1; then cat "$log" >&2; die "type check failed"; fi
  ok "type check"
  if ! node node_modules/tsx/dist/cli.mjs --test services/control-api/test/*.test.ts >"$log" 2>&1; then tail -n 40 "$log" >&2; die "server tests failed"; fi
  ok "server tests ($(grep -E '^# pass' "$log" | awk '{print $3}') passed)"
}

cmd_deploy() {
  local skip_tests=0
  while [ $# -gt 0 ]; do case "$1" in --skip-tests) skip_tests=1; shift ;; *) die "unknown deploy option: $1" ;; esac; done
  select_transport
  if [ "$skip_tests" = 1 ]; then warn "skipping local checks (--skip-tests)"; else run_local_checks; fi
  say "building the server release"
  local sha id tarball
  sha="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
  id="asdesk-api-$(date -u +%Y%m%d-%H%M%S)-$sha"
  node tools/build-server.mjs "$OUT_DIR/release" >/dev/null || die "build failed"
  tarball="$OUT_DIR/$id.tar.gz"
  tar -czf "$tarball" -C "$OUT_DIR/release" .
  ok "$id ($(du -h "$tarball" | awk '{print $1}'))"
  say "uploading"
  upload_remote_kit; trap cleanup_remote_kit EXIT
  scp_upload "$tarball" "$REMOTE_TMP/$id.tar.gz" || die "upload failed"
  ok "uploaded to $VPS_HOST"
  say "activating"
  ssh_run "bash '$REMOTE_TMP/remote/release.sh' deploy '$REMOTE_TMP/$id.tar.gz'" \
    || die "remote deploy failed — the previous release is still serving (tarball kept at $tarball)"
  rm -f "$tarball"
  say "checking https://$API_DOMAIN from here"
  if curl -fsS --max-time 15 "https://$API_DOMAIN/health" >/dev/null; then ok "public endpoint healthy"
  else warn "the host reports healthy but https://$API_DOMAIN/health is not reachable from this machine"; fi
  printf "\n${C_GREEN}${C_BOLD}✓ deployed %s${C_RESET}\n" "$id"
}

cmd_release_action() {
  select_transport
  upload_remote_kit; trap cleanup_remote_kit EXIT
  ssh_run "bash '$REMOTE_TMP/remote/release.sh' $1"
}

cmd_logs() {
  local unit=asdesk-api lines=200 follow=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -f|--follow) follow=1; shift ;;
      -n) lines="${2:?}"; shift 2 ;;
      turn|coturn) unit=coturn; shift ;;
      api) shift ;;
      *) die "unknown logs option: $1" ;;
    esac
  done
  [[ "$lines" =~ ^[0-9]+$ ]] || die "-n needs a number"
  select_transport
  if [ -n "$follow" ]; then ssh_run_tty "journalctl -u $unit -n $lines -f --no-pager"
  else ssh_run "journalctl -u $unit -n $lines --no-pager"; fi
}

cmd_token() {
  select_transport
  local line
  line="$(ssh_run "grep -m1 '^ENROLLMENT_TOKEN=' $REMOTE_BASE/shared/.env" | tr -d '\r')" || die "no enrollment token — has the host been provisioned?"
  line="${line#ENROLLMENT_TOKEN=}"; line="${line#\'}"; line="${line%\'}"
  printf "Server URL       : https://%s\nEnrollment token : %s\n" "$API_DOMAIN" "$line"
  if [ "${ENROLLMENT:-token}" = open ]; then info "Enrollment is open (ENROLLMENT=open in the profile): installed computers register without the token."
  else info "Enter both in ASDesk on each computer. Keep the token private; it lets a computer join your server."; fi
}

cmd_admin() {
  local arg
  for arg in "$@"; do [[ "$arg" =~ ^[A-Za-z0-9_-]+$ ]] || die "invalid admin argument: $arg"; done
  select_transport
  ssh_run "asdesk-admin $*"
}

cmd_backup() {
  select_transport
  ssh_run "$REMOTE_BASE/bin/asdesk-backup manual"
}

# ── Desktop downloads ──────────────────────────────────────────────────────────────────────────
# Each edition has a stable download name that points at its newest installer: ASDesk-Setup-x64.exe
# (Windows 10/11, plus the pre-rename alias and latest.json), ASDesk-Setup-win7-x64.exe / -x86.exe
# (Windows 7/8, the names the standard installer sends older PCs to) and ASDesk-macOS.dmg (plus
# latest-macos.json). The website reads both pointers. A published file never changes: the website
# shows its checksum, so a different build of a version needs a new version number (or --force).
DESKTOP_EDITIONS="windows win7 mac"
edition_label() { case "$1" in windows) echo "Windows 10/11" ;; win7) echo "Windows 7/8" ;; mac) echo "macOS" ;; esac; }
edition_build_hint() { case "$1" in windows) echo "npm run desktop:package" ;; win7) echo "npm run desktop:package:win7" ;; mac) echo "npm run desktop:package:mac" ;; esac; }
# The installer files of an edition's version, one per line.
edition_files() {
  case "$1" in
    windows) echo "ASDesk-$2-x64-Setup.exe" ;;
    win7) printf '%s\n' "ASDesk-$2-win7-x64-Setup.exe" "ASDesk-$2-win7-x86-Setup.exe" ;;
    mac) echo "ASDesk-$2-macos-universal.dmg" ;;
  esac
}
# The stable download name an installer is published under (Windows 7 first: its names also end in -x64-Setup.exe).
stable_link() {
  case "$1" in
    ASDesk-*-win7-x64-Setup.exe) echo "ASDesk-Setup-win7-x64.exe" ;;
    ASDesk-*-win7-x86-Setup.exe) echo "ASDesk-Setup-win7-x86.exe" ;;
    ASDesk-*-x64-Setup.exe) echo "ASDesk-Setup-x64.exe" ;;
    ASDesk-*-macos-universal.dmg) echo "ASDesk-macOS.dmg" ;;
  esac
}
installer_version() { printf '%s' "$1" | sed -nE 's/^ASDesk-([0-9]+\.[0-9]+\.[0-9]+)-.*$/\1/p'; }
# True when version $1 is newer than $2, compared as numbers (0.10.0 is newer than 0.9.0).
version_newer() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" = "$1" ]; }
sha256_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | awk '{print $1}'; }
size_of() { du -h "$1" | awk '{print $1}'; }
plan_row() { printf "  %-14s %-7s %s\n" "$(edition_label "$1")" "$2" "$3"; }

# The newest version of an edition that has every installer it needs in release/ (Windows 7: both).
newest_build() {
  local pattern v f complete
  case "$1" in
    windows) pattern='ASDesk-([0-9]+\.[0-9]+\.[0-9]+)-x64-Setup\.exe' ;;
    win7) pattern='ASDesk-([0-9]+\.[0-9]+\.[0-9]+)-win7-x(64|86)-Setup\.exe' ;;
    mac) pattern='ASDesk-([0-9]+\.[0-9]+\.[0-9]+)-macos-universal\.dmg' ;;
  esac
  for v in $(ls "$REPO_ROOT/release" 2>/dev/null | sed -nE "s/^$pattern\$/\1/p" | sort -Vru); do
    complete=1
    for f in $(edition_files "$1" "$v"); do [ -s "$REPO_ROOT/release/$f" ] || complete=0; done
    if [ "$complete" = 1 ]; then echo "$v"; return 0; fi
    warn "$(edition_label "$1") $v is incomplete in release/ (needs $(edition_files "$1" "$v" | tr '\n' ' ')); trying older builds"
  done
}

# What the server has, in one round trip: where each stable name points, and the checksum of each
# of the named files that is already there.
REMOTE_DOWNLOADS=""
read_remote_downloads() {
  local names="" name
  for name in "$@"; do names="$names '$name'"; done
  REMOTE_DOWNLOADS="$(ssh_run "cd $REMOTE_BASE/downloads || exit 1; for l in ASDesk-Setup-x64.exe ASDesk-Setup-win7-x64.exe ASDesk-Setup-win7-x86.exe ASDesk-macOS.dmg; do t=\$(readlink \"\$l\") && echo \"link \$l \$t\"; done; for f in$names; do [ -f \"\$f\" ] && echo \"file \$f \$(sha256sum < \"\$f\" | cut -d' ' -f1)\"; done; true" | tr -d '\r')" \
    || die "could not read what the server publishes"
}
remote_link() { printf '%s\n' "$REMOTE_DOWNLOADS" | awk -v k="$1" '$1 == "link" && $2 == k { print $3 }'; }
remote_sum() { printf '%s\n' "$REMOTE_DOWNLOADS" | awk -v k="$1" '$1 == "file" && $2 == k { print $3 }'; }

# Publishes one installer under its stable download name. `present`: the server already has this
# exact file (same checksum), so only the name and pointer move.
publish_installer() {
  local file="$1" present="${2:-}" name sum size link pointer="" facts="" place
  name="$(basename "$file")"
  [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || die "unexpected installer name: $name"
  link="$(stable_link "$name")"
  [ -n "$link" ] || die "not an ASDesk installer name: $name"
  case "$name" in
    ASDesk-*-win7-*) ;;
    ASDesk-*-x64-Setup.exe) pointer="latest.json" ;;
    ASDesk-*-macos-universal.dmg) pointer="latest-macos.json" ;;
  esac
  sum="$(sha256_of "$file")"
  size="$(wc -c < "$file" | tr -d ' ')"
  if [[ "$name" == *.dmg ]]; then
    # Gatekeeper blocks a disk image that is not notarized until the person allows it in System
    # Settings. Notarization cannot be checked from here, so desktop.mjs records it next to the image;
    # the pointer passes it on, so the website shows the Open Anyway step only when it is needed.
    if grep -q '"notarized": true' "$file.json" 2>/dev/null; then
      facts=',"notarized":true'
    else
      facts=',"notarized":false'
      warn "$name is not notarized: macOS will ask people to allow it in System Settings. Build with npm run desktop:release:mac (docs/macos.md)."
    fi
  elif command -v powershell.exe >/dev/null 2>&1; then
    # Browsers (Chrome/Edge Safe Browsing) and SmartScreen block or warn on unsigned installers.
    local signature
    signature="$(powershell.exe -NoProfile -NonInteractive -Command "(Get-AuthenticodeSignature -LiteralPath '$(cygpath -w "$file" 2>/dev/null || echo "$file")').Status" 2>/dev/null | tr -d '\r')"
    [ "$signature" = "Valid" ] || warn "$name is not code-signed ($signature): browsers may block it as a suspicious download. Build with npm run desktop:release."
  fi
  if [ -n "$present" ]; then
    say "publishing $name (already on the server)"
    place="echo '$sum  $name' | sha256sum -c --quiet -"
  else
    say "publishing $name ($(size_of "$file"))"
    scp_upload "$file" "$REMOTE_BASE/downloads/.$name.part" || die "upload failed"
    place="echo '$sum  .$name.part' | sha256sum -c --quiet - && mv -f '.$name.part' '$name'"
  fi
  local extra=""
  if [ "$link" = "ASDesk-Setup-x64.exe" ]; then
    extra="&& ln -sfn '$name' CompanyRemote-Setup-x64.exe"
  fi
  if [ -n "$pointer" ]; then
    extra="$extra && printf '{\"file\":\"%s\",\"sha256\":\"%s\",\"size\":%s,\"published\":\"%s\"%s}\n' '$name' '$sum' '$size' \"\$(date -u +%FT%TZ)\" '$facts' > '.$pointer.part' && mv -f '.$pointer.part' '$pointer'"
  fi
  ssh_run "cd $REMOTE_BASE/downloads && $place && chmod 644 '$name' && ln -sfn '$name' '$link' $extra" \
    || die "publishing $name failed (checksum or move)"
  ok "https://$API_DOMAIN/downloads/$link"
  info "sha256 $sum"
}

# npm run desktop:publish [-- --dry-run] [--force] [--windows] [--win7] [--mac] [<installer>...]
# Publishes the newest complete build of each edition in release/ (or of the editions named), and
# only what the server does not already have. It never moves a download back to an older version,
# nor replaces a published file with a different build of the same version, unless --force says so.
cmd_publish_desktop() {
  local dry_run=0 force=0 only="" arg
  local -a files=()
  for arg in "$@"; do
    case "$arg" in
      --dry-run|-n) dry_run=1 ;;
      --force) force=1 ;;
      --windows) only="$only windows" ;;
      --win7) only="$only win7" ;;
      --mac) only="$only mac" ;;
      -*) die "unknown option: $arg (use --dry-run, --force, --windows, --win7, --mac or an installer's path)" ;;
      *) files+=("$arg") ;;
    esac
  done

  # Installers named on the command line: exactly those.
  if [ "${#files[@]}" -gt 0 ]; then
    for arg in "${files[@]}"; do [ -s "$arg" ] || die "no such installer: $arg"; done
    if [ "$dry_run" = 1 ]; then info "would publish: ${files[*]}"; return 0; fi
    select_transport
    for arg in "${files[@]}"; do publish_installer "$arg"; done
    return 0
  fi

  local editions="${only:-$DESKTOP_EDITIONS}" e v found="" candidates=""
  for e in $editions; do
    v="$(newest_build "$e")"
    if [ -n "$v" ]; then found="$found $e:$v"; candidates="$candidates $(edition_files "$e" "$v" | tr '\n' ' ')"; fi
  done
  [ -n "$found" ] || die "no installers in release/. Build one with: npm run desktop:package (or :win7, :mac)"
  select_transport
  # shellcheck disable=SC2086
  read_remote_downloads $candidates

  say "plan for https://$API_DOMAIN/downloads/"
  local -a todo=() mine=()
  local entry published f sum rsum steps conflict skipped=""
  for e in $editions; do
    v=""
    for entry in $found; do if [ "${entry%%:*}" = "$e" ]; then v="${entry#*:}"; fi; done
    if [ -z "$v" ]; then plan_row "$e" "-" "no build in release/ ($(edition_build_hint "$e"))"; continue; fi
    published="$(installer_version "$(remote_link "$(stable_link "$(edition_files "$e" "$v" | head -1)")")")"
    if [ -n "$published" ] && version_newer "$published" "$v" && [ "$force" != 1 ]; then
      plan_row "$e" "$v" "skip: the server has $published, which is newer (--force publishes $v anyway)"
      skipped=1
      continue
    fi
    mine=(); steps=""; conflict=""
    for f in $(edition_files "$e" "$v"); do
      sum="$(sha256_of "$REPO_ROOT/release/$f")"
      rsum="$(remote_sum "$f")"
      if [ -n "$rsum" ] && [ "$rsum" != "$sum" ]; then conflict="$f"; fi
      if [ "$rsum" = "$sum" ]; then
        # On the server already: up to date if its download name points here, else only relink.
        if [ "$(remote_link "$(stable_link "$f")")" != "$f" ]; then mine+=("$f|present"); steps="$steps, point $(stable_link "$f") at it"; fi
      else
        mine+=("$f|"); steps="$steps, upload $f ($(size_of "$REPO_ROOT/release/$f"))"
      fi
    done
    if [ -n "$conflict" ] && [ "$force" != 1 ]; then
      plan_row "$e" "$v" "skip: $conflict on the server is a different build. Published files never change: raise the version in apps/desktop/package.json (or --force)"
      skipped=1
      continue
    fi
    if [ "${#mine[@]}" -eq 0 ]; then plan_row "$e" "$v" "up to date"; continue; fi
    if [ -n "$published" ] && [ "$published" != "$v" ]; then steps="$steps, replacing $published"; fi
    plan_row "$e" "$v" "${steps#, }"
    todo+=("${mine[@]}")
  done

  if [ "${#todo[@]}" -eq 0 ]; then
    if [ -n "$skipped" ]; then warn "nothing published (see the skipped editions above)"; else ok "nothing to publish: the server is up to date"; fi
    return 0
  fi
  if [ "$dry_run" = 1 ]; then info "dry run: nothing was changed"; return 0; fi
  local item legacy="" live=""
  for item in "${todo[@]}"; do
    publish_installer "$REPO_ROOT/release/${item%%|*}" "${item#*|}"
    case "$item" in *-win7-*) legacy=1 ;; *) live=1 ;; esac
  done
  ok "published ${#todo[@]} file(s)"
  # The website follows latest.json and latest-macos.json by itself; Windows 7 comes from releases.json.
  if [ -n "$live" ]; then info "the website offers the new Windows and Mac downloads right away"; fi
  if [ -n "$legacy" ]; then info "to list the Windows 7 installers on the website: npm run website:publish -- --version <v>"; fi
}

case "$COMMAND" in
  setup-ssh) cmd_setup_ssh ;;
  provision) cmd_provision ;;
  deploy) cmd_deploy "$@" ;;
  status) cmd_release_action status ;;
  rollback) cmd_release_action rollback ;;
  logs) cmd_logs "$@" ;;
  token) cmd_token ;;
  admin) cmd_admin "$@" ;;
  backup) cmd_backup ;;
  publish-desktop) cmd_publish_desktop "$@" ;;
  *) usage; die "unknown command: $COMMAND" ;;
esac
