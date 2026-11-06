#!/usr/bin/env bash
# Runs on the server, every 5 minutes from the user's crontab, in a clone of this repo:
#   */5 * * * * flock -n /srv/pod-checker/publish.lock /srv/pod-checker/repo/deploy/publish.sh >> /srv/pod-checker/publish.log 2>&1
# Publishes origin/main when it moved. The release is built next to the live one and switched in with one
# rename; the last 3 are kept. Files unchanged since the live release are hard links, so a release costs what changed.
set -euo pipefail

# all in a function: git replaces this very file below, and bash would otherwise keep reading the new one
main() {
  cd /srv/pod-checker/repo
  git fetch -q origin main
  local sha last tmp rel
  sha=$(git rev-parse origin/main)
  last=$(cat ../published 2>/dev/null || true)
  [ "$sha" != "$last" ] || return 0

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  git archive "$sha" app rules data | tar -x -C "$tmp"
  rm -f "$tmp/data/pod_decks.sqlite"
  rel=$(date +%Y%m%d-%H%M%S)
  # compared by content: git archive stamps every file with the commit time, which would defeat the hard links
  rsync -rlc --chmod=D755,F644 --link-dest=/srv/pod-checker/site/ "$tmp/" "/srv/pod-checker/releases/$rel/"
  ln -sfn "releases/$rel" ../site.new
  mv -T ../site.new ../site
  (cd ../releases && ls -1d */ | sort | head -n -3 | while read -r old; do rm -r -- "./$old"; done)
  echo "$sha" > ../published
  git merge -q --ff-only "$sha"
  echo "$(date -Is) live: releases/$rel ($sha)"
}
main
exit
