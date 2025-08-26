FROM node:20-bookworm-slim
WORKDIR /app

# Prefer IPv6 for IPv6-only hosts and use a resilient npm mirror by default
ARG NPM_REGISTRY=https://registry.npmmirror.com/
ENV NODE_OPTIONS="--dns-result-order=ipv6first --max-old-space-size=256" \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FETCH_RETRIES=6 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_TIMEOUT=30000 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=1000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=45000 \
    NPM_CONFIG_REGISTRY=${NPM_REGISTRY}

COPY server/package*.json ./server/
# Robust npm ci with retries to avoid transient DNS/network hangs (IPv6-friendly)
RUN set -e; cd server; npm config set registry "${NPM_CONFIG_REGISTRY}"; for i in 1 2 3 4 5; do \
      npm ci --no-audit --no-fund --omit=dev && break; \
      echo "npm ci failed (attempt $i), retrying..."; sleep $((i*3)); \
    done

COPY server ./server
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# Inject build id into runtime image (available to server via process.env.BUILD_ID)
ARG BUILD_ID=dev
ENV BUILD_ID=$BUILD_ID
# Ensure dotenv loads if mounted .env present at /app/.env
ENV NODE_ENV=production

ENV PORT=3001 \
    DATASETS_DIR=/data/datasets \
    SETTINGS_FILE=/data/state/settings.json \
    WATCHES_FILE=/data/state/telegram-watches.json \
    SPLITS_FILE=/data/state/splits.json
EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/server.js"]


