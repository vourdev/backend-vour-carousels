#!/bin/sh
# Installed on the VPS at /usr/local/bin/ci-deploy-backend and pinned there by
# authorized_keys, so the CI deploy key for this repo has no shell -- the worst it can do
# is what is written here.
#
# WHY NOT `docker save | ssh`, AND WHY NOT `npm ci` ON THE BOX
# The uplink drops 12-60% of this box's outbound packets, and that breaks bulk transfers
# in BOTH directions: an inbound transfer still needs the box to ACK, and when the ACKs
# are what is lost the sender's window collapses. Measured 25 Aug 2026: 36 KB/s sustained
# (30 MB in 14m28s). This image is 2.6 GB because of the Playwright browsers, so streaming
# it is not on the table, and `npm ci` here does not finish either -- a single npm
# metadata request burns the full 30s timeout.
#
# So the runner builds, rsyncs only what changed into $APP_DIR, and this script assembles
# the image from a base that already sits on this disk. The Playwright browsers live in
# that base and are never transferred.
#
# Two modes, dispatched on SSH_ORIGINAL_COMMAND:
#   rsync --server ...   -> write-only rsync into $APP_DIR, via rrsync
#   deploy <40-hex sha>  -> build the image from $APP_DIR and roll the service
set -eu

SERVICE=vour-backend-carousels-generator-2usphl
BASE=vour-backend-base:pw1.62.1
APP_DIR=/opt/vour-backend/app
ENV_FILE=/opt/vour-backend/.env
NETWORK=dokploy-network
PUBLISH=3002
SLIDES_SRC=/var/lib/vour/slides
SLIDES_DST=/data/slides
# The browsers baked into $BASE are Playwright 1.62.1's. A node_modules built against a
# different playwright would launch a browser that is not there, at runtime, on the first
# capture -- so it is refused here instead.
PW_VERSION=1.62.1
KEEP_IMAGES=3

log() { echo "[deploy] $*"; }

cmd=${SSH_ORIGINAL_COMMAND:-}

# --- rsync mode ------------------------------------------------------------------
# rrsync is rsync's own restricted wrapper. -wo is write-only: it refuses --sender, so
# this key can push files in and never read anything back out of the box.
case "$cmd" in
  "rsync --server "*)
    mkdir -p "$APP_DIR"
    exec /usr/bin/rrsync -wo "$APP_DIR"
    ;;
esac

# --- deploy mode -----------------------------------------------------------------
case "$cmd" in
  "deploy "*) TAG=${cmd#deploy } ;;
  *) log "unknown command"; exit 1 ;;
esac

# The tag names the image that will run, and it arrived over the network, so it is
# checked rather than trusted: a commit sha and nothing else.
case "$TAG" in
  *[!0-9a-f]*|"") log "refusing tag '$TAG' -- expected a 40-character commit sha"; exit 1 ;;
esac
[ "${#TAG}" -eq 40 ] || { log "refusing tag '$TAG' -- expected a 40-character commit sha"; exit 1; }

[ -f "$APP_DIR/dist/server.js" ] || { log "no dist/server.js in $APP_DIR -- rsync the build first"; exit 1; }
[ -r "$ENV_FILE" ] || { log "missing $ENV_FILE"; exit 1; }

SYNCED_PW=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
            "$APP_DIR/node_modules/playwright-core/package.json" 2>/dev/null | head -1)
[ "$SYNCED_PW" = "$PW_VERSION" ] || {
  log "playwright-core is $SYNCED_PW but $BASE carries browsers for $PW_VERSION"
  log "rebuild the base from an image built with the new playwright, then bump PW_VERSION here"
  exit 1
}

IMAGE="$SERVICE:$TAG"
log "building $IMAGE from $APP_DIR (playwright $SYNCED_PW)"

docker build -t "$IMAGE" -f - "$APP_DIR" <<DOCKERFILE
FROM $BASE
WORKDIR /app
COPY . /app
EXPOSE 3000 3001
CMD ["node", "dist/server.js"]
DOCKERFILE

# Secrets live on this box and never travel to GitHub, so they are read at deploy time
# rather than injected by the workflow.
#
# Two loops rather than one, because `docker service create` wants --env and
# `docker service update` wants --env-add, and sh has no arrays to rewrite a flag across a
# saved list.
#
# `|| [ -n "$line" ]` is not decoration: a .env whose last line has no terminating newline
# loses that line to a bare `read`, which is exactly how a key went missing from this file
# once already.

if docker service inspect "$SERVICE" >/dev/null 2>&1; then
  log "updating existing service"
  set --
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key=${line%%=*}; val=${line#*=}
    case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
    [ -n "$val" ] || continue
    val=$(printf '%s' "$val" | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")
    set -- "$@" --env-add "$key=$val"
  done < "$ENV_FILE"
  log "applying $(( $# / 2 )) environment values"
  docker service update \
    --image "$IMAGE" \
    "$@" \
    --update-order start-first \
    --update-failure-action rollback \
    "$SERVICE"
else
  log "creating service"
  set --
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key=${line%%=*}; val=${line#*=}
    case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
    [ -n "$val" ] || continue
    val=$(printf '%s' "$val" | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")
    set -- "$@" --env "$key=$val"
  done < "$ENV_FILE"
  log "applying $(( $# / 2 )) environment values"
  # Port 3001 is the automation API and is deliberately NOT published: it is reachable
  # only over the overlay network, from n8n and the frontend. Only 3000 is exposed, and
  # nginx is what puts it on the internet.
  docker service create \
    --name "$SERVICE" \
    --network "$NETWORK" \
    --publish "published=$PUBLISH,target=3000" \
    --mount "type=bind,source=$SLIDES_SRC,target=$SLIDES_DST" \
    --limit-memory 6G \
    --reserve-memory 2G \
    --restart-condition any \
    "$@" \
    "$IMAGE"
fi

log "replicas: $(docker service ls --filter name=$SERVICE --format '{{.Replicas}}')"

# Every deploy leaves another ~2.6 GB image behind (mostly shared layers, but still).
# Keep the last few for a manual rollback and drop the rest; the running one is never
# untagged because docker refuses.
docker images "$SERVICE" --format '{{.Repository}}:{{.Tag}}' \
  | grep -v ':rollback' \
  | tail -n +$(( KEEP_IMAGES + 1 )) \
  | while IFS= read -r old; do
      docker rmi "$old" >/dev/null 2>&1 && log "removed $old" || true
    done

log "done"
