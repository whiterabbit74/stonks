# Trading Backtester Server

Простой Express сервер для хранения датасетов торгового бэктестера.

## Установка и запуск

1. Установите зависимости:
```bash
cd server
npm install
```

2. Запустите сервер:
```bash
npm run dev
```

Сервер будет доступен на `http://localhost:3001`

## Безопасность
- В продакшене необходимо задать переменную `ADMIN_PASSWORD`. Если она не задана, сервер вернёт 503 для защищённых эндпоинтов.
- Ключи провайдеров (ALPHA_VANTAGE_API_KEY, FINNHUB_API_KEY, TWELVE_DATA_API_KEY, POLYGON_API_KEY) задавайте через переменные окружения, не храните их в коде.
- Включены базовые заголовки безопасности через Helmet.

## API Endpoints

- `GET /api/status` - Статус сервера
- `GET /api/datasets` - Список всех датасетов (только метаданные)
- `GET /api/datasets/:id` - Получить конкретный датасет с данными
- `POST /api/datasets` - Сохранить новый датасет
- `PUT /api/datasets/:id` - Обновить существующий датасет
- `DELETE /api/datasets/:id` - Удалить датасет

## Структура данных

Датасеты хранятся в папке `server/datasets/` в формате JSON.

Каждый файл содержит:
```json
{
  "name": "AAPL_2024-01-15",
  "ticker": "AAPL",
  "uploadDate": "2024-01-15T10:30:00.000Z",
  "dataPoints": 1000,
  "dateRange": {
    "from": "2023-01-01",
    "to": "2024-01-01"
  },
  "data": [
    {
      "date": "2023-01-01T00:00:00.000Z",
      "open": 100.0,
      "high": 105.0,
      "low": 99.0,
      "close": 103.0,
      "volume": 1000000
    }
  ]
}
```