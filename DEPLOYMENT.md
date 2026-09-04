# Deploy

`./deploy.sh` is the only production path.

1. Requires a clean git tree and GitHub in sync (pushes `main` if local is ahead).
2. Cross-compiles `linux/amd64` on the developer machine (`CGO_ENABLED=0 go build -C go`).
3. Packs the binary + `go/web` into `docker/go.runtime.Dockerfile`.
4. `docker save | ssh docker load` on `ubuntu@146.235.212.239`.
5. VPS `git reset --hard origin/main` and `docker compose up -d --no-build --force-recreate server`.
6. Health: `https://mktorder.com/api/status`.

The VPS never runs `go build` for the trading server. Compose `server` is image-only (`SERVER_IMAGE`).

Caddy proxies `/` and `/api` to `server:3001`, `/mcp/transcribe*` to `mcp:8080`.

```bash
./deploy.sh
./health-check.sh          # on the VPS
./backup-from-server.sh    # local copy of db/datasets/state
```
