#!/usr/bin/env bash
# Publish the last commit to the VPS (after the one-time deploy/setup_vps.sh):
#   deploy/deploy.sh            DEPLOY_HOST (default contabo)
# The release is uploaded next to the live one and switched in with one rename; the last 3 are kept.
# Files unchanged since the live release are hard links, so a release costs only what changed.
set -euo pipefail
HOST=${DEPLOY_HOST:-contabo}
cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive HEAD app rules data | tar -x -C "$TMP"
rm -f "$TMP/data/pod_decks.sqlite"

REL=$(date +%Y%m%d-%H%M%S)
rsync -a --chmod=D755,F644 --link-dest=/srv/pod-checker/site/ "$TMP/" "$HOST:/srv/pod-checker/releases/$REL/"
ssh "$HOST" bash -s -- "$REL" <<'REMOTE'
set -euo pipefail
cd /srv/pod-checker
ln -sfn "releases/$1" site.new
mv -T site.new site
cd releases && ls -1d */ | sort | head -n -3 | while read -r old; do rm -r -- "./$old"; done
echo "live: releases/$1"
REMOTE
echo "https://169-58-71-242.sslip.io/pod/"
