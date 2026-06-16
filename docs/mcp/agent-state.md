# MCP Agent State

## Ports

- `stonks-mcp` listens on container port `8080`.
- No host port is published for MCP. Public access goes through Caddy at `https://tradingibs.site/mcp/transcribe/`.
- Keep the MCP container port at `8080` unless an explicit migration is planned.
- Local smoke-test server also used `127.0.0.1:8080`; it was stopped after verification.

## Subagents

- None used. Status: closed.
