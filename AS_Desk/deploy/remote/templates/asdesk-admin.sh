#!/bin/sh
# Installed by ASDesk provision.sh. Operator commands against the ASDesk database, e.g.
#   asdesk-admin devices | revoke <id> | restore <id> | sessions [n]
cd @BASE@/current || { echo "no active ASDesk release" >&2; exit 1; }
exec runuser -u @APP_USER@ -- @NODE_BIN@ --env-file=@BASE@/shared/.env @BASE@/current/dist/admin.mjs "$@"
