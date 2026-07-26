<#
.SYNOPSIS
  AS Company - deploy the API to the VPS from Windows (or anywhere with PowerShell).

.DESCRIPTION
  Checks the SSH toolchain, creates and installs an SSH key the first time,
  makes sure your branch is pushed, then runs deploy.sh ON THE VPS - which
  pulls once and deploys BOTH APIs from that single clone:

    site   AS Company website API   server/            pm2 as-api        :8080
    store  AS Store API             as_store/server/   pm2 as-store-api  :8081

  Each app installs, migrates and restarts independently; an app whose files
  did not change is left running untouched.

  Settings are remembered in deploy.env at the repo root (git-ignored).

.EXAMPLE
  npm run deploy                     # both APIs, current branch
.EXAMPLE
  npm run deploy -- -App store       # just the AS Store API
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
  [ValidateSet('all', 'site', 'store')]
  [string]$App = 'all',
  [string]$IdentityFile,
  [switch]$ForceMigrate,
  [switch]$SkipMigrate,
  [switch]$ForceRestart,
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
$script:Prompted = $false
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
  param(
    [string]$Value, [string]$Key, [string]$Prompt, [string]$Default,
    [string]$Pattern,       # a valid answer must match this
    [string]$Hint           # shown when it does not
  )
  $preset = $null
  if ($Value) { $preset = $Value }
  elseif ($cfg.ContainsKey($Key) -and $cfg[$Key]) { $preset = $cfg[$Key] }
  else {
    $fromEnv = [Environment]::GetEnvironmentVariable($Key)
    if ($fromEnv) { $preset = $fromEnv }
  }
  if ($preset) {
    if ($Pattern -and ($preset -notmatch $Pattern)) { Fail "$Key is not valid ($Hint). Fix it in deploy.env - current value: $preset" }
    return $preset
  }

  # No stored value: ask, and keep asking until the answer is usable. This
  # matters because these prompts are NEVER for a password - a mistyped secret
  # would otherwise be written to deploy.env in the clear.
  $suffix = ""
  if ($Default) { $suffix = " [$Default]" }
  $script:Prompted = $true
  for ($i = 0; $i -lt 3; $i++) {
    $answer = Read-Host "  $Prompt$suffix"
    if (-not $answer -and $Default) { return $Default }
    if (-not $answer) { Write-Warn2 "$Key is required."; continue }
    if ($Pattern -and ($answer -notmatch $Pattern)) { Write-Warn2 "That does not look like $Hint. This prompt is not asking for a password."; continue }
    return $answer
  }
  Fail "$Key was not provided."
}

Write-Step "Connection settings"
Write-Dim "(none of these is a password - SSH will ask for that separately if needed)"
$Server     = Resolve-Setting $Server     'DEPLOY_HOST' 'VPS host or IP'       '95.217.2.105' `
                '^[A-Za-z0-9][A-Za-z0-9._\-]*$' 'a hostname or IP address'
$User       = Resolve-Setting $User       'DEPLOY_USER' 'SSH user'             'root' `
                '^[A-Za-z0-9._\-]+$' 'a Linux username'
$RemotePath = Resolve-Setting $RemotePath 'DEPLOY_PATH' 'Repo path on the VPS' '/opt/as-company' `
                '^/[A-Za-z0-9._\-/]*$' 'an absolute Linux path (e.g. /opt/as-company)'
if ($Port -le 0) {
  $p = Resolve-Setting '' 'DEPLOY_PORT' 'SSH port' '22' '^[0-9]{1,5}$' 'a port number'
  $Port = [int]$p
}
if (-not $IdentityFile) {
  if ($cfg.ContainsKey('DEPLOY_KEY') -and $cfg['DEPLOY_KEY']) { $IdentityFile = $cfg['DEPLOY_KEY'] }
  else { $IdentityFile = Join-Path $HOME '.ssh\id_ed25519' }
}
Write-Info "$User@$Server`:$Port  ->  $RemotePath"
Write-Dim  "key: $IdentityFile"

# Remember the answers - but ONLY the ones we had to ask for, so a one-off
# -Server / -RemotePath override never overwrites your saved target.
if ($script:Prompted -or -not (Test-Path $CfgPath)) {
$cfgOut = @(
  "# AS Company deploy target - used by deploy.ps1. Git-ignored.",
  "DEPLOY_HOST=$Server",
  "DEPLOY_USER=$User",
  "DEPLOY_PORT=$Port",
  "DEPLOY_PATH=$RemotePath",
  "DEPLOY_KEY=$IdentityFile"
)
  Set-Content -Path $CfgPath -Value $cfgOut -Encoding utf8
  Write-Dim "saved to deploy.env"
}

# --------------------------------------------------------------------------
# 3. SSH key - create it if missing, install it on the VPS if not authorised
# --------------------------------------------------------------------------
Write-Step "SSH key"
$sshDir = Split-Path $IdentityFile -Parent
if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir -Force | Out-Null }

if (-not (Test-Path $IdentityFile)) {
  Write-Info "No key at $IdentityFile - generating an ed25519 key..."
  # Via cmd.exe on purpose: PowerShell 5.1 DROPS empty-string arguments when
  # calling native exes, so `-N ''` disappears and ssh-keygen mis-parses the
  # rest of the line. cmd passes `-N ""` through as a real empty argument.
  $kg = 'ssh-keygen -t ed25519 -f "' + $IdentityFile + '" -N "" -C "as-deploy@' + $env:COMPUTERNAME + '" -q'
  & cmd.exe /c $kg
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
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "X  Could not install the key on $Target. The ssh error above says which:" -ForegroundColor Red
    Write-Info "  'Connection refused' / 'timed out'  -> wrong host or port, or a firewall"
    Write-Info "  'Permission denied'                 -> wrong password, or the VPS has PasswordAuthentication no"
    Write-Info "In the last case, paste this into the VPS's ~/.ssh/authorized_keys yourself:"
    Write-Host "  $pub" -ForegroundColor DarkGray
    exit 1
  }
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
$flags = "--branch '$Branch' --app '$App'"
if ($ForceMigrate) { $flags += " --force-migrate" }
if ($SkipMigrate)  { $flags += " --skip-migrate" }
if ($ForceRestart) { $flags += " --force-restart" }
if ($DryRun)       { $flags += " --dry-run" }

Write-Step "Running deploy.sh on $Server ($App)"
Write-Dim  "bash $RemotePath/deploy.sh $flags"
Write-Host ""

& ssh @SshBase $Target "bash '$RemotePath/deploy.sh' $flags"
$code = $LASTEXITCODE

Write-Host ""
if ($code -eq 0) {
  Write-Host "Deployed $Branch ($App) to $Server." -ForegroundColor Green
  Write-Dim "Both frontends are rebuilt by Vercel on push - nothing else to do."
} else {
  Write-Host "Deploy FAILED (exit $code). The VPS output above says why." -ForegroundColor Red
}
exit $code
