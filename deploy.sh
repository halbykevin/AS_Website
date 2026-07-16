#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# AS Company — one-command API deploy (run this ON THE VPS).
#
#   Pulls the latest code, installs API dependencies, runs the (idempotent)
#   database migrations, and restarts the PM2 process.
#
# Usage on the VPS, from anywhere:
#     bash /path/to/AS_Website/deploy.sh
#   or, from the repo:
#     cd server && npm run deploy
#
# The frontend is NOT built here — Vercel rebuilds it automatically on git push.
# ---------------------------------------------------------------------------
set -euo pipefail

# Jump to the repo root (this script's own directory) so it works from anywhere.
cd "$(dirname "$(readlink -f "$0")")"

PM2_NAME="${PM2_NAME:-as-api}"

echo "▶ Pulling latest from git…"
git pull --ff-only

echo "▶ Installing API dependencies…"
cd server
npm install --no-audit --no-fund

echo "▶ Running database migrations (idempotent)…"
npm run migrate

echo "▶ Restarting the API (PM2: ${PM2_NAME})…"
pm2 restart "${PM2_NAME}" --update-env

echo "✅ Deploy complete — API is running the latest code."
