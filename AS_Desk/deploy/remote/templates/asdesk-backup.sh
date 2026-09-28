#!/usr/bin/env bash
# Installed by ASDesk provision.sh. Dumps the ASDesk database; keeps 14 days of archives.
# Usage: asdesk-backup [label]      (label is appended to the file name, e.g. pre-deploy)
set -euo pipefail
umask 077
label="${1:-nightly}"
[[ "$label" =~ ^[a-z0-9-]+$ ]] || { echo "invalid label" >&2; exit 2; }
url="$(grep -m1 '^DATABASE_URL=' @BASE@/shared/.env | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//")"
out="@BASE@/backups/asdesk-$(date -u +%Y%m%dT%H%M%SZ)-$label.dump"
pg_dump --format=custom --no-owner --dbname="$url" --file="$out.part"
mv -f "$out.part" "$out"
find @BASE@/backups -name 'asdesk-*.dump' -mtime +14 -delete
echo "$out ($(du -h "$out" | cut -f1))"
