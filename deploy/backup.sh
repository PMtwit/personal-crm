#!/usr/bin/env bash
# Daily backup of the production database: backups/daily_<Moscow time>_<version>.dump,
# the newest 7 stay. A systemd timer runs it every day at 03:00 Moscow time
# (systemd/ in this folder, installed by hand, see README); a person may also
# run it by hand. Prod only: the test stand keeps no backups.
# It never starts, stops or changes anything: no running database, no backup.
#
#   sudo -u deploy /srv/personal-crm/backup.sh
set -euo pipefail

# Started during a deploy, restore or database refresh, it waits this long
# for it to end, then gives up
lock_wait_seconds=1800

cd "$(dirname "$0")"
. ./common.sh

if [ "$PWD" = "$staging_dir" ]; then
  echo "backup.sh is for prod only: the test stand keeps no backups, its data is a copy of prod's" >&2
  exit 1
fi
use_environment prod
check_env
take_lock "$lock_wait_seconds"

# compose needs an app version even to reach the database. The version also
# goes into the backup's name: it tells which version its tables belong to
version="$(running_version)"
if [ -z "$version" ]; then
  echo "Cannot tell which app version is running: no backup taken" >&2
  exit 1
fi
export APP_TAG="$version"

echo "==> Backing up the database"
backup_database daily "$version"
echo "Saved $PWD/$backup_path"
prune_backups daily "$keep_backups"
