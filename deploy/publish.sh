#!/usr/bin/env bash
# Runs on the server, every 5 minutes from the user's crontab, in a clone of this repo:
#   */5 * * * * flock -n /srv/pod-checker/publish.lock /srv/pod-checker/repo/deploy/publish.sh >> /srv/pod-checker/publish.log 2>&1
# Publishes origin/main when it moved. The release is built next to the live one and switched in with one
# rename; the last 3 are kept. Files unchanged since the live release are hard links, so a release costs what changed.
set -euo pipefail

tmp=""
trap '[ -z "$tmp" ] || rm -rf "$tmp"' EXIT

# all in a function: git replaces this very file below, and bash would otherwise keep reading the new one
main() {
  cd /srv/pod-checker/repo
  git fetch -q origin main
  local sha last rel
  sha=$(git rev-parse origin/main)
  last=$(cat ../published 2>/dev/null || true)
  [ "$sha" != "$last" ] || return 0

  tmp=$(mktemp -d)
  git archive "$sha" app rules data server | tar -x -C "$tmp"
  rel=$(date +%Y%m%d-%H%M%S)
  # backend: only once Jorge has made the env file; every step runs before the switch, so a failure (set -e) keeps the old release live
  local V=/srv/pod-checker/venv env=/srv/pod-checker/pod-api.env backend=0
  if [ -f "$env" ]; then
    backend=1
    [ -x "$V/bin/python" ] || python3 -m venv "$V"
    if ! cmp -s "$tmp/server/requirements.txt" "$V/requirements.txt"; then
      "$V/bin/pip" install -q -r "$tmp/server/requirements.txt"
      cp "$tmp/server/requirements.txt" "$V/requirements.txt"
    fi
    (cd "$tmp/server" && set -a && . "$env" && set +a && export PYTHONDONTWRITEBYTECODE=1 && "$V/bin/python" manage.py migrate --noinput && "$V/bin/python" manage.py collectstatic --noinput)
  else
    echo "$(date -Is) no $env yet: backend steps skipped"
  fi
  # compared by content: git archive stamps every file with the commit time, which would defeat the hard links
  rsync -rlc --chmod=D755,F644 --link-dest=/srv/pod-checker/site/ "$tmp/" "/srv/pod-checker/releases/$rel/"
  ln -sfn "releases/$rel" ../site.new
  mv -T ../site.new ../site
  [ "$backend" = 0 ] || XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart pod-api || echo "$(date -Is) pod-api not restarted (unit missing?)"
  (cd ../releases && ls -1d */ | sort | head -n -3 | while read -r old; do rm -r -- "./$old"; done)
  echo "$sha" > ../published
  git merge -q --ff-only "$sha"
  echo "$(date -Is) live: releases/$rel ($sha)"
}
main
exit
