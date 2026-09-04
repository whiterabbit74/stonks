#!/bin/bash
# Deploy a pre-built linux/amd64 Go image. The VPS never compiles.
# Usage: ./deploy.sh
set -euo pipefail

HOST="${DEPLOY_HOST:-ubuntu@146.235.212.239}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-~/stonks}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "DEPLOY"
echo "======"

if ! git diff-index --quiet HEAD --; then
  echo "Uncommitted changes — commit first:"
  git status --short
  exit 1
fi

echo "Sync GitHub..."
git fetch origin
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "Local main has diverged from origin/main. Run: git pull --rebase origin main"
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  git push origin main
  git fetch origin
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "GitHub did not receive HEAD"
  exit 1
fi

GIT_COMMIT="$(git rev-parse --short HEAD)"
GIT_FULL="$(git rev-parse HEAD)"
GIT_DATE="$(git log -1 --format=%cd --date=format:'%Y-%m-%d %H:%M:%S')"
IMAGE="stonks-server:${GIT_COMMIT}"
echo "Version ${GIT_COMMIT}  ${GIT_DATE}"

if ! command -v docker >/dev/null; then
  echo "docker is required on this machine to build the amd64 image"
  exit 1
fi
if ! command -v go >/dev/null; then
  echo "go is required to cross-compile linux/amd64"
  exit 1
fi

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/stonks-deploy.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

echo "Cross-compile linux/amd64..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -C go -trimpath -ldflags="-s -w" -o "${STAGE}/mktorder" ./cmd/server
chmod 0755 "${STAGE}/mktorder"
cp -a go/web "${STAGE}/web"
cp docker/go.runtime.Dockerfile "${STAGE}/Dockerfile"

echo "Build runtime image ${IMAGE}..."
docker build --platform linux/amd64 -t "${IMAGE}" -t stonks-server:latest "$STAGE"

echo "Send image to ${HOST}..."
docker save "${IMAGE}" | gzip -1 | ssh -o BatchMode=yes "$HOST" "gunzip | docker load && docker tag ${IMAGE} stonks-server:latest"

echo "Activate on server..."
ssh -o BatchMode=yes "$HOST" "set -euo pipefail
cd ${REMOTE_DIR}
git fetch origin
git reset --hard origin/main
echo server_git=\$(git rev-parse --short HEAD)
if [ \"\$(git rev-parse HEAD)\" != \"${GIT_FULL}\" ]; then
  echo 'server git SHA does not match local HEAD'
  exit 1
fi

if [ ! -f /home/ubuntu/stonks-config/.env ]; then
  echo 'missing /home/ubuntu/stonks-config/.env'
  exit 1
fi

BACKUP_DIR=~/stonks-backups
BACKUP_NAME=backup_\$(date +%Y%m%d_%H%M%S)
mkdir -p \"\$BACKUP_DIR/\$BACKUP_NAME/state\" \"\$BACKUP_DIR/\$BACKUP_NAME/db\"
resolve_volume_name() {
  local container_name=\"\$1\" destination=\"\$2\" fallback_suffix=\"\$3\" resolved=\"\"
  resolved=\$(docker inspect \"\$container_name\" --format '{{range .Mounts}}{{println .Destination \"\\t\" .Name \"\\t\" .Type}}{{end}}' 2>/dev/null | awk -v dest=\"\$destination\" '\$1 == dest && \$3 == \"volume\" { print \$2; exit }')
  if [ -z \"\$resolved\" ]; then
    resolved=\$(docker volume ls --format '{{.Name}}' | grep -E \"(^|_)\${fallback_suffix}\$\" | head -n 1 || true)
  fi
  printf '%s' \"\$resolved\"
}
backup_volume() {
  local actual_volume=\"\$1\" target_dir=\"\$2\" label=\"\$3\"
  if [ -n \"\$actual_volume\" ] && docker volume inspect \"\$actual_volume\" >/dev/null 2>&1; then
    echo \"backup \$label volume: \$actual_volume\"
    docker run --rm -v \"\$actual_volume:/source\" -v \"\$target_dir:/backup\" alpine sh -lc 'cp -a /source/. /backup/'
  else
    echo \"skip backup \$label: volume not found\"
  fi
}
STATE_VOLUME=\$(resolve_volume_name stonks-server /data/state stonks_state)
DB_VOLUME=\$(resolve_volume_name stonks-server /data/db stonks_db)
DATASETS_VOLUME=\$(resolve_volume_name stonks-server /data/datasets stonks_datasets)
backup_volume \"\$STATE_VOLUME\" \"\$BACKUP_DIR/\$BACKUP_NAME/state\" state
backup_volume \"\$DB_VOLUME\" \"\$BACKUP_DIR/\$BACKUP_NAME/db\" db
cd \"\$BACKUP_DIR\" && ls -dt backup_* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
echo \"backup \$BACKUP_NAME (db+state only)\"

# Runtime image runs as uid 10001. Named volumes created by older root
# containers stay root:root, so SQLite then fails with 'readonly database'.
fix_volume_owner() {
  local vol=\"\$1\"
  if [ -n \"\$vol\" ] && docker volume inspect \"\$vol\" >/dev/null 2>&1; then
    docker run --rm -v \"\$vol:/data\" alpine chown -R 10001:10001 /data
    echo \"chown 10001:10001 \$vol\"
  fi
}
fix_volume_owner \"\$STATE_VOLUME\"
fix_volume_owner \"\$DB_VOLUME\"
fix_volume_owner \"\$DATASETS_VOLUME\"

cd ${REMOTE_DIR}
if [ -f .env ]; then
  grep -q '^DOMAIN=' .env && sed -i 's|^DOMAIN=.*|DOMAIN=mktorder.com|' .env || printf '\\nDOMAIN=mktorder.com\\n' >> .env
fi
export SERVER_IMAGE=${IMAGE}
export BUILD_ID=${GIT_COMMIT}
docker compose up -d --no-build --force-recreate server
docker compose ps
"

echo "Wait for API..."
ok=0
for i in $(seq 1 15); do
  body="$(curl -fsS -m 8 https://mktorder.com/api/status 2>/dev/null || true)"
  if echo "$body" | grep -q '"status":"ok"'; then
    echo "$body"
    ok=1
    break
  fi
  echo "  [$i/15] not ready"
  sleep 2
done
if [ "$ok" != 1 ]; then
  echo "API did not become ready"
  exit 1
fi

if curl -s -I https://mktorder.com/ | grep -q "200"; then
  echo "site 200"
else
  echo "site not 200 yet"
fi

echo "Telegram notify..."
BOT_TOKEN="$(ssh -o BatchMode=yes "$HOST" "grep '^TELEGRAM_BOT_TOKEN=' /home/ubuntu/stonks-config/.env 2>/dev/null | cut -d= -f2-" || true)"
CHAT_ID="$(ssh -o BatchMode=yes "$HOST" "grep '^TELEGRAM_CHAT_ID=' /home/ubuntu/stonks-config/.env 2>/dev/null | cut -d= -f2-" || true)"
if [ -n "${BOT_TOKEN:-}" ] && [ -n "${CHAT_ID:-}" ]; then
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" \
    --data-urlencode "text=🚀 Сервер обновлен!

💻 Версия: ${GIT_COMMIT}
🕰 Дата: ${GIT_DATE}
🌐 Сайт: https://mktorder.com" >/dev/null || echo "telegram send failed"
else
  echo "telegram env missing"
fi

echo
echo "DONE ${GIT_COMMIT}  https://mktorder.com"
echo "VPS pulled a ready image — no compile on the server."
