#!/bin/bash
# Deploy the Go API+UI (docker/go.Dockerfile) to production.
# Does not place Webull orders. Rebuilds stonks-server from this repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! git diff-index --quiet HEAD --; then
  echo "uncommitted changes; commit first"
  git status --short
  exit 1
fi

echo "push origin main"
git push origin main

ssh -o BatchMode=yes ubuntu@146.235.212.239 'set -euo pipefail
cd ~/stonks
git fetch origin
git reset --hard origin/main
echo "server commit $(git rev-parse --short HEAD)"
docker compose build server caddy
docker compose up -d server caddy
'

echo "wait for https://mktorder.com/api/status"
for i in $(seq 1 18); do
  body=$(curl -fsS -m 10 https://mktorder.com/api/status || true)
  echo "try $i: $body"
  if echo "$body" | grep -q '"status":"ok"'; then
    echo "$body"
    exit 0
  fi
  sleep 5
done
echo "API did not become ready"
exit 1
