#!/usr/bin/env bash
# Deploys the app image with the given tag (a commit SHA) on this server:
# a backup of the database, migrations, then the new app, then a smoke check of
# /health. GitHub Actions runs it after every push to main. A manual rollback is
# the same script with the previous tag (see README); it never rolls back by itself.
#
#   deploy.sh <tag> [registry user]    the registry token, if needed, comes on stdin
set -euo pipefail

tag="${1:?usage: deploy.sh <image tag> [registry user]}"
registry_user="${2:-}"
repo=ghcr.io/pmtwit/personal-crm
image="$repo:$tag"
keep_backups=30

cd "$(dirname "$0")"
. ./common.sh

check_env
take_lock

export APP_TAG="$tag"

# 1. The backup, named after the version running now. If it fails, the script
#    stops here and the app that is running now stays as it is.
#    Nothing here may read stdin: the registry token there is for step 2
echo "==> Backing up the database"
compose up -d --wait db </dev/null
backup_database before-deploy "$(running_version)"
echo "Saved $PWD/$backup_path"

# 2. The image. A rollback to an image kept on this server needs no registry
if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "==> Pulling $image"
  # A throwaway docker config: the short-lived token never stays on the server
  docker_config="$(mktemp -d)"
  trap 'rm -rf "$docker_config"' EXIT
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
curl -fsS --retry 5 --retry-delay 2 --retry-all-errors http://127.0.0.1:3000/health
echo

# 6. Disk: keep the newest backups, and only this image and the previous one,
#    for a manual rollback. Copies taken before a restore stay until removed by hand
find "$backups_dir" -maxdepth 1 -name 'before-deploy_*.dump' | sort -r | tail -n +"$((keep_backups + 1))" | while read -r old; do
  rm -f "$old"
done

deployed="$(cat deployed-tag 2>/dev/null || true)"
if [ "$deployed" != "$tag" ]; then
  if [ -n "$deployed" ]; then
    echo "$deployed" > previous-tag
  fi
  echo "$tag" > deployed-tag
fi
previous="$(cat previous-tag 2>/dev/null || true)"
docker image ls "$repo" --format '{{.Tag}}' | while read -r old; do
  if [ "$old" != "$tag" ] && [ "$old" != "$previous" ] && [ "$old" != "<none>" ]; then
    docker image rm "$repo:$old" >/dev/null || echo "Warning: could not remove $repo:$old" >&2
  fi
done
docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/PMtwit/personal-crm" >/dev/null

echo "==> Deployed $image (previous: ${previous:-none})"
