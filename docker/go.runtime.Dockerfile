# Runtime-only image: the linux/amd64 binary is cross-compiled on the
# developer machine. The VPS must never run `go build`.
# Pinned by digest: a mutable tag would let the registry hand the VPS a
# different base on the next deploy without any change in this checkout.
# Refresh: docker manifest inspect -v debian:bookworm-slim | grep Digest
FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171
# tzdata is for the image; the binary also embeds time/tzdata for America/New_York.
RUN apt-get update -qq && apt-get install -y --no-install-recommends ca-certificates curl tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY mktorder /app/mktorder
COPY web /app/web
RUN chmod 0755 /app/mktorder \
    && mkdir -p /data/db /data/datasets /data/state \
    && chown -R app:app /app /data
ENV PORT=3001 \
    GOAPP_ROOT=/app \
    DB_FILE=/data/db/trading.db \
    NODE_ENV=production
EXPOSE 3001
USER app
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD curl -fsS http://127.0.0.1:3001/readyz >/dev/null || exit 1
CMD ["/app/mktorder"]
