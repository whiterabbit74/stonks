# --- Frontend build stage ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Prefer IPv4 DNS resolution to reduce hangs and configure npm
ENV NODE_OPTIONS="--dns-result-order=ipv4first --max-old-space-size=768" \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FETCH_RETRIES=6 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_TIMEOUT=120000 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=1000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=180000 \
    NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/

# Install deps
COPY package*.json ./
# Install deps with retries (using robust mirror)
RUN set -e; for i in 1 2 3 4 5; do \
      npm ci --no-audit --no-fund --include=dev --registry=https://registry.npmmirror.com/ && break; \
      echo "npm ci failed (attempt $i), retrying..."; sleep $((i*3)); \
    done

# Copy source and build
COPY . .
ARG PUBLIC_BASE_PATH=/
ARG VITE_API_BASE=/api
ARG VITE_BUILD_ID=dev
ENV PUBLIC_BASE_PATH=$PUBLIC_BASE_PATH
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_BUILD_ID=$VITE_BUILD_ID
RUN PUBLIC_BASE_PATH=$PUBLIC_BASE_PATH VITE_API_BASE=$VITE_API_BASE VITE_BUILD_ID=$VITE_BUILD_ID npm run build

# --- Runtime stage (nginx) ---
FROM nginx:stable
WORKDIR /usr/share/nginx/html

# Copy built assets to web root
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config (proxy /api → server:3001)
COPY ./docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]


