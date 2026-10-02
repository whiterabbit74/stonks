# sites/mktorder_com
Пропуски: .git, go/web/vendor, go/web/fonts, go/testdata, output, *_test.go.
go/web/css/app.css:L1-L1: shrink: одна строка Tailwind ~80 КБ, около 435 правил (~30 КБ) нигде не встречаются, включая keyframes fade-in, hover-lift, shimmer, high-contrast. Выкинуть неиспользуемые селекторы, оставить классы из app.js и extra.css.
go/internal/metrics/metrics.go:L12-L383: yagni: Sharpe, Sortino, Calmar, beta, alpha, skewness, kurtosis, VaR, средний выигрыш и проигрыш и benchmark считаются в All(), экран читает только доходность, CAGR, долю прибыльных, просадку, profit factor и число сделок. Удалить эти расчёты и хелперы returns/mean/std/covariance, profitFactor оставить.
go/web/js/app.js:L371-L403: yagni: морфинг иконки сайдбара на requestAnimationFrame и массив PANEL_POINTS. Статичная иконка, без анимации пути.
go/internal/store/db.go:L1690-L1708: delete: ListTickers нигде не вызывается. Ничего.
go/web/js/charts.js:L488-L505: delete: Charts.area не вызывается, графики идут через richLine. Ничего.
go/internal/store/live_persist.go:L676-L690: delete: OpenTradeForSymbol нигде не вызывается. Ничего.
go/internal/robinhood/bars.go:L159-L173: delete: ChunkStrings зовут только тесты, прод режет пачки сам. Ничего.
go/internal/httpapi/server.go:L1546-L1559: delete: filterHiddenTrades заменён на filterPositions и не вызывается. Ничего.
go/internal/live/telegram_t11.go:L120-L133: delete: tradeStateLabel и комментарий к нему нигде не вызываются. Ничего.
go/internal/live/trade_record.go:L331-L343: delete: execJournalSQL нигде не вызывается, ошибки журнала пишет logJournalSQLError. Ничего.
go/internal/types/types.go:L158-L169: yagni: в PerformanceMetrics лежат Sharpe, Sortino, Calmar, beta, alpha, skewness, kurtosis, VaR, averageWin, averageLoss, их не показывает сетка метрик. Оставить profitFactor и totalTrades.
go/internal/types/metrics_json.go:L21-L32: yagni: MarshalJSON пишет те же неиспользуемые коэффициенты. Оставить totalReturn, cagr, maxDrawdown, winRate, profitFactor, totalTrades.
go/web/js/app.js:L766-L775: delete: cssHistogram нигде не вызывается, гистограммы рисует Charts.histogram. Ничего.
go/internal/tradingdate/date.go:L42-L51: delete: FormatDisplay с веткой locale нигде не вызывается. Ничего.
go/internal/httpapi/splits_apply.go:L63-L69: delete: persistDataset нигде не вызывается, запись идёт через persistDatasetWithSplitsApplied. Ничего.
go/internal/live/sizing.go:L239-L244: delete: extractEntryBaseCapital нигде не вызывается. Ничего.
go/internal/live/config.go:L208-L213: delete: cfgFloatOr нигде не вызывается, пороги IBS читают liveLowIBS и liveHighIBS. Ничего.
go/internal/store/db.go:L1266-L1271: delete: nullI нигде не вызывается, рядом живые nullF и nullS. Ничего.
go/web/js/app.js:L4919-L4922: delete: paintCandles нигде не вызывается, свечи рисует Charts.candles напрямую. Ничего.
go/web/js/app.js:L457-L460: delete: pickField нигде не вызывается, значения берёт firstDefined. Ничего.
go/internal/httpapi/server.go:L62-L64: yagni: New только зовёт NewWithProviders, вызовов нет. Звать NewWithProviders.
go/web/js/app.js:L143-L158: delete: пути иконок activity, wallet и logout никто не подставляет. Удалить три ключа PATHS.
go/web/js/app.js:L805-L807: delete: defaultTickers нигде не вызывается. Ничего.
go/web/css/extra.css:L69-L69: delete: классы splits-mobile, splits-table, splits-empty-mobile нигде не стоят. Ничего.
go/web/css/extra.css:L483-L483: delete: класс top-8 нигде не стоит. Ничего.
net: -476 lines, -0 deps possible.
