#!/usr/bin/env bash
# Deploys the app image with the given tag (a commit SHA) to one environment on
# this server: prod (app.pmcrm.site) or staging, the test stand (test-app.pmcrm.site).
# On prod a backup of the database comes first; then migrations, the new app and
# a smoke check of /health. GitHub Actions runs it for both environments after
# every push to main. A manual rollback is the same script with the previous tag
# (see README); it never rolls back by itself.
#
#   deploy.sh <prod|staging> <tag> [registry user]    the registry token, if needed, comes on stdin
set -euo pipefail

usage="usage: deploy.sh <prod|staging> <image tag> [registry user]"
environment_arg="${1:?$usage}"
tag="${2:?$usage}"
registry_user="${3:-}"
keep_backups=30

cd "$(dirname "$0")"
. ./common.sh

use_environment "$environment_arg"
check_env
take_lock

image="$repo:$tag"
export APP_TAG="$tag"

# While this runs, a deploy of the other environment must not remove this image
# when it cleans up (step 6 there). Gone when the script ends, whatever happens
docker_config=""
on_exit() {
  rm -f deploying-tag
  if [ -n "$docker_config" ]; then
    rm -rf "$docker_config"
  fi
}
trap on_exit EXIT
echo "$tag" > deploying-tag

# 1. Prod only: the backup, named after the version running now. If it fails,
#    the script stops here and the app that is running now stays as it is.
#    Nothing here may read stdin: the registry token there is for step 2.
#    The test stand keeps no backups: its data is a copy of prod's
#    (refresh-staging-db.sh)
if [ "$environment" = prod ]; then
  echo "==> Backing up the database"
  compose up -d --wait db </dev/null
  backup_database before-deploy "$(running_version)"
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

# 6. Disk. Prod: keep the newest backups; copies taken before a restore stay
#    until removed by hand. Both: keep only the images some environment needs,
#    see kept_tags
if [ "$environment" = prod ]; then
  find "$backups_dir" -maxdepth 1 -name 'before-deploy_*.dump' | sort -r | tail -n +"$((keep_backups + 1))" | while read -r old; do
    rm -f "$old"
  done
fi

deployed="$(cat deployed-tag 2>/dev/null || true)"
if [ "$deployed" != "$tag" ]; then
  if [ -n "$deployed" ]; then
    echo "$deployed" > previous-tag
  fi
  echo "$tag" > deployed-tag
fi
previous="$(cat previous-tag 2>/dev/null || true)"

# The images of both environments share this server. Each environment keeps the
# version it runs, the previous one for a manual rollback, and the one it is
# deploying right now
kept_tags() {
  local dir
  for dir in "$prod_dir" "$staging_dir"; do
    cat "$dir/deployed-tag" "$dir/previous-tag" "$dir/deploying-tag" 2>/dev/null || true
  done
}
kept="$(kept_tags)"
docker image ls "$repo" --format '{{.Tag}}' | while read -r old; do
  if [ "$old" != "<none>" ] && ! grep -qxF -- "$old" <<<"$kept"; then
    docker image rm "$repo:$old" >/dev/null || echo "Warning: could not remove $repo:$old" >&2
  fi
done
docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/PMtwit/personal-crm" >/dev/null

echo "==> Deployed $image to $environment (previous: ${previous:-none})"
