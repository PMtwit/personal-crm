#!/usr/bin/env bash
# Deploys the app image with the given tag (a commit SHA) to one environment on
# this server: prod (app.pmcrm.site) or staging, the test stand (test-app.pmcrm.site).
# On prod a backup of the database comes first; then migrations, the new app and
# a smoke check of /health. GitHub Actions runs it: "Deploy staging" after every
# push to main, "Deploy prod" only when the owner starts it (see README).
#
# "rollback" instead of a tag brings back the version before the current one;
# a second rollback goes one more step back. Nothing rolls back by itself.
#
#   deploy.sh <prod|staging> <tag|rollback> [registry user]    the registry token, if needed, comes on stdin
set -euo pipefail

usage="usage: deploy.sh <prod|staging> <image tag|rollback> [registry user]"
environment_arg="${1:?$usage}"
target="${2:?$usage}"
registry_user="${3:-}"
# After a prod deploy, app images older than this leave the server (step 7)
max_image_age_days=14

cd "$(dirname "$0")"
. ./common.sh

use_environment "$environment_arg"
check_env
take_lock
migrate_history

running="$(running_version)"

# The version to deploy. A rollback goes to the version before the one running
# now. Usually that is the one before the newest in the history, and the newest
# leaves the history once the rollback passes the smoke check. But if the last
# deploy failed after starting its app, the version running never got into the
# history: then the newest one in the history is the version before it
rollback=false
forget_newest_after=false
if [ "$target" = rollback ]; then
  rollback=true
  newest="$(current_tag)"
  if [ -n "$running" ] && [ "$running" != "$newest" ]; then
    tag="$newest"
  else
    tag="$(previous_tag)"
    forget_newest_after=true
  fi
  if [ -z "$tag" ]; then
    echo "No earlier $environment version to roll back to: nothing changed" >&2
    exit 1
  fi
  echo "==> Rolling back $environment from ${running:-none} to $tag"
else
  tag="$target"
fi
if ! [[ "$tag" =~ ^[0-9a-f]{40}$ ]]; then
  echo "'$tag' is not a full commit SHA: nothing changed" >&2
  exit 1
fi

image="$repo:$tag"
export APP_TAG="$tag"

# While this runs, a prod deploy must not remove this image when it cleans up
# (step 7). Gone when the script ends, whatever happens
docker_config=""
on_exit() {
  rm -f deploying-tag
  if [ -n "$docker_config" ]; then
    rm -rf "$docker_config"
  fi
}
trap on_exit EXIT
echo "$tag" >deploying-tag

# 1. Prod only: the backup, named after the version running now. If it fails,
#    the script stops here and the app that is running now stays as it is.
#    Nothing here may read stdin: the registry token there is for step 2.
#    The test stand keeps no backups: its data is a copy of prod's
#    (refresh-staging-db.sh)
if [ "$environment" = prod ]; then
  echo "==> Backing up the database"
  compose up -d --wait db </dev/null
  backup_database before-deploy "$running"
  echo "Saved $PWD/$backup_path"
fi

# 2. The image. A rollback to an image kept on this server needs no registry,
#    and neither does an image the other environment has pulled already
if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "==> Pulling $image"
  # A throwaway docker config: the short-lived token never stays on the server
  docker_config="$(mktemp -d)"
  if [ -n "$registry_user" ]; then
    DOCKER_CONFIG="$docker_config" docker login ghcr.io --username "$registry_user" --password-stdin
  fi
  DOCKER_CONFIG="$docker_config" docker pull "$image"
fi

# 3. Migrations from the new image. If they fail, the script stops here
#    and the app that is running now stays as it is
echo "==> Applying migrations"
compose run --rm -T migrate

# 4. The new app: --wait returns once its health check passes
echo "==> Starting the app"
compose up -d --wait app

# 5. Smoke check
echo "==> Smoke check"
curl -fsS --retry 5 --retry-delay 2 --retry-all-errors "http://127.0.0.1:$APP_PORT/health"
echo

# 6. The history of this environment: only versions that passed the smoke check
if [ "$forget_newest_after" = true ]; then
  forget_newest
else
  record_deployed "$tag"
fi

# 7. Prod only, disk. Backups: the newest before-deploy ones stay; backup.sh
#    prunes the daily ones; copies taken before a restore stay until removed by
#    hand. Images: both environments share them on this server, see remove_old_images
remove_old_images() {
  local kept cutoff old created
  # Never removed: the two newest prod versions (the current one and where a
  # rollback goes), the test stand's current version, and any version being
  # deployed right now
  kept="$(
    tail -n 2 "$prod_dir/$history_file" 2>/dev/null || true
    current_tag "$staging_dir"
    cat "$prod_dir/deploying-tag" "$staging_dir/deploying-tag" 2>/dev/null || true
  )"
  # Docker gives the build time of an image in UTC, like
  # 2026-11-14T17:28:34.515107863Z. Its digits up to the seconds make a number
  # that compares with the cutoff: 20261114172834
  cutoff="$(date -u -d "-$max_image_age_days days" +%Y%m%d%H%M%S)"
  docker image ls "$repo" --format '{{.Tag}}' | while read -r old; do
    if [ "$old" = "<none>" ] || grep -qxF -- "$old" <<<"$kept"; then
      continue
    fi
    created="$(docker image inspect --format '{{.Created}}' "$repo:$old" 2>/dev/null || true)"
    created="$(tr -dc '0-9' <<<"${created:0:19}")"
    if [ "${#created}" -eq 14 ] && [ "$created" -lt "$cutoff" ]; then
      docker image rm "$repo:$old" >/dev/null || echo "Warning: could not remove $repo:$old" >&2
    fi
  done
  docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/PMtwit/personal-crm" >/dev/null
}
if [ "$environment" = prod ]; then
  prune_backups before-deploy "$keep_backups"
  remove_old_images
fi

previous="$(previous_tag)"
if [ "$rollback" = true ]; then
  echo "==> Rolled back $environment to $image (before it in the history: ${previous:-none})"
else
  echo "==> Deployed $image to $environment (previous: ${previous:-none})"
fi
