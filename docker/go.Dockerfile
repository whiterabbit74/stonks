FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go/go.mod go/go.sum ./
RUN go mod download
COPY go/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/mktorder ./cmd/server

FROM debian:bookworm-slim
RUN apt-get update -qq && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/mktorder /app/mktorder
COPY go/web /app/web
ARG BUILD_ID=dev
ENV BUILD_ID=$BUILD_ID \
    PORT=3001 \
    GOAPP_ROOT=/app \
    DB_FILE=/data/db/trading.db \
    NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD curl -fsS http://127.0.0.1:3001/api/status >/dev/null || exit 1
CMD ["/app/mktorder"]
