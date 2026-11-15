#!/usr/bin/env bash
# Runs in GitHub Actions after a green "Deploy prod", not on the server. Keeps
# the newest 10 builds of the app image in GHCR and deletes the older ones.
# One build is three versions of the package: the image list tagged with the
# commit SHA, and two untagged versions it lists (the image for linux/amd64 and
# its build record). A build goes as a whole; nothing a kept build lists is
# deleted. The server keeps its own copies of the versions it may need.
#
# Needs GH_TOKEN with packages: write, and docker logged in to ghcr.io
set -euo pipefail
# A failed docker or gh call inside $(...) stops the script too
shopt -s inherit_errexit

keep=10
image=ghcr.io/pmtwit/personal-crm
versions_api="users/PMtwit/packages/container/personal-crm/versions"

# Every version of the package: id, digest, creation time, tags
all="$(gh api --paginate "$versions_api?per_page=100" --jq '.[] | [.id, .name, .created_at, (.metadata.container.tags | join(","))] | @tsv')"
# Builds, newest first
builds="$(awk -F '\t' '$4 != ""' <<<"$all" | sort -t $'\t' -k3,3r)"
count="$(grep -c . <<<"$builds" || true)"
if [ "$count" -le "$keep" ]; then
  echo "GHCR has $count builds, keeps up to $keep: nothing to delete"
  exit 0
fi

# The digests an image list names
listed_digests() {
  docker buildx imagetools inspect --raw "$image@$1" | jq -r '.manifests[]?.digest'
}

# What the kept builds need
needed="$(
  head -n "$keep" <<<"$builds" | while IFS=$'\t' read -r _ digest _ _; do
    echo "$digest"
    listed_digests "$digest" </dev/null
  done
)"

# The rest goes: the tagged version first, then what it lists. Lists come on
# their own descriptors: docker and gh inside the loops never eat them
deleted=0
while IFS=$'\t' read -r -u 3 _ digest _ tags; do
  echo "Deleting build $tags"
  parts="$(
    echo "$digest"
    listed_digests "$digest"
  )"
  while read -r -u 4 part; do
    if grep -qxF -- "$part" <<<"$needed"; then
      continue
    fi
    id="$(awk -F '\t' -v digest="$part" '$2 == digest { print $1 }' <<<"$all")"
    if [ -n "$id" ]; then
      gh api --silent -X DELETE "$versions_api/$id"
    fi
  done 4<<<"$parts"
  deleted=$((deleted + 1))
done 3< <(tail -n +"$((keep + 1))" <<<"$builds")

echo "GHCR keeps the newest $keep builds, deleted $deleted older ones"
