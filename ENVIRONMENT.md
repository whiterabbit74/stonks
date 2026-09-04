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
