#!/usr/bin/env bash
# =============================================================================
# lib.sh — sourced by asdesk.sh. Logging, host profiles and the SSH transport.
#
# A host profile is an env file next to this script:
#   .env.vps          -> profile "default"
#   .env.vps.<name>   -> profile "<name>"      (.env.vps.example is the template)
# Selection: --host <name>, else $VPS_PROFILE, else the only profile, else a picker.
#
# Transport, in order of preference:
#   openssh-key  ssh/scp with $SSH_KEY and the pinned host key in .known_hosts.<profile>
#                (set up once with `npm run server:setup-ssh`)
#   putty        plink/pscp with VPS_PASSWORD from the environment, host key pinned
#                from VPS_HOSTKEY. Used only until key auth is installed.
# =============================================================================

if [ -t 1 ]; then
  C_RESET='\033[0m'; C_BOLD='\033[1m'; C_DIM='\033[2m'
  C_CYAN='\033[0;36m'; C_GREEN='\033[0;32m'; C_RED='\033[0;31m'; C_YELLOW='\033[1;33m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_CYAN=''; C_GREEN=''; C_RED=''; C_YELLOW=''
fi
say()  { printf "${C_BOLD}${C_CYAN}▸${C_RESET} %s\n" "$*"; }
info() { printf "${C_DIM}  %s${C_RESET}\n" "$*"; }
ok()   { printf "${C_GREEN}  ✓${C_RESET} %s\n" "$*"; }
warn() { printf "${C_YELLOW}  ! %s${C_RESET}\n" "$*" >&2; }
die()  { printf "${C_RED}${C_BOLD}✗${C_RESET} %s\n" "$*" >&2; exit 1; }

profile_label() {
  grep -E '^[[:space:]]*VPS_PROFILE_LABEL=' "$1" 2>/dev/null | head -1 | cut -d= -f2- \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

discover_profiles() {
  local f name
  [ -f "$DEPLOY_DIR/.env.vps" ] && printf 'default\t%s\n' "$DEPLOY_DIR/.env.vps"
  for f in "$DEPLOY_DIR"/.env.vps.*; do
    [ -f "$f" ] || continue
    case "$f" in *.example) continue ;; esac
    name="${f##*/}"; name="${name#.env.vps.}"
    printf '%s\t%s\n' "$name" "$f"
  done
}

load_profile() {
  local want="${1:-${VPS_PROFILE:-}}" n f i sel
  local -a names=() files=()
  while IFS=$'\t' read -r n f; do [ -n "$n" ] && { names+=("$n"); files+=("$f"); }; done < <(discover_profiles)
  [ "${#names[@]}" -gt 0 ] || die "no host profile. Copy deploy/.env.vps.example to deploy/.env.vps and fill it in."
  PROFILE_FILE=""
  if [ -z "$want" ] && [ "${#names[@]}" -eq 1 ]; then want="${names[0]}"; fi
  if [ -z "$want" ]; then
    printf "${C_BOLD}Select host:${C_RESET}\n" >&2
    for i in "${!names[@]}"; do printf "  ${C_BOLD}[%d]${C_RESET} %-10s ${C_DIM}%s${C_RESET}\n" "$((i + 1))" "${names[$i]}" "$(profile_label "${files[$i]}")" >&2; done
    read -r -p "Host [number or name]: " sel
    if [[ "$sel" =~ ^[0-9]+$ ]] && [ "$sel" -ge 1 ] && [ "$sel" -le "${#names[@]}" ]; then want="${names[$((sel - 1))]}"; else want="$sel"; fi
  fi
  for i in "${!names[@]}"; do [ "${names[$i]}" = "$want" ] && { PROFILE="$want"; PROFILE_FILE="${files[$i]}"; }; done
  [ -n "$PROFILE_FILE" ] || die "unknown host profile '$want' (available: ${names[*]})"
  local keep_password="${VPS_PASSWORD:-}"
  set -a
  # shellcheck disable=SC1090
  . "$PROFILE_FILE"
  set +a
  # A password exported for a one-off bootstrap wins over (and should replace) one stored in a file.
  [ -n "$keep_password" ] && VPS_PASSWORD="$keep_password"
  : "${VPS_HOST:?VPS_HOST missing in $PROFILE_FILE}"
  : "${VPS_USER:=root}"
  : "${VPS_PORT:=22}"
  : "${SSH_KEY:=$HOME/.ssh/asdesk_deploy}"
  SSH_KEY="$(eval echo "$SSH_KEY")"
  KNOWN_HOSTS="$DEPLOY_DIR/.known_hosts.$PROFILE"
  info "host profile: $PROFILE ($VPS_USER@$VPS_HOST)"
}

find_putty() {
  PLINK=""; PSCP=""
  local dir
  if command -v plink >/dev/null 2>&1 && command -v pscp >/dev/null 2>&1; then PLINK="$(command -v plink)"; PSCP="$(command -v pscp)"; return 0; fi
  for dir in "/c/Program Files/PuTTY" "/c/Program Files (x86)/PuTTY" "${LOCALAPPDATA:-}/Programs/PuTTY"; do
    if [ -f "$dir/plink.exe" ] && [ -f "$dir/pscp.exe" ]; then PLINK="$dir/plink.exe"; PSCP="$dir/pscp.exe"; return 0; fi
  done
  return 1
}

# PuTTY's pinned format is "ssh-ed25519 255 SHA256:..."; OpenSSH prints "SHA256:...". Compare the digest.
hostkey_digest() { printf '%s' "$1" | grep -oE 'SHA256:[A-Za-z0-9+/=]+' | head -1; }

select_transport() {
  TRANSPORT=""
  if [ -f "$SSH_KEY" ] && [ -s "$KNOWN_HOSTS" ] && command -v ssh >/dev/null 2>&1; then
    TRANSPORT=openssh-key
  elif [ -n "${VPS_PASSWORD:-}" ] && find_putty; then
    [ -n "${VPS_HOSTKEY:-}" ] || die "VPS_HOSTKEY must be pinned in $PROFILE_FILE before password login"
    TRANSPORT=putty
  else
    die "no SSH access configured. Run: npm run server:setup-ssh   (installs a deploy key; asks for the root password once)"
  fi
  info "transport   : $TRANSPORT"
}

SSH_OPTS=()
ssh_opts() {
  SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes
    -o "UserKnownHostsFile=$KNOWN_HOSTS" -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
}

# ssh_run <command>          — runs a remote command, no TTY
# ssh_run_tty <command>      — same, with a TTY (for `logs -f`)
ssh_run() {
  case "$TRANSPORT" in
    openssh-key) ssh_opts; ssh "${SSH_OPTS[@]}" -p "$VPS_PORT" -n "$VPS_USER@$VPS_HOST" "$1" ;;
    putty) "$PLINK" -batch -ssh -hostkey "$VPS_HOSTKEY" -P "$VPS_PORT" -l "$VPS_USER" -pw "$VPS_PASSWORD" "$VPS_HOST" "$1" </dev/null ;;
  esac
}
ssh_run_tty() {
  case "$TRANSPORT" in
    openssh-key) ssh_opts; ssh "${SSH_OPTS[@]}" -p "$VPS_PORT" -tt "$VPS_USER@$VPS_HOST" "$1" ;;
    putty) "$PLINK" -batch -ssh -t -hostkey "$VPS_HOSTKEY" -P "$VPS_PORT" -l "$VPS_USER" -pw "$VPS_PASSWORD" "$VPS_HOST" "$1" ;;
  esac
}
scp_upload() {
  case "$TRANSPORT" in
    openssh-key) ssh_opts; scp -q "${SSH_OPTS[@]}" -P "$VPS_PORT" "$1" "$VPS_USER@$VPS_HOST:$2" ;;
    putty) "$PSCP" -batch -q -hostkey "$VPS_HOSTKEY" -P "$VPS_PORT" -pw "$VPS_PASSWORD" "$1" "$VPS_USER@$VPS_HOST:$2" ;;
  esac
}

# Uploads deploy/remote/ into a fresh private directory on the host and prints its path.
REMOTE_TMP=""
upload_remote_kit() {
  REMOTE_TMP="$(ssh_run 'umask 077; mktemp -d /tmp/asdesk-deploy.XXXXXXXX')" || die "could not create a remote work directory"
  REMOTE_TMP="$(printf '%s' "$REMOTE_TMP" | tr -d '\r')"
  local kit="$OUT_DIR/remote-kit.tar.gz"
  mkdir -p "$OUT_DIR"
  tar -czf "$kit" -C "$DEPLOY_DIR" remote
  scp_upload "$kit" "$REMOTE_TMP/remote-kit.tar.gz" || die "upload failed"
  ssh_run "cd '$REMOTE_TMP' && tar -xzf remote-kit.tar.gz && find remote -type f -exec sed -i 's/\r\$//' {} + && chmod +x remote/*.sh" \
    || die "could not unpack the remote kit"
}
cleanup_remote_kit() { [ -n "$REMOTE_TMP" ] && ssh_run "rm -rf '$REMOTE_TMP'" >/dev/null 2>&1 || true; }
