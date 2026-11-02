#!/usr/bin/env bash
set -euo pipefail

revision="${GITHUB_SHA:-$(git rev-parse HEAD)}"
image="aegis-mission-control:${revision}"
container="aegis-mission-demo"
previous_image="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"

run_image() {
  docker run -d --name "$container" --restart unless-stopped \
    --read-only --cap-drop=ALL --pids-limit=64 --memory=256m \
    -p 127.0.0.1:3010:3000 "$1" >/dev/null
}

restore_previous() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  if [[ -n "$previous_image" ]]; then
    run_image "$previous_image"
    printf 'Deployment failed; restored previous image.\n' >&2
  else
    printf 'Deployment failed; no previous image to restore.\n' >&2
  fi
  exit 1
}

docker build --build-arg "SOURCE_REVISION=$revision" -t "$image" .
if docker container inspect "$container" >/dev/null 2>&1; then
  docker rm -f "$container" >/dev/null
fi
run_image "$image" || restore_previous

for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:3010/api/system/version 2>/dev/null \
      | grep -Fq "\"revision\":\"$revision\""; then
    printf 'Deployed %s on http://127.0.0.1:3010\n' "$revision"
    exit 0
  fi
  sleep 1
done

restore_previous
