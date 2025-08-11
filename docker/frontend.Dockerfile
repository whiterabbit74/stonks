# --- Frontend build stage ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install deps
COPY package*.json ./
# Stabilize npm and install deps
RUN npm i -g npm@latest \
  && npm config set fund false \
  && npm config set audit false \
  && npm config set fetch-retries 5 \
  && npm config set fetch-timeout 120000 \
  && npm config set fetch-retry-maxtimeout 180000 \
  && npm config set registry https://registry.npmjs.org/ \
  && npm ci --no-audit --no-fund --include=dev --registry=https://registry.npmjs.org/

# Copy source and build
COPY . .
ARG PUBLIC_BASE_PATH=/
ARG VITE_API_BASE=/api
ARG VITE_BUILD_ID=dev
ENV PUBLIC_BASE_PATH=$PUBLIC_BASE_PATH
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_BUILD_ID=$VITE_BUILD_ID
RUN PUBLIC_BASE_PATH=$PUBLIC_BASE_PATH VITE_API_BASE=$VITE_API_BASE npm run build

# --- Runtime stage (nginx) ---
FROM nginx:stable
WORKDIR /usr/share/nginx/html

# Copy built assets under base path
ARG PUBLIC_BASE_PATH=/
RUN mkdir -p "/usr/share/nginx/html${PUBLIC_BASE_PATH}"
COPY --from=builder /app/dist "/usr/share/nginx/html${PUBLIC_BASE_PATH}"

# Nginx config (proxy /api → server:3001)
COPY ./docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]


