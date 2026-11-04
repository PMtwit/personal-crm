# Shared by deploy.sh and restore.sh. They source it after changing into this
# folder, so relative paths here mean the app folder on the server.

backups_dir=backups

compose() {
  docker compose -p prod "$@"
}

check_env() {
  if [ ! -f .env ]; then
    echo "No .env in $PWD: create it, see README" >&2
    exit 1
  fi
  chmod 600 .env
}

# One deploy or restore at a time: a deploy that starts in the middle of a
# restore would run against a database that is gone. A second run stops right
# away. The lock is released when the script ends.
take_lock() {
  exec 9>.deploy.lock
  if ! flock -n 9; then
    echo "Another deploy or restore is running on this server: nothing changed, run this again when it ends" >&2
    exit 1
  fi
}

# The app version running now, from its container: deployed-tag changes only
# after a green smoke check, so it is out of date after a failed deploy.
# Without a container: deployed-tag, or nothing if there is no such file.
running_version() {
  local image
  if image="$(docker inspect --format '{{.Config.Image}}' prod-app-1 2>/dev/null)"; then
    echo "${image##*:}"
  else
    cat deployed-tag 2>/dev/null || true
  fi
}

# True when pg_restore can read the whole file as a backup, so a cut-off file
# is caught before anything is deleted. Writes nothing. Needs the db service up.
backup_is_readable() {
  compose exec -T db pg_restore --file=/dev/null <"$1"
}

# Dumps the whole database to backups/<label>_<Moscow time>_<version>.dump and
# sets backup_path. Needs the db service up.
# The dump holds people's data, so only the owner can read it. It gets its final
# name once complete, so a file with that name is always a whole backup.
# No stdin for pg_dump: in deploy.sh stdin holds the registry token.
backup_database() {
  local label="$1" version="${2:-none}" stamp tmp
  stamp="$(TZ=Europe/Moscow date +%Y-%m-%d_%H-%M-%S)"
  backup_path="$backups_dir/${label}_${stamp}_${version}.dump"
  tmp="$backup_path.tmp"
  if ! (umask 077 && mkdir -p "$backups_dir" &&
    compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' </dev/null >"$tmp") ||
    ! backup_is_readable "$tmp"; then
    rm -f "$tmp"
    echo "Database backup failed" >&2
    return 1
  fi
  mv "$tmp" "$backup_path"
}
