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
#   npm run desktop:publish       upload the newest installer to https://<domain>/downloads/
#                                 (-- --win7 for the Windows 7 edition's x64 and x86 installers,
#                                  -- --mac for the macOS disk image)
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

# Uploads one installer and points its stable download name at it. The standard edition is
# ASDesk-Setup-x64.exe (plus the pre-rename alias and latest.json); the Windows 7 edition is
# ASDesk-Setup-win7-x64.exe / -x86.exe, the names the standard installer sends older PCs to; the macOS
# edition is ASDesk-macOS.dmg (plus latest-macos.json). The website reads both pointers.
publish_installer() {
  local file="$1" name sum size link pointer="" facts=""
  name="$(basename "$file")"
  [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || die "unexpected installer name: $name"
  case "$name" in
    ASDesk-*-win7-x64-Setup.exe) link="ASDesk-Setup-win7-x64.exe" ;;
    ASDesk-*-win7-x86-Setup.exe) link="ASDesk-Setup-win7-x86.exe" ;;
    ASDesk-*-x64-Setup.exe) link="ASDesk-Setup-x64.exe"; pointer="latest.json" ;;
    ASDesk-*-macos-universal.dmg) link="ASDesk-macOS.dmg"; pointer="latest-macos.json" ;;
    *) die "not an ASDesk installer name: $name" ;;
  esac
  sum="$(sha256sum "$file" | awk '{print $1}')"
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
  say "publishing $name ($(du -h "$file" | awk '{print $1}'))"
  scp_upload "$file" "$REMOTE_BASE/downloads/.$name.part" || die "upload failed"
  local extra=""
  if [ "$link" = "ASDesk-Setup-x64.exe" ]; then
    extra="&& ln -sfn '$name' CompanyRemote-Setup-x64.exe"
  fi
  if [ -n "$pointer" ]; then
    extra="$extra && printf '{\"file\":\"%s\",\"sha256\":\"%s\",\"size\":%s,\"published\":\"%s\"%s}\n' '$name' '$sum' '$size' \"\$(date -u +%FT%TZ)\" '$facts' > '.$pointer.part' && mv -f '.$pointer.part' '$pointer'"
  fi
  ssh_run "cd $REMOTE_BASE/downloads && echo '$sum  .$name.part' | sha256sum -c --quiet - && mv -f '.$name.part' '$name' && chmod 644 '$name' && ln -sfn '$name' '$link' $extra" \
    || die "publishing failed (checksum or move)"
  ok "https://$API_DOMAIN/downloads/$link"
  info "sha256 $sum"
}

cmd_publish_desktop() {
  local -a files=()
  if [ "${1:-}" = "--win7" ]; then
    # Both architectures of the newest Windows 7 build, which must be the same version.
    local x64 version
    x64="$(ls -t "$REPO_ROOT"/release/ASDesk-*-win7-x64-Setup.exe 2>/dev/null | head -1 || true)"
    [ -n "$x64" ] || die "no Windows 7 installer found. Build them with: npm run desktop:package:win7"
    version="$(basename "$x64" | sed -E 's/^ASDesk-(.+)-win7-x64-Setup\.exe$/\1/')"
    files=("$x64" "$REPO_ROOT/release/ASDesk-$version-win7-x86-Setup.exe")
    [ -f "${files[1]}" ] || die "missing ${files[1]##*/}; build both with: npm run desktop:package:win7"
  elif [ "${1:-}" = "--mac" ]; then
    # Built on a Mac, or downloaded from the "ASDesk macOS" workflow into release/ (docs/macos.md).
    files=("$(ls -t "$REPO_ROOT"/release/ASDesk-*-macos-universal.dmg 2>/dev/null | head -1 || true)")
    [ -n "${files[0]}" ] || die "no macOS disk image in release/. Build it on a Mac (npm run desktop:package:mac) or download it from the \"ASDesk macOS\" GitHub workflow into release/"
  elif [ -n "${1:-}" ]; then
    files=("$1")
  else
    files=("$(ls -t "$REPO_ROOT"/release/ASDesk-*-x64-Setup.exe 2>/dev/null | grep -v -- '-win7-' | head -1 || true)")
  fi
  [ -n "${files[0]}" ] && [ -f "${files[0]}" ] || die "no installer found. Build one with: npm run desktop:package"
  select_transport
  local file
  for file in "${files[@]}"; do publish_installer "$file"; done
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
