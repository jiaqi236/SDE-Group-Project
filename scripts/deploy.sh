#!/usr/bin/env bash
# Usage: deploy.sh <image> <tag> <host-port> <container-name>
#
# Runs on the target server (locally for Test, over SSH for Production).
#  - Production: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD and DB_SSL are exported by the
#    caller (Jenkins) and point to the Amazon RDS PostgreSQL instance.
#  - Test: DB_HOST is NOT set, so this script starts a PostgreSQL container next to the app.
# The new container is health-checked (/health includes the database). If it is unhealthy the
# previous image is restarted (rollback) and the script exits with an error.
set -euo pipefail

IMAGE="$1"; TAG="$2"; PORT="$3"; NAME="$4"
NETWORK_ARGS=()

if [ -z "${DB_HOST:-}" ]; then
  echo "DB_HOST not set -> starting a local PostgreSQL container for this environment."
  NETWORK="${NAME}-net"
  DB_CONTAINER="${NAME}-db"
  docker network create "$NETWORK" >/dev/null 2>&1 || true
  if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
    docker run -d --name "$DB_CONTAINER" --network "$NETWORK" --restart unless-stopped \
      -e POSTGRES_DB=campustask -e POSTGRES_USER=campustask -e POSTGRES_PASSWORD=testpassword \
      -v "${DB_CONTAINER}-data:/var/lib/postgresql/data" postgres:16-alpine >/dev/null
  fi
  for i in $(seq 1 30); do
    docker exec "$DB_CONTAINER" pg_isready -U campustask -d campustask >/dev/null 2>&1 && break
    sleep 2
  done
  export DB_HOST="$DB_CONTAINER" DB_PORT=5432 DB_NAME=campustask DB_USER=campustask DB_PASSWORD=testpassword DB_SSL=false
  NETWORK_ARGS=(--network "$NETWORK")
fi

PREV_IMAGE=$(docker inspect --format '{{.Config.Image}}' "$NAME" 2>/dev/null || true)

start_container() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped "${NETWORK_ARGS[@]}" -p "$PORT:3000" \
    -e DB_HOST -e DB_PORT -e DB_NAME -e DB_USER -e DB_PASSWORD -e DB_SSL "$1" >/dev/null
}

healthy() {
  for i in $(seq 1 20); do
    if curl -fs "http://localhost:$PORT/health" >/dev/null; then return 0; fi
    sleep 3
  done
  return 1
}

echo "Deploying $IMAGE:$TAG as $NAME on port $PORT (previous: ${PREV_IMAGE:-none})"
docker pull "$IMAGE:$TAG"
start_container "$IMAGE:$TAG"

if healthy; then
  echo "Deployment healthy (app and database)."
  exit 0
fi

echo "Health check FAILED."
docker logs --tail 30 "$NAME" || true
if [ -n "$PREV_IMAGE" ]; then
  echo "Rolling back to $PREV_IMAGE"
  start_container "$PREV_IMAGE"
  if healthy; then echo "Rollback successful."; else echo "Rollback also unhealthy!"; fi
else
  echo "No previous version to roll back to."
fi
exit 1
