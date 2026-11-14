#!/usr/bin/env bash
# Replaces the database of the test stand with a copy of the newest prod backup.
# Run it by hand on the server: once when the test stand is new, and again when
# its data is broken or too old (see README). Test stand only: prod is never
# touched, its backup is only read. No questions asked: the test stand's data
# is a throwaway copy.
#
# The app of the test stand keeps its version: after the copy its migrations
# bring the tables up to that version. The copy keeps contacts, notes, groups and
# users, but not prod's sessions, login links and letter counts: on the test
# stand everyone logs in anew, by a letter.
#
#   sudo -u deploy /srv/personal-crm-staging/refresh-staging-db.sh
set -euo pipefail

cd "$(dirname "$0")"
. ./common.sh

use_environment staging
check_env
take_lock

version="$(running_version)"
if [ -z "$version" ]; then
  echo "The test stand has no app version yet: deploy it first (see README). Nothing changed" >&2
  exit 1
fi
export APP_TAG="$version"

# The newest prod backup of any kind, by the time it was written
backup_file=""
for file in "$prod_dir/$backups_dir"/*.dump; do
  if [ -f "$file" ] && { [ -z "$backup_file" ] || [ "$file" -nt "$backup_file" ]; }; then
    backup_file="$file"
  fi
done
if [ -z "$backup_file" ]; then
  echo "No prod backups in $prod_dir/$backups_dir: nothing changed" >&2
  exit 1
fi

compose up -d --wait db </dev/null

if ! backup_is_readable "$backup_file"; then
  echo "$backup_file is not a whole database backup: nothing changed" >&2
  exit 1
fi

echo "==> Copying $backup_file"
echo "    ($(TZ=Europe/Moscow ls -lh "$backup_file" | awk '{print $5, $6, $7, $8}') Moscow time) into the test stand, app version $version"

# From here on the database of the test stand changes
step="stopping the app"
report_failure() {
  if [ -n "$step" ]; then
    echo >&2
    echo "REFRESH FAILED while $step. Run this script again; prod is not affected" >&2
  fi
}
trap report_failure EXIT

echo "==> Stopping the app"
compose stop app </dev/null

echo "==> Recreating the database"
step="recreating the database"
recreate_database

echo "==> Loading the backup"
step="loading the backup; the app stays stopped"
# The owners and rights of prod's database mean nothing here
compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --single-transaction' <"$backup_file"

echo "==> Applying migrations of version $version"
step="applying migrations; the app stays stopped"
compose run --rm -T migrate </dev/null

echo "==> Deleting prod's sessions, login links and letter counts from the copy"
step="deleting sessions; the app stays stopped"
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction -c "DELETE FROM sessions" -c "DELETE FROM verifications" -c "DELETE FROM sign_in_emails"' </dev/null

echo "==> Starting the app, version $version"
step="starting the app"
compose up -d --wait app </dev/null

echo "==> Smoke check"
step="checking /health"
curl -fsS --retry 5 --retry-delay 2 --retry-all-errors "http://127.0.0.1:$APP_PORT/health"
echo

step=""
echo "==> The test stand now has the data of $backup_file"
