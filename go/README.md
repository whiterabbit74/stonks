# Go rewrite (sibling of the live Node/React app)

See [INVENTORY.md](INVENTORY.md) for the 1:1 mapping of pages, `/api` routes, engines, scheduler jobs, and tests.

## Run locally

```bash
cd go
go test ./...
go run ./cmd/server
```

Listens on `:8080` (override with `PORT`). Serves API + `web/`. Does not replace `src/` or `server/`.

Goldens: `npx vite-node scripts/dump-go-goldens.ts` from the repo root (uses the shipped TypeScript engines).

Auth: same as Express — if `ADMIN_PASSWORD` is empty, local auth is disabled. Set it to require the `auth_token` cookie.

SQLite is CGO-free (`modernc.org/sqlite`).
