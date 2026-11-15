# Shared by the scripts in this folder. They source it after changing into this
# folder, so relative paths here mean the folder of one environment on the server.

repo=ghcr.io/pmtwit/personal-crm
backups_dir=backups
# Prod keeps this many backups of each kind: taken before a deploy, daily
keep_backups=7

# Each environment has its own folder on the server, with its own copy of these
# scripts, its .env, the versions it runs and its lock. The deploy copies the
# deploy/ folder of the repository into the folder of the environment it deploys
prod_dir=/srv/personal-crm
staging_dir=/srv/personal-crm-staging

# Settings of one environment: prod (app.pmcrm.site) or staging, the test stand
# (test-app.pmcrm.site). Every script calls it first. A wrong name, or the folder
# of the other environment, stops the script before anything changes: the prod
# .env never meets the staging database, and the other way round.
# compose.yaml reads APP_URL, APP_PORT and the memory limits (0 means no limit)
use_environment() {
  environment="$1"
  case "$environment" in
    prod)
      env_dir="$prod_dir"
      export APP_URL=https://app.pmcrm.site APP_PORT=3000
      export APP_MEMORY_LIMIT=0 DB_MEMORY_LIMIT=0
      ;;
    staging)
      env_dir="$staging_dir"
      export APP_URL=https://test-app.pmcrm.site APP_PORT=3001
      # The test stand shares the server with prod and the landing: it cannot
      # take the memory they need
      export APP_MEMORY_LIMIT=256m DB_MEMORY_LIMIT=256m
      ;;
    *)
      echo "Unknown environment '$environment': use prod or staging" >&2
      exit 1
      ;;
  esac
  if [ "$PWD" != "$env_dir" ]; then
    echo "The $environment scripts run from $env_dir, not from $PWD: nothing changed" >&2
    exit 1
  fi
}

# docker compose of this environment: the project name keeps its containers and
# its database volume apart from the other environment's
compose() {
  docker compose -p "$environment" "$@"
}

check_env() {
  if [ ! -f .env ]; then
    echo "No .env in $PWD: create it, see README" >&2
    exit 1
  fi
  chmod 600 .env
}

# One deploy, restore, backup or database refresh at a time in one environment:
# a deploy that starts in the middle of a restore would run against a database
# that is gone. A second run stops right away, or waits up to the given number
# of seconds first. The lock is released when the script ends.
# The other environment has its own lock in its own folder
take_lock() {
  local wait="${1:-0}" locked
  exec 9>.deploy.lock
  if [ "$wait" -gt 0 ]; then
    flock -w "$wait" 9 && locked=yes || locked=""
  else
    flock -n 9 && locked=yes || locked=""
  fi
  if [ -z "$locked" ]; then
    echo "Another deploy, restore, backup or database refresh is running in $environment: nothing changed, run this again when it ends" >&2
    exit 1
  fi
}

# The versions of an environment that passed the smoke check, oldest first, one
# commit SHA per line, in deploy-history in the environment's folder. The last
# line is the version that should be running, the line before it is where a
# rollback goes. deploy.sh writes it; a rollback removes the last line
history_file=deploy-history
keep_history=20

# The newest version in the history of this environment, or of the one in the
# given folder; nothing if there is no history
current_tag() {
  tail -n 1 "${1:-.}/$history_file" 2>/dev/null || true
}

# The version before the newest one, or nothing
previous_tag() {
  awk '{ previous = last; last = $0 } END { print previous }' "$history_file" 2>/dev/null || true
}

# Adds a version that just passed the smoke check, unless it is the newest one
# already. Only the newest lines stay
record_deployed() {
  if [ "$(current_tag)" != "$1" ]; then
    { cat "$history_file" 2>/dev/null || true; echo "$1"; } | tail -n "$keep_history" >"$history_file.tmp"
    mv "$history_file.tmp" "$history_file"
  fi
}

# Removes the newest version: a rollback has just left it
forget_newest() {
  sed '$d' "$history_file" >"$history_file.tmp"
  mv "$history_file.tmp" "$history_file"
}

# Until November 2026 the scripts kept only the current and the previous version,
# in deployed-tag and previous-tag. The history starts from them, once
migrate_history() {
  if [ ! -f "$history_file" ] && [ -f deployed-tag ]; then
    { cat previous-tag 2>/dev/null || true; cat deployed-tag; } | grep -v '^$' >"$history_file.tmp" || true
    mv "$history_file.tmp" "$history_file"
  fi
  rm -f deployed-tag previous-tag
}

# The app version running now, from its container: the history changes only
# after a green smoke check, so it is out of date after a failed deploy.
# Without a container: the newest version in the history, or nothing.
running_version() {
  local image
  if image="$(docker inspect --format '{{.Config.Image}}' "$environment-app-1" 2>/dev/null)"; then
    echo "${image##*:}"
  else
    current_tag
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

# Keeps the newest backups of one kind (before-deploy, daily) and deletes the
# rest. The names start with the kind and the time, so they sort by time
prune_backups() {
  local label="$1" keep="$2"
  find "$backups_dir" -maxdepth 1 -name "${label}_*.dump" | sort -r | tail -n +"$((keep + 1))" | while read -r old; do
    rm -f "$old"
  done
}

# Deletes the database of this environment and creates it again, empty.
# The app must be stopped first. Needs the db service up
recreate_database() {
  compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""' </dev/null
}
