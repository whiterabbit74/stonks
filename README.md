# Trading strategies

Бэктестер и живой монитор IBS mean-reversion. Один Go-процесс отдаёт API и SPA. Прод: Caddy → `stonks-server:3001`.

## Стек

- Go (`go/cmd/server`) + SQLite (`modernc.org/sqlite`)
- Vanilla JS SPA (`go/web`)
- Caddy (TLS), отдельный MCP (`mcp/`)
- Провайдеры: Alpha Vantage, Finnhub, Twelve Data, Polygon, Webull OpenAPI

## Торговая логика IBS

- сделки только на закрытии сессии
- перед закрытием — актуальные IBS
- вход: тикер с минимальным IBS строго ниже порога (`ibs < 0.10`)
- выход: `ibs > 0.75` или лимит удержания
- пороги те же, что в бэктесте: `go/internal/ibs`

## Локально

```bash
cd go
go test ./...
ADMIN_PASSWORD=test go run ./cmd/server
```

http://localhost:8080 — логин `admin@example.com`. Порт: `PORT`. База: `go/data/trading.db`.

## Прод

```bash
./deploy.sh
```

Кросс-компиляция linux/amd64 на машине разработчика. VPS образ только загружает, `go build` там нет.

Секреты: `/home/ubuntu/stonks-config/.env`. Шаблон: `.env.example`.

## Документация

- [CLAUDE.md](CLAUDE.md) — инварианты (даты, IBS)
- [go/INVENTORY.md](go/INVENTORY.md) — страницы, `/api`, пакеты
- [ENVIRONMENT.md](ENVIRONMENT.md) — переменные
- [DEPLOYMENT.md](DEPLOYMENT.md) — деплой
- [PROVIDERS.md](PROVIDERS.md) — лимиты провайдеров
