# TradingIBS MCP

Go MCP server for the TradingIBS site. It exposes the first tool in the `/mcp/` namespace:

- `youtube.transcript.get` - fetches public YouTube captions/transcripts.

Production endpoint:

```text
https://tradingibs.site/mcp/transcribe/
```

The server requires `Authorization: Bearer <token>` on MCP requests. Tokens are configured through `MCP_BEARER_TOKENS` as a comma-separated list in `/home/ubuntu/stonks-config/.env`.

Local default port inside the container is `8080`.

Transcript payload defaults:

- `max_chars`: `500000`
- hard maximum `max_chars`: `1000000`
- `include_segments`: `false` by default to avoid doubling long transcript payloads with timestamp metadata.

For very long videos that exceed the model context or the single tool-result practical limit, add an export/cursor flow instead of raising this limit indefinitely.
