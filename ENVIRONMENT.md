# Environment

Secrets live **outside git**. Production file: `/home/ubuntu/stonks-config/.env` (`chmod 600`, directory `chmod 700`). Compose mounts it via `env_file`. Template: [`.env.example`](.env.example).

Local run uses process env (`ADMIN_PASSWORD`, API keys, Webull). Empty `ADMIN_PASSWORD` disables auth only outside production.

## Required in production

```
ADMIN_USERNAME
ADMIN_PASSWORD
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

At least one market-data key: `ALPHA_VANTAGE_API_KEY`, `FINNHUB_API_KEY`, `TWELVE_DATA_API_KEY`, `POLYGON_API_KEY`.

Webull autotrade: `WEBULL_APP_KEY`, `WEBULL_APP_SECRET`, `WEBULL_ACCOUNT_ID`. `WEBULL_ENABLE_LIVE_TEST_BUY` is opt-in (unset = off).

MCP: `MCP_BEARER_TOKENS`, `MCP_ALLOWED_ORIGINS`.

After editing the VPS env file recreate containers (`docker compose up -d`), do not `restart` — restart does not reload `env_file`.

## CSRF model

There is no separate CSRF token, and that is deliberate. The session cookie is
`HttpOnly` with `SameSite=Lax`, and every mutating method (`POST`, `PUT`,
`PATCH`, `DELETE`) on a `/api/` path additionally goes through the `Origin` /
`Sec-Fetch-Site` check in `go/internal/httpapi/ratelimit.go`. A cross-site form
post therefore carries no cookie, and a cross-site `fetch` is rejected on the
origin check before it reaches a handler. Note the shape of that check: a
request with neither an `Origin` nor a `Sec-Fetch-Site: cross-site` header is
allowed through — a browser always sends one of them on a cross-site request,
so this only lets non-browser clients (curl, the MCP binary) work, and
`SameSite=Lax` is what stops the browser case.

The consequence to be aware of: the endpoints that send live orders
(`POST /api/autotrade/execute`, `.../close-position`, `.../test-buy`) sit behind
exactly this level of protection and no more — the same as reading settings.
The live test-buy endpoints stay off unless `WEBULL_ENABLE_LIVE_TEST_BUY` /
`ROBINHOOD_ENABLE_LIVE_TEST_BUY` are explicitly `true`, and both cap the
quantity (`WEBULL_LIVE_TEST_BUY_MAX_QUANTITY`,
`ROBINHOOD_LIVE_TEST_BUY_MAX_QUANTITY`, default 1, hard limit 100).

`TRUST_PROXY` must be enabled **only** when Caddy really terminates the
connection in front of the process. With it on, the login rate limiter keys on
`X-Forwarded-For`; if anything can reach the process directly, an attacker sets
that header freely and the limiter stops existing.

The SQLite file holds the Webull token and the Robinhood OAuth pair in the
clear. `store.Open` forces the file (and its `-wal` / `-shm` siblings) to `0600`
and the directory to `0700` on every start, so it is no looser than the `.env`
carrying the same secrets.
