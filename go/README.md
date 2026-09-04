# Go app

Live trading API + vanilla SPA. Mapping of pages, `/api`, engines, scheduler: [INVENTORY.md](INVENTORY.md).

```bash
cd go
go test ./...
ADMIN_PASSWORD=test go run ./cmd/server
```

Listens on `:8080` (`PORT`). Serves `/api` and `web/`. SQLite: `data/trading.db` (CGO-free, `modernc.org/sqlite`).

Auth: if `ADMIN_PASSWORD` is empty, local auth is off. Production compose fail-closes without a password.

Goldens live in `testdata/goldens/`. Do not hand-edit trade lists.
