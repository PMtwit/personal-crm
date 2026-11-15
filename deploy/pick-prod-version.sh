#!/usr/bin/env bash
# Runs in GitHub Actions ("Deploy prod"), not on the server. Picks the commit to
# deploy to prod and makes sure it passed the test stand: GitHub keeps the
# history of deploys of each environment, and a deploy of that commit to
# staging must have gone green. Prints the full commit SHA: images are tagged
# with full SHAs.
#
#   pick-prod-version.sh [sha]    no sha: the newest green deploy to the test stand
#
# Needs GH_TOKEN (deployments: read, contents: read) and GITHUB_REPOSITORY.
# A rollback does not come here: the server knows where it goes
set -euo pipefail

requested="$(tr -d '[:space:]' <<<"${1:-}" | tr 'A-F' 'a-f')"
api="repos/$GITHUB_REPOSITORY"

# True when this deploy went green. A green deploy later turns "inactive" once
# a newer one goes green, so every status counts, not only the last one
went_green() {
  local states
  states="$(gh api "$api/deployments/$1/statuses?per_page=100" --jq '.[].state')"
  grep -qx success <<<"$states"
}

if [ -z "$requested" ]; then
  # Newest first
  deploys="$(gh api "$api/deployments?environment=staging&per_page=100" --jq '.[] | "\(.id) \(.sha)"')"
  # The list comes on its own descriptor: gh inside the loop never eats it
  while read -r -u 3 id sha; do
    if [ -n "$id" ] && went_green "$id"; then
      echo "$sha"
      exit 0
    fi
  done 3<<<"$deploys"
  echo "No green deploy to the test stand among the last 100: nothing to deploy" >&2
  exit 1
fi

if ! [[ "$requested" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "'$requested' is not a commit SHA: nothing changed" >&2
  exit 1
fi
if ! sha="$(gh api "$api/commits/$requested" --jq .sha 2>/dev/null)"; then
  echo "No commit $requested in this repository: nothing changed" >&2
  exit 1
fi
for id in $(gh api "$api/deployments?environment=staging&sha=$sha&per_page=100" --jq '.[].id'); do
  if went_green "$id"; then
    echo "$sha"
    exit 0
  fi
done
echo "Commit $sha has not passed the test stand: it never had a green deploy to staging. Nothing changed" >&2
exit 1
