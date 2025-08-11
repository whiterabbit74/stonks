FROM node:20-bookworm-slim
WORKDIR /app

# Prefer IPv4 DNS resolution inside node/npm to avoid IPv6-only DNS stalls
ENV NODE_OPTIONS=--dns-result-order=ipv4first

# Stabilize npm in CI/builds and avoid known hangs (ignore upgrade failure if network flaky)
RUN npm i -g npm@latest || true \
  && npm config set fund false \
  && npm config set audit false \
  && npm config set fetch-retries 5 \
  && npm config set fetch-timeout 120000 \
  && npm config set fetch-retry-maxtimeout 180000 \
  && npm config set registry https://registry.npmjs.org/

COPY server/package*.json ./server/
RUN cd server && npm ci --no-audit --no-fund --omit=dev --registry=https://registry.npmjs.org/

COPY server ./server
# Inject build id into runtime image (available to server via process.env.BUILD_ID)
ARG BUILD_ID=dev
ENV BUILD_ID=$BUILD_ID
# Ensure dotenv loads if mounted .env present at /app/.env
ENV NODE_ENV=production

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server/server.js"]


