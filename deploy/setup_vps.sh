#!/usr/bin/env bash
# One-time setup on the VPS (run with sudo): the site's folders, and a services folder in Caddy that this
# site and any later one drop a snippet into.
#   ssh contabo mkdir -p pod-checker-setup && scp deploy/setup_vps.sh deploy/pod.caddy contabo:pod-checker-setup/
#   ssh -t contabo sudo bash pod-checker-setup/setup_vps.sh
set -euo pipefail
USER_NAME=${SUDO_USER:-apollo}
CADDYFILE=/etc/caddy/Caddyfile
HERE=$(dirname "$(readlink -f "$0")")
IMPORT="import /etc/caddy/services/*.caddy"

install -d -o "$USER_NAME" -g "$USER_NAME" /srv/pod-checker /srv/pod-checker/releases
install -d /etc/caddy/services
install -m 644 "$HERE/pod.caddy" /etc/caddy/services/pod.caddy

BACKUP="$CADDYFILE.bak.$(date +%Y%m%d%H%M%S)"
cp "$CADDYFILE" "$BACKUP"
if ! grep -qF "$IMPORT" "$CADDYFILE"; then
	# beside the existing import, inside the site block and before its catch-all handle
	awk -v line="	$IMPORT" '{ print } /^\timport \/etc\/caddy\/play\.caddy/ { print line }' "$CADDYFILE" > "$CADDYFILE.new"
	grep -qF "$IMPORT" "$CADDYFILE.new" || { echo "could not place the import" >&2; rm -f "$CADDYFILE.new"; exit 1; }
	mv "$CADDYFILE.new" "$CADDYFILE"
fi
if ! caddy validate --config "$CADDYFILE" --adapter caddyfile; then
	cp "$BACKUP" "$CADDYFILE"
	rm -f /etc/caddy/services/pod.caddy
	echo "invalid config: Caddyfile restored, nothing reloaded" >&2
	exit 1
fi
systemctl reload caddy

cat > /srv/README.md <<'DOC'
# Services on this server

Everything is served by Caddy at https://169-58-71-242.sslip.io/

| Path | Service | Files | Deployed by |
|---|---|---|---|
| /play/ | Battle Factory | /srv/battle-arcade | battle-arcade repo, deploy/deploy.sh |
| /pod/ | Pod Deck Checker | /srv/pod-checker | deck_building_rules repo, deploy/deploy.sh |
| / | Training dashboard, Google login | /srv/rl-dashboard | scripts/dashboard_export.py |

## Adding a service
1. Files in /srv/<name>/releases/<timestamp>, with a symlink to the live release, switched by rename.
2. Its routes in /etc/caddy/services/<name>.caddy, kept in that service's repo under deploy/.
3. `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && sudo systemctl reload caddy`
DOC
echo "ok: /pod/ is served from /srv/pod-checker/site. Now run deploy/deploy.sh"
