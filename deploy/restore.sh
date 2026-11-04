#!/usr/bin/env bash
# Replaces the production database with a backup file. Only a person runs it,
# by hand on the server (see README). It never changes the app version and runs
# no migrations; if a step fails, it stops and rolls nothing back by itself.
#
#   sudo -u deploy /srv/personal-crm/restore.sh <backup file>
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: restore.sh <backup file>" >&2
  exit 1
fi
# Before changing folder: a relative path means the folder this was started in
if [ ! -f "$1" ] || [ ! -r "$1" ]; then
  echo "Cannot read $1: nothing changed" >&2
  exit 1
fi
backup_file="$(realpath "$1")"

cd "$(dirname "$0")"
. ./common.sh

check_env
take_lock

# The same version comes back after the restore
version="$(running_version)"
if [ -z "$version" ]; then
  echo "Cannot tell which app version is running: nothing changed" >&2
  exit 1
fi
export APP_TAG="$version"

compose up -d --wait db </dev/null

if ! backup_is_readable "$backup_file"; then
  echo "$backup_file is not a whole database backup: nothing changed" >&2
  exit 1
fi

database="$(compose exec -T db sh -c 'printf %s "$POSTGRES_DB"' </dev/null)"

# The version in a backup's name tells which app version its tables belong to
backup_version=""
if [[ "$(basename "$backup_file")" =~ ^before-(deploy|restore)_[0-9_-]+_([^_]+)\.dump$ ]]; then
  backup_version="${BASH_REMATCH[2]}"
fi

echo
echo "This deletes the database and loads it from the backup file."
echo
echo "  Backup file:             $backup_file"
echo "  Size and time (Moscow):  $(TZ=Europe/Moscow ls -lh "$backup_file" | awk '{print $5, $6, $7, $8}')"
echo "  Database to replace:     $database"
echo "  App version now:         $version (stays the same)"
echo "  App version of backup:   ${backup_version:-unknown}"
echo
if [ "$backup_version" != "$version" ]; then
  echo "WARNING: the app versions differ. The app may not work with the tables from this backup."
  echo "To restore a backup together with its app version, see README."
  echo
fi

printf 'Type yes to continue: '
answer=""
read -r answer || true
if [ "$answer" != "yes" ]; then
  echo "Cancelled: nothing changed"
  exit 0
fi

echo "==> Copying the current database"
backup_database before-restore "$version"
safety_copy="$PWD/$backup_path"
echo "Saved $safety_copy"

# From here on the database changes: on any failure, say where things stand
step="stopping the app"
report_failure() {
  if [ -n "$step" ]; then
    echo >&2
    echo "RESTORE FAILED while $step. Nothing was rolled back." >&2
    echo "The database as it was before this restore: $safety_copy" >&2
    echo "Check the app with: docker ps -a" >&2
  fi
}
trap report_failure EXIT

echo "==> Stopping the app"
compose stop app </dev/null

echo "==> Recreating the database"
step="recreating the database"
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""' </dev/null

echo "==> Loading the backup"
step="loading the backup; the app stays stopped"
compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --single-transaction' <"$backup_file"

echo "==> Starting the app, version $version"
step="starting the app"
compose up -d --wait app </dev/null

step=""
echo "==> Restored $database from $backup_file"
echo "The database as it was before this restore: $safety_copy"
