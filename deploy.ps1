<#
.SYNOPSIS
  AS Company - deploy the API to the VPS from Windows (or anywhere with PowerShell).

.DESCRIPTION
  Checks the SSH toolchain, creates and installs an SSH key the first time,
  makes sure your branch is pushed, then runs deploy.sh ON THE VPS - which
  pulls, installs, migrates only when the schema changed, restarts PM2 and
  health-checks the API.

  Settings are remembered in deploy.env at the repo root (git-ignored).

.EXAMPLE
  npm run deploy                     # from server/ - deploys the current branch
.EXAMPLE
  npm run deploy -- -Branch main -ForceMigrate
.EXAMPLE
  .\deploy.ps1 -Setup                # only do the SSH key setup
#>
[CmdletBinding()]
param(
  [string]$Server,
  [string]$User,
  [int]$Port = 0,
  [string]$RemotePath,
  [string]$Branch,
  [string]$IdentityFile,
  [switch]$ForceMigrate,
  [switch]$SkipMigrate,
  [switch]$DryRun,
  [switch]$NoPush,
  [switch]$Setup,
  [switch]$Help
)

# 'Continue', not 'Stop': ssh/git write progress to stderr, which PowerShell would
# otherwise turn into terminating errors. Every step checks $LASTEXITCODE itself.
$ErrorActionPreference = 'Continue'

# --------------------------------------------------------------------------
# Output helpers
# --------------------------------------------------------------------------
function Write-Step($m) { Write-Host ""; Write-Host "> $m" -ForegroundColor Cyan }
function Write-Info($m) { Write-Host "  $m" }
function Write-Dim ($m) { Write-Host "  $m" -ForegroundColor DarkGray }
function Write-Ok  ($m) { Write-Host "  OK  $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "  !   $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host ""; Write-Host "X  $m" -ForegroundColor Red; exit 1 }

if ($Help) { Get-Help $PSCommandPath -Detailed; exit 0 }

$Root    = $PSScriptRoot
$CfgPath = Join-Path $Root 'deploy.env'

Write-Host "AS Company - API deploy" -ForegroundColor White
Write-Dim  "repo: $Root"

# --------------------------------------------------------------------------
# 1. SSH toolchain
# --------------------------------------------------------------------------
Write-Step "Checking the SSH toolchain"
$ssh = Get-Command ssh -ErrorAction SilentlyContinue
if (-not $ssh) {
  Write-Warn2 "The OpenSSH client is not installed (or not on PATH)."
  Write-Info  "Install it from an ADMIN PowerShell:"
  Write-Info  "  Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0"
  Write-Info  "...then open a new terminal and re-run this."
  Fail "ssh not found."
}
$keygen = Get-Command ssh-keygen -ErrorAction SilentlyContinue
if (-not $keygen) { Fail "ssh-keygen not found next to ssh ($($ssh.Source))." }
Write-Ok "ssh: $($ssh.Source)"

# --------------------------------------------------------------------------
# 2. Connection settings - params > deploy.env > prompt (then remembered)
# --------------------------------------------------------------------------
$cfg = @{}
if (Test-Path $CfgPath) {
  foreach ($line in Get-Content $CfgPath) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $cfg[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
  }
  Write-Dim "loaded deploy.env"
}

function Resolve-Setting {
  param([string]$Value, [string]$Key, [string]$Prompt, [string]$Default)
  if ($Value) { return $Value }
  if ($cfg.ContainsKey($Key) -and $cfg[$Key]) { return $cfg[$Key] }
  $fromEnv = [Environment]::GetEnvironmentVariable($Key)
  if ($fromEnv) { return $fromEnv }
  $suffix = ""
  if ($Default) { $suffix = " [$Default]" }
  $answer = Read-Host "  $Prompt$suffix"
  if (-not $answer -and $Default) { return $Default }
  if (-not $answer) { Fail "$Key is required." }
  return $answer
}

Write-Step "Connection settings"
$Server     = Resolve-Setting $Server     'DEPLOY_HOST' 'VPS host or IP'        '95.217.2.105'
$User       = Resolve-Setting $User       'DEPLOY_USER' 'SSH user'              'root'
$RemotePath = Resolve-Setting $RemotePath 'DEPLOY_PATH' 'Repo path on the VPS'  '/opt/as-company'
if ($Port -le 0) {
  $p = Resolve-Setting '' 'DEPLOY_PORT' 'SSH port' '22'
  $Port = [int]$p
}
if (-not $IdentityFile) {
  if ($cfg.ContainsKey('DEPLOY_KEY') -and $cfg['DEPLOY_KEY']) { $IdentityFile = $cfg['DEPLOY_KEY'] }
  else { $IdentityFile = Join-Path $HOME '.ssh\id_ed25519' }
}
Write-Info "$User@$Server`:$Port  ->  $RemotePath"
Write-Dim  "key: $IdentityFile"

# Remember for next time (never contains a password).
$cfgOut = @(
  "# AS Company deploy target - used by deploy.ps1. Git-ignored.",
  "DEPLOY_HOST=$Server",
  "DEPLOY_USER=$User",
  "DEPLOY_PORT=$Port",
  "DEPLOY_PATH=$RemotePath",
  "DEPLOY_KEY=$IdentityFile"
)
Set-Content -Path $CfgPath -Value $cfgOut -Encoding utf8

# --------------------------------------------------------------------------
# 3. SSH key - create it if missing, install it on the VPS if not authorised
# --------------------------------------------------------------------------
Write-Step "SSH key"
$sshDir = Split-Path $IdentityFile -Parent
if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir -Force | Out-Null }

if (-not (Test-Path $IdentityFile)) {
  Write-Info "No key at $IdentityFile - generating an ed25519 key..."
  & ssh-keygen -t ed25519 -f $IdentityFile -N '' -C "as-deploy@$env:COMPUTERNAME" -q | Out-Null
  if (-not (Test-Path $IdentityFile)) { Fail "ssh-keygen did not produce $IdentityFile." }
  Write-Ok "key generated"
} else {
  Write-Dim "key exists"
}
if (-not (Test-Path "$IdentityFile.pub")) { Fail "Public key $IdentityFile.pub is missing - delete $IdentityFile and re-run." }

$SshBase = @(
  '-i', $IdentityFile,
  '-p', "$Port",
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'ConnectTimeout=10'
)
$Target = "$User@$Server"

function Test-KeyAuth {
  $out = & ssh @SshBase -o BatchMode=yes -o PasswordAuthentication=no $Target 'echo AUTH_OK'
  return ($LASTEXITCODE -eq 0 -and $out -match 'AUTH_OK')
}

Write-Info "Testing key authentication..."
if (Test-KeyAuth) {
  Write-Ok "key authentication works"
} else {
  Write-Warn2 "Key auth failed - installing the public key on the VPS."
  Write-Info  "You will be asked for the $User password on $Server ONE time."
  $pub = (Get-Content "$IdentityFile.pub" -Raw).Trim()
  $install = "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; " +
             "grep -qxF '$pub' ~/.ssh/authorized_keys || printf '%s\n' '$pub' >> ~/.ssh/authorized_keys; " +
             "chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys; echo KEY_INSTALLED"
  & ssh '-p' "$Port" '-o' 'StrictHostKeyChecking=accept-new' $Target $install
  if ($LASTEXITCODE -ne 0) { Fail "Could not install the key on $Target (wrong password, or password auth is disabled)." }
  if (-not (Test-KeyAuth)) { Fail "The key was installed but authentication still fails. Check the VPS sshd config / permissions on ~/.ssh." }
  Write-Ok "key installed - future deploys will not prompt"
}

# --------------------------------------------------------------------------
# 4. The repo on the VPS
# --------------------------------------------------------------------------
Write-Step "Checking the repo on the VPS"
$probe = & ssh @SshBase $Target "test -f '$RemotePath/deploy.sh' && echo HAVE_REPO || echo NO_REPO"
if ($probe -match 'NO_REPO') {
  Write-Warn2 "$RemotePath does not contain deploy.sh."
  $origin = (& git -C $Root remote get-url origin).Trim()
  Write-Info "Clone it there now?  git clone $origin $RemotePath"
  $yes = Read-Host "  Type 'y' to clone (anything else aborts)"
  if ($yes -ne 'y') { Fail "Nothing to deploy at $RemotePath." }
  & ssh @SshBase $Target "mkdir -p '$RemotePath' && git clone '$origin' '$RemotePath'"
  if ($LASTEXITCODE -ne 0) { Fail "Clone failed. If the repo is private, add a deploy key on the VPS first." }
  Write-Warn2 "Remember to create $RemotePath/server/.env on the VPS before the first real deploy."
  Write-Ok "cloned"
} else {
  Write-Ok "found $RemotePath/deploy.sh"
}

if ($Setup) { Write-Host ""; Write-Host "Setup complete - run 'npm run deploy' to deploy." -ForegroundColor Green; exit 0 }

# --------------------------------------------------------------------------
# 5. Local git - make sure what you are deploying is actually pushed
# --------------------------------------------------------------------------
Write-Step "Local branch"
if (-not $Branch) {
  $Branch = (& git -C $Root rev-parse --abbrev-ref HEAD).Trim()
  if ($Branch -eq 'HEAD') { Fail "Detached HEAD locally - pass -Branch <name>." }
}
if ($Branch -notmatch '^[A-Za-z0-9._\-/]+$') { Fail "Refusing to use an unusual branch name: $Branch" }
Write-Info "branch: $Branch"

$dirty = & git -C $Root status --porcelain --untracked-files=no
if ($dirty) {
  Write-Warn2 "You have uncommitted changes locally - they will NOT be deployed:"
  $dirty | ForEach-Object { Write-Dim "  $_" }
}

$hasUpstream = $false
& git -C $Root rev-parse --verify --quiet "refs/remotes/origin/$Branch" | Out-Null
if ($LASTEXITCODE -eq 0) { $hasUpstream = $true }

if (-not $hasUpstream) {
  if ($NoPush) { Fail "origin/$Branch does not exist and -NoPush was given." }
  Write-Info "origin/$Branch does not exist yet - pushing..."
  & git -C $Root push -u origin $Branch
  if ($LASTEXITCODE -ne 0) { Fail "git push failed." }
  Write-Ok "pushed"
} else {
  $ahead = (& git -C $Root rev-list --count "origin/$Branch..$Branch").Trim()
  if ([int]$ahead -gt 0) {
    if ($NoPush) {
      Write-Warn2 "$ahead local commit(s) are not on origin - deploying WITHOUT them (-NoPush)."
    } else {
      Write-Info "$ahead local commit(s) ahead of origin - pushing..."
      & git -C $Root push origin $Branch
      if ($LASTEXITCODE -ne 0) { Fail "git push failed." }
      Write-Ok "pushed"
    }
  } else {
    Write-Dim "origin/$Branch is up to date"
  }
}

# --------------------------------------------------------------------------
# 6. Run the deploy on the VPS
# --------------------------------------------------------------------------
$flags = "--branch '$Branch'"
if ($ForceMigrate) { $flags += " --force-migrate" }
if ($SkipMigrate)  { $flags += " --skip-migrate" }
if ($DryRun)       { $flags += " --dry-run" }

Write-Step "Running deploy.sh on $Server"
Write-Dim  "bash $RemotePath/deploy.sh $flags"
Write-Host ""

& ssh @SshBase $Target "bash '$RemotePath/deploy.sh' $flags"
$code = $LASTEXITCODE

Write-Host ""
if ($code -eq 0) {
  Write-Host "Deployed $Branch to $Server." -ForegroundColor Green
  Write-Dim "The website itself is rebuilt by Vercel on push - nothing else to do."
} else {
  Write-Host "Deploy FAILED (exit $code). The VPS output above says why." -ForegroundColor Red
}
exit $code
