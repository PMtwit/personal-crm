# Shared by the scripts in this folder. They source it after changing into this
# folder, so relative paths here mean the folder of one environment on the server.

repo=ghcr.io/pmtwit/personal-crm
backups_dir=backups

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

# One deploy, restore or database refresh at a time in one environment: a deploy
# that starts in the middle of a restore would run against a database that is
# gone. A second run stops right away. The lock is released when the script ends.
# The other environment has its own lock in its own folder
take_lock() {
  exec 9>.deploy.lock
  if ! flock -n 9; then
    echo "Another deploy, restore or database refresh is running in $environment: nothing changed, run this again when it ends" >&2
    exit 1
  fi
}

# The app version running now, from its container: deployed-tag changes only
# after a green smoke check, so it is out of date after a failed deploy.
# Without a container: deployed-tag, or nothing if there is no such file.
running_version() {
  local image
  if image="$(docker inspect --format '{{.Config.Image}}' "$environment-app-1" 2>/dev/null)"; then
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

# Deletes the database of this environment and creates it again, empty.
# The app must be stopped first. Needs the db service up
recreate_database() {
  compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""' </dev/null
}
