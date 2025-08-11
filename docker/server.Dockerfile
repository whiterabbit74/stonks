FROM node:20-bookworm-slim
WORKDIR /app

# Prefer IPv4 DNS resolution inside node/npm to avoid IPv6-only DNS stalls
ENV NODE_OPTIONS=--dns-result-order=ipv4first \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FETCH_RETRIES=6 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_TIMEOUT=120000 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=1000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=180000 \
    NPM_CONFIG_REGISTRY=https://registry.npmjs.org/

COPY server/package*.json ./server/
# Robust npm ci with retries to avoid transient DNS/network hangs
RUN set -e; cd server; for i in 1 2 3 4 5; do \
      npm ci --no-audit --no-fund --omit=dev --registry=https://registry.npmjs.org/ && break; \
      echo "npm ci failed (attempt $i), retrying..."; sleep $((i*3)); \
    done

COPY server ./server
# Inject build id into runtime image (available to server via process.env.BUILD_ID)
ARG BUILD_ID=dev
ENV BUILD_ID=$BUILD_ID
# Ensure dotenv loads if mounted .env present at /app/.env
ENV NODE_ENV=production

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server/server.js"]


