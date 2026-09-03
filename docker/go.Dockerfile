FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go/go.mod go/go.sum ./
RUN go mod download
COPY go/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/mktorder ./cmd/server

FROM debian:bookworm-slim
RUN apt-get update -qq && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /out/mktorder /app/mktorder
COPY go/web /app/web
ARG BUILD_ID=dev
ENV BUILD_ID=$BUILD_ID \
    PORT=3001 \
    GOAPP_ROOT=/app \
    DB_FILE=/data/db/trading.db \
    NODE_ENV=production
# Writable state lives on volumes under /data. Empty named volumes inherit uid
# 10001 from these dirs; existing volumes must be chowned to 10001:10001.
RUN mkdir -p /data/db /data/datasets /data/state \
    && chown -R app:app /app /data
EXPOSE 3001
USER app
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD curl -fsS http://127.0.0.1:3001/api/status >/dev/null || exit 1
CMD ["/app/mktorder"]
